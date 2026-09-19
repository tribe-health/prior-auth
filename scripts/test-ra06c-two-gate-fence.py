#!/usr/bin/env python3
"""Tier 1 local proof for two Gate authority replicas over Postgres and Redis."""

import argparse
import fcntl
import hashlib
import hmac
import http.server
import importlib.util
import json
import os
from pathlib import Path
import re
import secrets
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.parse
import urllib.error
import urllib.request
import uuid

from ra06c_gate_build_inputs import controlled_gate_build_env, gate_build_inputs


ROOT = Path(__file__).resolve().parents[1]
GATE_ROOT = Path(os.environ.get("RA06_GATE_SOURCE_ROOT", ROOT.parents[2] / "prometheus/flint-gate"))
AUTHORITY_FIXTURE = ROOT / "scripts/test-ra06c-authority-migration.py"
SPEC = importlib.util.spec_from_file_location("aso_authority_migration_fixture", AUTHORITY_FIXTURE)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("authority_migration_fixture_unavailable")
authority_fixture = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(authority_fixture)

OUTPUT = (
    ROOT
    / ".kbd-orchestrator/phases/runtime-architecture/children/"
    "ra06-revocation-contract-repair/evidence/task-4-two-gate-fence.json"
)
REDIS_IMAGE = (
    "redis@sha256:becdda6c7f4b3fb42e42fd7f120bbf5c54c4caaaf16f26da24e4563d2c1f0576"
)
GATE_TEST_BINARY = os.environ.get("RA06C04_GATE_TEST_BINARY")
DOCKER_TOOL = os.environ.get("RA06_TOOL_DOCKER", "docker")
CARGO_TOOL = os.environ.get("RA06_TOOL_CARGO", "cargo")


def gate_test_command(name):
    if GATE_TEST_BINARY:
        return [GATE_TEST_BINARY, name, "--ignored", "--exact", "--nocapture"]
    return [
        CARGO_TOOL,
        "test",
        "--manifest-path",
        str(GATE_ROOT / "Cargo.toml"),
        "-p",
        "flint-gate-core",
        "--all-features",
        name,
        "--",
        "--ignored",
        "--exact",
        "--nocapture",
    ]


TWO_GATE_TEST = gate_test_command(
    "cache::redis_fence::tests::two_gate_replicas_reject_stale_authority",
)
ATOMIC_FENCE_TEST = gate_test_command(
    "cache::redis_fence::tests::atomic_fence_and_versioned_sessions",
)


class QuietHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, _format, *_args):
        return


class AuthorityHandler(QuietHandler):
    deny = threading.Event()
    deny_tenant_a = threading.Event()
    delay_clinical = threading.Event()
    delay_grant = threading.Event()
    delay_kratos = threading.Event()
    delay_sequential = threading.Event()

    identity_id = uuid.UUID(int=1)
    session_id = uuid.UUID(int=2)
    practice_id = uuid.UUID(int=3)
    identity_b_id = uuid.UUID(int=4)
    session_b_id = uuid.UUID(int=5)
    practice_b_id = uuid.UUID(int=6)
    call_lock = threading.Lock()
    whoami_calls = {"tenant-a": 0, "tenant-b": 0}

    @classmethod
    def reset_calls(cls):
        with cls.call_lock:
            cls.whoami_calls = {"tenant-a": 0, "tenant-b": 0}

    @classmethod
    def call_snapshot(cls):
        with cls.call_lock:
            return dict(cls.whoami_calls)

    def do_POST(self):
        length = int(self.headers.get("content-length", "0"))
        if length:
            self.rfile.read(length)
        if self.delay_sequential.is_set():
            time.sleep(3)
        elif self.delay_clinical.is_set():
            time.sleep(10)
        tenant_a_denied = self.deny_tenant_a.is_set() and (
            "synthetic-mounted-session" in self.headers.get("cookie", "")
        )
        self.send_response(403 if self.deny.is_set() or tenant_a_denied else 204)
        self.end_headers()

    def do_GET(self):
        path = urllib.parse.urlsplit(self.path).path
        if path == "/sessions/whoami":
            if self.delay_kratos.is_set():
                time.sleep(10)
            tenant_b = "tenant-b-session" in self.headers.get("cookie", "")
            label = "tenant-b" if tenant_b else "tenant-a"
            with self.call_lock:
                self.whoami_calls[label] += 1
            body = json.dumps(
                {
                    "id": str(self.session_b_id if tenant_b else self.session_id),
                    "active": True,
                    "expires_at": "2099-01-01T00:00:00Z",
                    "identity": {
                        "id": str(self.identity_b_id if tenant_b else self.identity_id)
                    },
                }
            ).encode()
        elif path == "/api/session/replica-grant":
            if self.delay_sequential.is_set():
                time.sleep(3)
            elif self.delay_grant.is_set():
                time.sleep(10)
            body = json.dumps(
                {
                    "identityId": str(self.identity_id),
                    "originatingSessionId": str(self.session_id),
                    "practiceId": str(self.practice_id),
                    "authorizationRevision": "membership:synthetic",
                    "projectionRevision": 5,
                    "expiresAt": "2099-01-01T00:00:00Z",
                    "projections": [
                        {"id": "annotation_types"},
                        {"id": "annotations"},
                        {"id": "cases"},
                        {"id": "case_evidence"},
                        {"id": "evidence_states"},
                        {"id": "evidence_citations"},
                        {"id": "document_statuses"},
                    ],
                }
            ).encode()
        else:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except BrokenPipeError:
            pass


class UpstreamHandler(QuietHandler):
    def do_GET(self):
        body = b"mounted-upstream-ok"
        self.send_response(200)
        self.send_header("content-type", "text/plain")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def free_loopback_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.bind(("127.0.0.1", 0))
        return listener.getsockname()[1]


def authority_fence_key(source_key):
    hasher = hashlib.sha256()
    for part in (b"source", source_key.encode()):
        hasher.update(len(part).to_bytes(8, "big"))
        hasher.update(part)
    return f"flint:v2:authority:{{{hasher.hexdigest()}}}:fence"


def http_status(url, headers=None, timeout=6):
    request = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            response.read()
            return response.status
    except urllib.error.HTTPError as error:
        error.read()
        return error.code
    except TimeoutError:
        return None


def http_status_and_json(url, headers=None, timeout=6):
    request = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read()
            status = response.status
    except urllib.error.HTTPError as error:
        body = error.read()
        status = error.code
    except TimeoutError:
        return None, {}
    try:
        return status, json.loads(body) if body else {}
    except json.JSONDecodeError:
        return status, {}


def http_json_response(url, method, payload, timeout=6):
    body = json.dumps(payload).encode()
    request = urllib.request.Request(
        url,
        data=body,
        method=method,
        headers={"content-type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            response_body = response.read()
            return response.status, json.loads(response_body) if response_body else {}
    except urllib.error.HTTPError as error:
        response_body = error.read()
        try:
            decoded = json.loads(response_body) if response_body else {}
        except json.JSONDecodeError:
            decoded = {}
        return error.code, decoded

authority_fixture.gate_fixture.SOURCE_FILES = (
    "migrations/server/2026090609_durable_session_authority.sql",
    "docker/bootstrap/25-session-authority.sql",
    "docker/bootstrap/27-gate-authority-event-reader.sql",
    "migrations/server/2026090612_gate_authority_function_boundary.sql",
    "docker/bootstrap/28-gate-authority-function-boundary.sql",
    "crates/aso-web-server/src/migrations.rs",
    "scripts/test-gate-transaction.py",
    "scripts/test-ra06c-authority-migration.py",
    "scripts/test-ra06c-two-gate-fence.py",
    "scripts/ra06c_gate_build_inputs.py",
)


class TwoGateFenceProbe(authority_fixture.AuthorityMigrationProbe):
    def __init__(self, args):
        super().__init__(args)
        if os.environ.get("RA06_CANDIDATE_DIGEST") and not GATE_TEST_BINARY:
            raise RuntimeError("candidate Gate test binary is required")
        self.redis_container = "synthetic-ra06c02-" + uuid.uuid4().hex
        self.redis_port = free_loopback_port()
        self.report.update(
            scope=(
                "Two independent Gate authority consumers plus two mounted Gate proxy "
                "processes sharing a disposable ASO Postgres source, durable Gate cursor "
                "database and Redis fence"
            ),
            commands=[
                "RUSTUP_TOOLCHAIN=1.98.1 RA06C04_GATE_BINARY=<candidate-artifact> "
                "python3 scripts/test-ra06c-two-gate-fence.py",
                "docker compose port db 5432",
                "docker compose exec -T db printenv POSTGRES_PASSWORD (captured only)",
                "docker run --detach --rm --publish 127.0.0.1::6379 "
                + REDIS_IMAGE
                + " redis-server --save '' --appendonly no",
                " ".join(ATOMIC_FENCE_TEST),
                " ".join(TWO_GATE_TEST),
                "cargo build --manifest-path <flint-gate>/Cargo.toml -p flint-gate "
                "--all-features --message-format=json",
                "<flint-gate-binary> --config <per-replica-config> --require-database",
            ],
            candidate_digest=os.environ.get("RA06_CANDIDATE_DIGEST"),
            frozen_test_artifact=(
                {
                    "path": GATE_TEST_BINARY,
                    "sha256": hashlib.sha256(Path(GATE_TEST_BINARY).read_bytes()).hexdigest(),
                }
                if GATE_TEST_BINARY
                else None
            ),
            environment_contract={
                "test": [
                    "RA06C02_ASO_READER_DATABASE_URL",
                    "RA06C02_ASO_OWNER_DATABASE_URL",
                    "RA06C02_GATE_DATABASE_URL",
                    "RA06C02_REDIS_URL",
                    "CARGO_TARGET_DIR",
                ],
                "credentials": (
                    "Disposable passwords supplied only through environment or captured SQL stdin"
                ),
            },
            unverified=[
                "Tauri, final FRF body delivery, UI and physical devices are outside this "
                "focused Gate proof."
            ],
        )
        self.report["companion_source_sha256"][
            "crates/flint-gate-core/src/cache/redis_fence.rs"
        ] = hashlib.sha256(
            (GATE_ROOT / "crates/flint-gate-core/src/cache/redis_fence.rs").read_bytes()
        ).hexdigest()
        for timing_source in (
            "crates/flint-gate-core/src/middleware/pipeline.rs",
            "crates/flint-gate-core/src/middleware/aso_clinical_authorize.rs",
            "crates/flint-gate-core/src/middleware/aso_replica_grant.rs",
            "crates/flint-gate-core/src/auth/kratos.rs",
            "crates/flint-gate-core/src/authz/engine.rs",
            "crates/flint-gate-core/src/admin/mod.rs",
            "crates/flint-gate-core/src/config/loader.rs",
            "crates/flint-gate/src/main.rs",
        ):
            self.report["companion_source_sha256"][timing_source] = hashlib.sha256(
                (GATE_ROOT / timing_source).read_bytes()
            ).hexdigest()
        self.report["redis"] = {
            "image": REDIS_IMAGE,
            "persistence": "disabled",
            "loopback_only": True,
        }

    def start_redis(self, label="disposable_redis"):
        self.mark(label)
        started = subprocess.run(
            [
                DOCKER_TOOL,
                "run",
                "--detach",
                "--rm",
                "--name",
                self.redis_container,
                "--label",
                "aso.fixture=ra06c02",
                "--publish",
                f"127.0.0.1:{self.redis_port}:6379",
                REDIS_IMAGE,
                "redis-server",
                "--save",
                "",
                "--appendonly",
                "no",
            ],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=60,
        )
        self.check(label + "_started", started.returncode == 0)
        published = subprocess.run(
            [DOCKER_TOOL, "port", self.redis_container, "6379/tcp"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=20,
        )
        port_check = "redis_port_discovery" if label == "disposable_redis" else label + "_port_discovery"
        self.check(port_check, published.returncode == 0)
        port = int(published.stdout.strip().splitlines()[0].rsplit(":", 1)[1])
        for _ in range(100):
            ping = subprocess.run(
                [DOCKER_TOOL, "exec", self.redis_container, "redis-cli", "PING"],
                cwd=ROOT,
                capture_output=True,
                text=True,
                timeout=5,
            )
            if ping.returncode == 0 and ping.stdout.strip() == "PONG":
                self.check(label + "_ready", True)
                return f"redis://127.0.0.1:{port}/"
            time.sleep(0.05)
        self.check(label + "_ready", False)
        raise AssertionError(label + "_ready")

    def redis_cli(self, *arguments, require_success=True):
        completed = subprocess.run(
            [DOCKER_TOOL, "exec", self.redis_container, "redis-cli", "--raw", *arguments],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=10,
        )
        if require_success and completed.returncode:
            raise RuntimeError("redis_command_failed")
        return completed

    def cache_snapshots(self, admin_ports):
        snapshots = []
        for port in admin_ports:
            status, body = http_status_and_json(f"http://127.0.0.1:{port}/cache/stats")
            snapshots.append(body if status == 200 else {})
        return snapshots

    def wait_for_cache_mode(self, admin_ports, mode, timeout=8):
        deadline = time.monotonic() + timeout
        snapshots = []
        while time.monotonic() < deadline:
            snapshots = self.cache_snapshots(admin_ports)
            if len(snapshots) == 2 and all(
                snapshot.get("authority_cache") == mode for snapshot in snapshots
            ):
                return snapshots
            time.sleep(0.05)
        return snapshots

    def mounted_statuses(self, proxy_ports, cookie):
        return [
            http_status(
                f"http://127.0.0.1:{port}/protected/case",
                headers={"cookie": f"ory_kratos_session={cookie}"},
            )
            for port in proxy_ports
        ]

    def exercise_gate_consumer(self):
        self.mark("two_gate_authority_fence")
        password = secrets.token_urlsafe(36)
        helper = authority_fixture.gate_fixture
        self.sql(
            "postgres",
            "CREATE ROLE "
            + helper.identifier(self.reader_login)
            + " LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE "
            "NOREPLICATION NOBYPASSRLS PASSWORD "
            + helper.literal(password)
            + ";",
        )
        self.created_reader_login = True
        self.sql(
            "postgres",
            "GRANT aso_authority_event_reader TO "
            + helper.identifier(self.reader_login)
            + ";",
        )
        self.sql(
            "postgres",
            "CREATE DATABASE " + helper.identifier(self.gate_database) + ";",
        )
        self.created_gate_database = True
        parsed = urllib.parse.urlsplit(self.admin_url)
        address = parsed.netloc.rsplit("@", 1)[1]
        reader_url = (
            "postgresql://"
            + urllib.parse.quote(self.reader_login, safe="")
            + ":"
            + urllib.parse.quote(password, safe="")
            + "@"
            + address
            + "/"
            + self.name
        )
        gate_url = (
            "postgresql://"
            + urllib.parse.quote(self.args.postgres_user, safe="")
            + ":"
            + urllib.parse.quote(parsed.password or "", safe="")
            + "@"
            + address
            + "/"
            + self.gate_database
        )
        redis_url = self.start_redis()
        env = os.environ.copy()
        env.update(
            {
                "RA06C02_ASO_READER_DATABASE_URL": reader_url,
                "RA06C02_ASO_OWNER_DATABASE_URL": self.admin_url,
                "RA06C02_GATE_DATABASE_URL": gate_url,
                "RA06C02_REDIS_URL": redis_url,
                "CARGO_TARGET_DIR": "/tmp/ra06c02-gate-target",
            }
        )
        atomic, atomic_entry = self.run_process(
            "atomic_authority_fence", ATOMIC_FENCE_TEST, env
        )
        atomic_output = atomic.stdout + "\n" + atomic.stderr
        atomic_assertions = [
            line.strip()
            for line in atomic_output.splitlines()
            if re.fullmatch(r"authority_fence_check: [a-z][a-z0-9_]*", line.strip())
        ]
        atomic_results = [
            line.strip()
            for line in atomic_output.splitlines()
            if re.fullmatch(
                r"test cache::redis_fence::tests::atomic_fence_and_versioned_sessions "
                r"\.\.\. (ok|FAILED)",
                line.strip(),
            )
        ]
        atomic_entry["actual_result_output"] = atomic_assertions + atomic_results
        if atomic.returncode != 0:
            atomic_entry["failure_output"] = atomic_output.splitlines()[-80:]
        self.check(
            "atomic_authority_fence",
            atomic.returncode == 0
            and len(atomic_assertions) == 6
            and atomic_results
            == [
                "test cache::redis_fence::tests::atomic_fence_and_versioned_sessions ... ok"
            ],
            return_code=atomic.returncode,
            assertion_count=len(atomic_assertions),
        )
        completed, entry = self.run_process(
            "two_gate_authority_fence", TWO_GATE_TEST, env
        )
        output = completed.stdout + "\n" + completed.stderr
        assertions = [
            line.strip()
            for line in output.splitlines()
            if re.fullmatch(r"two_gate_fence_check: [a-z][a-z0-9_]*", line.strip())
        ]
        result_lines = [
            line.strip()
            for line in output.splitlines()
            if re.fullmatch(
                r"test cache::redis_fence::tests::two_gate_replicas_reject_stale_authority "
                r"\.\.\. (ok|FAILED)",
                line.strip(),
            )
        ]
        entry["actual_result_output"] = assertions + result_lines
        if completed.returncode != 0:
            entry["failure_output"] = output.splitlines()[-80:]
        self.check(
            "two_gate_authority_fence",
            completed.returncode == 0
            and len(assertions) == 10
            and result_lines
            == [
                "test cache::redis_fence::tests::two_gate_replicas_reject_stale_authority "
                "... ok"
            ],
            return_code=completed.returncode,
            assertion_count=len(assertions),
        )
        self.exercise_mounted_gate_processes(env, reader_url, gate_url, redis_url)

    def exercise_mounted_gate_processes(self, env, reader_url, gate_url, redis_url):
        self.mark("mounted_two_gate_protected_denial")
        candidate_executable = os.environ.get("RA06C04_GATE_BINARY")
        if candidate_executable:
            executable = candidate_executable
            executable_exists = Path(executable).is_file()
            self.report["processes"].append(
                {
                    "label": "use_candidate_mounted_gate_binary",
                    "command": ["<candidate-flint-gate-binary>"],
                    "return_code": 0 if executable_exists else 1,
                    "actual_result_output": (
                        ["mounted_gate_check: candidate_binary_bound"]
                        if executable_exists
                        else []
                    ),
                }
            )
            build_mode = "candidate-frozen"
            build_inputs = None
        else:
            build_command = [
                CARGO_TOOL,
                "build",
                "--locked",
                "--manifest-path",
                str(GATE_ROOT / "Cargo.toml"),
                "-p",
                "flint-gate",
                "--all-features",
                "--message-format=json",
            ]
            controlled_build = os.environ.get("RA06C02_SHARED_MOUNTED_BUILD") != "1"
            build_env = controlled_gate_build_env(env) if controlled_build else env
            build_inputs = gate_build_inputs(GATE_ROOT, build_env) if controlled_build else None
            built, build_entry = self.run_process(
                "build_mounted_gate_binary", build_command, build_env
            )
            executable = None
            for line in built.stdout.splitlines():
                try:
                    message = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if (
                    message.get("reason") == "compiler-artifact"
                    and message.get("target", {}).get("name") == "flint-gate"
                    and message.get("executable")
                ):
                    executable = message["executable"]
            build_entry["actual_result_output"] = [
                "mounted_gate_check: binary_built"
            ] if built.returncode == 0 and executable else []
            executable_exists = built.returncode == 0 and executable is not None
            build_mode = "controlled" if controlled_build else "shared-negative-control"
        if executable is not None and executable_exists:
            self.report["mounted_build"] = {
                "mode": build_mode,
                "inputs": build_inputs,
                "executable_path": executable,
                "executable_sha256": hashlib.sha256(Path(executable).read_bytes()).hexdigest(),
                "launch_sha256": [],
            }
        self.check(
            "mounted_gate_binary_built",
            executable_exists,
            source=build_mode,
        )

        AuthorityHandler.deny.clear()
        AuthorityHandler.deny_tenant_a.clear()
        AuthorityHandler.delay_clinical.clear()
        AuthorityHandler.delay_grant.clear()
        AuthorityHandler.delay_kratos.clear()
        AuthorityHandler.delay_sequential.clear()
        callback_port = free_loopback_port()
        upstream_port = free_loopback_port()
        callback_server = http.server.ThreadingHTTPServer(
            ("127.0.0.1", callback_port), AuthorityHandler
        )
        upstream_server = http.server.ThreadingHTTPServer(
            ("127.0.0.1", upstream_port), UpstreamHandler
        )
        callback_thread = threading.Thread(target=callback_server.serve_forever, daemon=True)
        upstream_thread = threading.Thread(target=upstream_server.serve_forever, daemon=True)
        callback_thread.start()
        upstream_thread.start()

        proxy_ports = [free_loopback_port(), free_loopback_port()]
        admin_ports = [free_loopback_port(), free_loopback_port()]
        processes = []
        config_paths = []
        log_paths = []
        log_handles = []
        reader_disabled = False
        identity_key_path = os.environ.get("RA06C_MANIFEST_HMAC_KEY")
        if os.environ.get("RA06_CANDIDATE_DIGEST") and not identity_key_path:
            raise RuntimeError("candidate per-replica configuration identity key is required")
        identity_key = (
            Path(identity_key_path).read_bytes()
            if identity_key_path
            else secrets.token_bytes(32)
        )
        self.report["mounted_effective_configurations"] = []

        def write_effective_config(path, value, label):
            content = (
                value.encode()
                if isinstance(value, str)
                else (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()
            )
            path.write_bytes(content)
            self.report["mounted_effective_configurations"].append(
                {
                    "label": label,
                    "size": len(content),
                    "exact_hmac_sha256": hmac.new(
                        identity_key, content, hashlib.sha256
                    ).hexdigest(),
                    "top_level_keys": sorted(value) if isinstance(value, dict) else [],
                }
            )

        try:
            with tempfile.TemporaryDirectory(prefix="ra06c02-mounted-") as directory:
                for index, (proxy_port, admin_port) in enumerate(
                    zip(proxy_ports, admin_ports, strict=True), start=1
                ):
                    config = {
                        "server": {
                            "listen": f"127.0.0.1:{proxy_port}",
                            "admin_listen": f"127.0.0.1:{admin_port}",
                            "strict_agent_governance": False,
                        },
                        "jwt": {
                            "signing_algorithm": "HS256",
                            "signing_key_secret": "synthetic-mounted-test-secret-key",
                            "issuer": "https://gate.test",
                            "default_ttl_seconds": 60,
                        },
                        "database": {
                            "url": gate_url,
                            "max_connections": 2,
                            "override_yaml": False,
                        },
                        "authority": {
                            "enabled": True,
                            "database_url": reader_url,
                            "source_key": "aso",
                            "max_connections": 2,
                        },
                        "cache": {
                            "l1": {"max_capacity": 100, "ttl_seconds": 60},
                            "l2": {"enabled": True, "redis_url": redis_url},
                            "invalidation_channel": "flintgate_config_changed",
                        },
                        "auth_providers": {
                            "mounted": {
                                "type": "kratos",
                                "base_url": f"http://127.0.0.1:{callback_port}",
                                "issuer": "https://identity.test",
                                "forward_cookies": True,
                                "session_cookie": "ory_kratos_session",
                            },
                            "anonymous-deadline": {
                                "type": "anonymous",
                                "default_subject": "anonymous-deadline",
                            },
                        },
                        "sites": [
                            {
                                "id": "mounted",
                                "domains": [],
                                "default_auth": "mounted",
                                "default_upstream": f"http://127.0.0.1:{upstream_port}",
                            }
                        ],
                        "routes": [
                            {
                                "id": "mounted-protected",
                                "site": "mounted",
                                "match": {"path": "/protected/**", "methods": []},
                                "upstream": f"http://127.0.0.1:{upstream_port}",
                                "auth": "mounted",
                                "hooks": {
                                    "pre_request": [
                                        {
                                            "type": "aso_clinical_authorize",
                                            "config": {
                                                "url": f"http://127.0.0.1:{callback_port}/internal/gate/authorize"
                                            },
                                        }
                                    ]
                                },
                                "stream": {},
                                "priority": 1,
                                "enabled": True,
                            },
                            {
                                "id": "mounted-replica-grant",
                                "site": "mounted",
                                "match": {"path": "/replica/**", "methods": []},
                                "upstream": f"http://127.0.0.1:{upstream_port}",
                                "auth": "mounted",
                                "hooks": {
                                    "pre_request": [
                                        {
                                            "type": "claims_enhancement",
                                            "config": {
                                                "inject_headers": {},
                                                "aso_replica_grant": {
                                                    "url": f"http://127.0.0.1:{callback_port}/api/session/replica-grant",
                                                    "audience": "frf-gateway",
                                                    "max_ttl_seconds": 60,
                                                },
                                            },
                                        }
                                    ]
                                },
                                "stream": {},
                                "priority": 1,
                                "enabled": True,
                            },
                            {
                                "id": "mounted-combined-authority",
                                "site": "mounted",
                                "match": {"path": "/combined/**", "methods": []},
                                "upstream": f"http://127.0.0.1:{upstream_port}",
                                "auth": "mounted",
                                "hooks": {
                                    "pre_request": [
                                        {
                                            "type": "aso_clinical_authorize",
                                            "config": {
                                                "url": f"http://127.0.0.1:{callback_port}/internal/gate/authorize"
                                            },
                                        },
                                        {
                                            "type": "claims_enhancement",
                                            "config": {
                                                "inject_headers": {},
                                                "aso_replica_grant": {
                                                    "url": f"http://127.0.0.1:{callback_port}/api/session/replica-grant",
                                                    "audience": "frf-gateway",
                                                    "max_ttl_seconds": 60,
                                                },
                                            },
                                        },
                                    ]
                                },
                                "stream": {},
                                "priority": 1,
                                "enabled": True,
                            },
                            {
                                "id": "mounted-budget-before-clinical",
                                "site": "mounted",
                                "match": {
                                    "path": "/budget-before-clinical/**",
                                    "methods": [],
                                },
                                "upstream": f"http://127.0.0.1:{upstream_port}",
                                "auth": "mounted",
                                "hooks": {
                                    "pre_request": [
                                        {
                                            "type": "max_token_budget",
                                            "config": {
                                                "limit": 100000,
                                                "user_id_expr": "identity.id",
                                                "window": "hour",
                                                "scope": "user",
                                            },
                                        },
                                        {
                                            "type": "aso_clinical_authorize",
                                            "config": {
                                                "url": f"http://127.0.0.1:{callback_port}/internal/gate/authorize"
                                            },
                                        },
                                    ]
                                },
                                "stream": {},
                                "priority": 1,
                                "enabled": True,
                            },
                            {
                                "id": "mounted-anonymous-budget-before-clinical",
                                "site": "mounted",
                                "match": {
                                    "path": "/anonymous-budget-before-clinical/**",
                                    "methods": [],
                                },
                                "upstream": f"http://127.0.0.1:{upstream_port}",
                                "auth": "anonymous-deadline",
                                "hooks": {
                                    "pre_request": [
                                        {
                                            "type": "max_token_budget",
                                            "config": {
                                                "limit": 100000,
                                                "user_id_expr": "identity.id",
                                                "window": "hour",
                                                "scope": "user",
                                            },
                                        },
                                        {
                                            "type": "aso_clinical_authorize",
                                            "config": {
                                                "url": f"http://127.0.0.1:{callback_port}/internal/gate/authorize"
                                            },
                                        },
                                    ]
                                },
                                "stream": {},
                                "priority": 1,
                                "enabled": True,
                            },
                        ],
                    }
                    config_path = Path(directory) / f"gate-{index}.json"
                    write_effective_config(config_path, config, f"replica-{index}-launch")
                    config_paths.append(config_path)
                    log_path = Path(directory) / f"gate-{index}.log"
                    log_paths.append(log_path)
                    log_handle = log_path.open("w")
                    log_handles.append(log_handle)
                    gate_env = env.copy()
                    gate_env.update(
                        {
                            "RUST_LOG": "warn",
                            "REPLICA_COUNT": "2",
                        }
                    )
                    launch_sha256 = hashlib.sha256(Path(executable).read_bytes()).hexdigest()
                    self.report["mounted_build"]["launch_sha256"].append(launch_sha256)
                    processes.append(
                        subprocess.Popen(
                            [executable, "--config", str(config_path), "--require-database"],
                            cwd=GATE_ROOT,
                            env=gate_env,
                            stdout=log_handle,
                            stderr=log_handle,
                            start_new_session=True,
                        )
                    )

                self.check(
                    "mounted_processes_use_built_binary",
                    self.report["mounted_build"]["launch_sha256"]
                    == [self.report["mounted_build"]["executable_sha256"]] * 2,
                    executable_sha256=self.report["mounted_build"]["executable_sha256"],
                    launch_sha256=self.report["mounted_build"]["launch_sha256"],
                )

                for process, port in zip(processes, proxy_ports, strict=True):
                    deadline = time.monotonic() + 15
                    while time.monotonic() < deadline:
                        if process.poll() is not None:
                            break
                        try:
                            if http_status(f"http://127.0.0.1:{port}/health", timeout=1) == 200:
                                break
                        except OSError:
                            pass
                        time.sleep(0.05)
                    self.check(
                        f"mounted_gate_{port}_ready",
                        process.poll() is None
                        and http_status(f"http://127.0.0.1:{port}/health", timeout=1) == 200,
                    )

                mounted_policy_id = "ra06c-mounted-fenced-policy"
                admin_policy_status, _ = http_json_response(
                    f"http://127.0.0.1:{admin_ports[0]}/policies",
                    "POST",
                    {
                        "id": mounted_policy_id,
                        "policy_text": "permit(principal, action, resource);",
                        "enabled": True,
                    },
                )
                self.check(
                    "mounted_admin_policy_uses_fenced_publication",
                    admin_policy_status == 200,
                    status=admin_policy_status,
                )
                peer_policy_deadline = time.monotonic() + 3
                peer_policy_published = False
                while time.monotonic() < peer_policy_deadline and not peer_policy_published:
                    simulate_status, simulated = http_json_response(
                        f"http://127.0.0.1:{admin_ports[1]}/policies/simulate",
                        "POST",
                        {
                            "principal": 'User::"mounted"',
                            "action": 'Action::"call_tool"',
                            "resource": 'Route::"mounted"',
                        },
                    )
                    peer_policy_published = simulate_status == 200 and any(
                        str(reason).startswith(mounted_policy_id)
                        for reason in simulated.get("reasons", [])
                    )
                    if not peer_policy_published:
                        time.sleep(0.05)
                self.check(
                    "mounted_peer_observes_admin_policy_through_fence",
                    peer_policy_published,
                )

                headers = {"cookie": "ory_kratos_session=synthetic-mounted-session"}
                initial_statuses = [
                    http_status(
                        f"http://127.0.0.1:{port}/protected/case",
                        headers=headers,
                    )
                    for port in proxy_ports
                ]
                self.check(
                    "mounted_two_processes_allow_before_revocation",
                    initial_statuses == [200, 200],
                    statuses=initial_statuses,
                )
                self.check(
                    "mounted_replica_grant_allows_before_revocation",
                    http_status(
                        f"http://127.0.0.1:{proxy_ports[0]}/replica/case"
                        f"?practiceId={AuthorityHandler.practice_id}",
                        headers=headers,
                    )
                    == 200,
                )
                self.check(
                    "mounted_combined_hooks_allow_before_revocation",
                    http_status(
                        f"http://127.0.0.1:{proxy_ports[0]}/combined/case"
                        f"?practiceId={AuthorityHandler.practice_id}",
                        headers=headers,
                    )
                    == 200,
                )

                original_config = json.loads(config_paths[0].read_text())
                changed_config = json.loads(json.dumps(original_config))
                changed_config["routes"][0]["enabled"] = False
                changed_config["auth_providers"]["mounted"]["base_url"] = (
                    "http://127.0.0.1:9"
                )
                changed_config["agent_tool_policies"] = [
                    {
                        "agent": "mounted-file-agent",
                        "allow": [],
                        "deny": ["file-tool"],
                    }
                ]

                restart_message = "configuration file changed — restart required"

                def restart_notice_count():
                    log_handles[0].flush()
                    return log_paths[0].read_text().count(restart_message)

                def wait_for_restart_notice(previous_count):
                    deadline = time.monotonic() + 5
                    while time.monotonic() < deadline:
                        count = restart_notice_count()
                        if count > previous_count:
                            return count
                        time.sleep(0.05)
                    return restart_notice_count()

                previous_notices = restart_notice_count()
                write_effective_config(config_paths[0], "{", "replica-1-malformed-reload")
                next_notices = wait_for_restart_notice(previous_notices)
                malformed_change_reported = next_notices > previous_notices

                previous_notices = next_notices
                write_effective_config(config_paths[0], original_config, "replica-1-valid-restore")
                next_notices = wait_for_restart_notice(previous_notices)
                valid_restore_reported = next_notices > previous_notices

                previous_notices = next_notices
                write_effective_config(config_paths[0], '{"server":', "replica-1-partial-reload")
                time.sleep(0.05)
                write_effective_config(config_paths[0], changed_config, "replica-1-valid-reload")
                next_notices = wait_for_restart_notice(previous_notices)
                partial_then_valid_reported = next_notices > previous_notices

                previous_notices = next_notices
                replacement_path = config_paths[0].with_suffix(".replacement")
                write_effective_config(replacement_path, changed_config, "replica-1-atomic-replacement")
                os.replace(replacement_path, config_paths[0])
                next_notices = wait_for_restart_notice(previous_notices)
                atomic_replace_reported = next_notices > previous_notices

                link_path = config_paths[0].with_suffix(".link")
                symlink_rotation_results = []
                for rotation in range(12):
                    target_directory = Path(directory) / f"mounted-target-{rotation}"
                    target_directory.mkdir()
                    target_path = target_directory / "gate.json"
                    write_effective_config(
                        target_path,
                        changed_config,
                        f"replica-1-symlink-rotation-{rotation + 1}",
                    )
                    link_path.symlink_to(target_path)
                    previous_notices = next_notices
                    os.replace(link_path, config_paths[0])
                    next_notices = wait_for_restart_notice(previous_notices)
                    symlink_rotation_results.append(next_notices > previous_notices)

                symlink_transition_reported = symlink_rotation_results[0]
                symlink_rotation_reported = all(symlink_rotation_results[1:])
                symlink_rotation_count = len(symlink_rotation_results)

                restart_logged = all(
                    (
                        malformed_change_reported,
                        valid_restore_reported,
                        partial_then_valid_reported,
                        atomic_replace_reported,
                        symlink_transition_reported,
                        symlink_rotation_reported,
                        symlink_rotation_count == 12,
                    )
                )
                self.check(
                    "mounted_effective_configurations_identity_bound",
                    len(self.report["mounted_effective_configurations"]) == 19
                    and all(
                        len(item["exact_hmac_sha256"]) == 64
                        for item in self.report["mounted_effective_configurations"]
                    ),
                    identity_count=len(self.report["mounted_effective_configurations"]),
                    identity_method="candidate-keyed HMAC-SHA256",
                )

                reload_policy_status, _ = http_json_response(
                    f"http://127.0.0.1:{admin_ports[1]}/policies",
                    "POST",
                    {
                        "id": "ra06c-mounted-file-change-publication",
                        "policy_text": "permit(principal, action, resource);",
                        "enabled": True,
                    },
                )
                file_config_status = http_status(
                    f"http://127.0.0.1:{proxy_ports[0]}/protected/case",
                    headers=headers,
                )
                sugar_status, sugar_simulation = http_json_response(
                    f"http://127.0.0.1:{admin_ports[0]}/policies/simulate",
                    "POST",
                    {
                        "principal": 'Agent::"mounted-file-agent"',
                        "action": 'Action::"call_tool"',
                        "resource": 'Route::"file-tool"',
                    },
                )
                self.check(
                    "mounted_file_config_change_requires_restart",
                    restart_logged
                    and reload_policy_status == 200
                    and file_config_status == 200
                    and sugar_status == 200
                    and sugar_simulation.get("decision") == "Allow",
                    restart_logged=restart_logged,
                    malformed_change_reported=malformed_change_reported,
                    valid_restore_reported=valid_restore_reported,
                    partial_then_valid_reported=partial_then_valid_reported,
                    atomic_replace_reported=atomic_replace_reported,
                    symlink_transition_reported=symlink_transition_reported,
                    symlink_rotation_reported=symlink_rotation_reported,
                    symlink_rotation_count=symlink_rotation_count,
                    database_publication_status=reload_policy_status,
                    protected_status=file_config_status,
                    cedar_decision=sugar_simulation.get("decision"),
                    log_tail=log_paths[0].read_text()[-4000:],
                )

                AuthorityHandler.delay_kratos.set()
                started = time.monotonic()
                kratos_timeout_status, kratos_timeout_body = http_status_and_json(
                    f"http://127.0.0.1:{proxy_ports[0]}/protected/case",
                    headers={"cookie": "ory_kratos_session=uncached-slow-session"},
                )
                kratos_timeout_ms = round((time.monotonic() - started) * 1000, 3)
                AuthorityHandler.delay_kratos.clear()
                self.check(
                    "mounted_kratos_timeout_within_5000ms",
                    kratos_timeout_status == 503
                    and kratos_timeout_ms < 5000
                    and kratos_timeout_body.get("error")
                    == "authority_decision_unavailable",
                    status=kratos_timeout_status,
                    elapsed_ms=kratos_timeout_ms,
                    response_error=kratos_timeout_body.get("error"),
                )

                AuthorityHandler.delay_clinical.set()
                started = time.monotonic()
                clinical_timeout_status, clinical_timeout_body = http_status_and_json(
                    f"http://127.0.0.1:{proxy_ports[0]}/protected/case",
                    headers=headers,
                )
                clinical_timeout_ms = round((time.monotonic() - started) * 1000, 3)
                AuthorityHandler.delay_clinical.clear()
                self.check(
                    "mounted_clinical_timeout_within_5000ms",
                    clinical_timeout_status == 503
                    and clinical_timeout_ms < 5000
                    and clinical_timeout_body.get("error")
                    == "authority_decision_unavailable",
                    status=clinical_timeout_status,
                    elapsed_ms=clinical_timeout_ms,
                    response_error=clinical_timeout_body.get("error"),
                )

                AuthorityHandler.delay_grant.set()
                started = time.monotonic()
                grant_timeout_status, grant_timeout_body = http_status_and_json(
                    f"http://127.0.0.1:{proxy_ports[0]}/replica/case"
                    f"?practiceId={AuthorityHandler.practice_id}",
                    headers=headers,
                )
                grant_timeout_ms = round((time.monotonic() - started) * 1000, 3)
                AuthorityHandler.delay_grant.clear()
                self.check(
                    "mounted_replica_grant_timeout_within_5000ms",
                    grant_timeout_status == 503
                    and grant_timeout_ms < 5000
                    and grant_timeout_body.get("error")
                    == "authority_decision_unavailable",
                    status=grant_timeout_status,
                    elapsed_ms=grant_timeout_ms,
                    response_error=grant_timeout_body.get("error"),
                )

                AuthorityHandler.delay_sequential.set()
                started = time.monotonic()
                sequential_timeout_status, sequential_timeout_body = http_status_and_json(
                    f"http://127.0.0.1:{proxy_ports[0]}/combined/case"
                    f"?practiceId={AuthorityHandler.practice_id}",
                    headers=headers,
                )
                sequential_timeout_ms = round((time.monotonic() - started) * 1000, 3)
                AuthorityHandler.delay_sequential.clear()
                self.check(
                    "mounted_sequential_hooks_timeout_within_5000ms",
                    sequential_timeout_status == 503
                    and sequential_timeout_ms < 5000
                    and sequential_timeout_body.get("error")
                    == "authority_decision_unavailable",
                    status=sequential_timeout_status,
                    elapsed_ms=sequential_timeout_ms,
                    response_error=sequential_timeout_body.get("error"),
                )

                poisoned_budget_keys = [
                    "flint:budget:user:"
                    + str(AuthorityHandler.identity_id)
                    + ":hour",
                    "flint:budget:user:anonymous-deadline:hour",
                ]
                poisoned_results = [
                    subprocess.run(
                        [
                            DOCKER_TOOL,
                            "exec",
                            self.redis_container,
                            "redis-cli",
                            "LPUSH",
                            key,
                            "synthetic-wrong-type",
                        ],
                        cwd=ROOT,
                        capture_output=True,
                        text=True,
                        timeout=5,
                    )
                    for key in poisoned_budget_keys
                ]
                self.check(
                    "mounted_preceding_hook_redis_fallback_injected",
                    all(result.returncode == 0 for result in poisoned_results),
                    return_codes=[result.returncode for result in poisoned_results],
                )
                lock_process = subprocess.Popen(
                    [
                        DOCKER_TOOL,
                        "compose",
                        "exec",
                        "-T",
                        "db",
                        "psql",
                        "-U",
                        self.args.postgres_user,
                        "-X",
                        "-A",
                        "-t",
                        "-q",
                        "-v",
                        "ON_ERROR_STOP=1",
                        "-d",
                        self.gate_database,
                    ],
                    cwd=ROOT,
                    stdin=subprocess.PIPE,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                )
                assert lock_process.stdin is not None
                lock_process.stdin.write(
                    "BEGIN; LOCK TABLE usage_events IN ACCESS EXCLUSIVE MODE; "
                    "SELECT pg_sleep(15); ROLLBACK;\n"
                )
                lock_process.stdin.close()
                lock_process.stdin = None
                lock_observed = False
                lock_deadline = time.monotonic() + 3
                helper = authority_fixture.gate_fixture
                while time.monotonic() < lock_deadline and not lock_observed:
                    observed = self.sql(
                        "postgres",
                        "SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname="
                        + helper.literal(self.gate_database)
                        + " AND state='active' AND query LIKE '%SELECT pg_sleep(15)%');",
                    )
                    lock_observed = observed.stdout.strip() == "t"
                    if not lock_observed:
                        time.sleep(0.05)
                self.check("mounted_preceding_hook_database_lock_observed", lock_observed)
                started = time.monotonic()
                preceding_hook_status, preceding_hook_body = http_status_and_json(
                    f"http://127.0.0.1:{proxy_ports[0]}/budget-before-clinical/case",
                    headers=headers,
                )
                preceding_hook_timeout_ms = round(
                    (time.monotonic() - started) * 1000, 3
                )
                started = time.monotonic()
                (
                    anonymous_preceding_hook_status,
                    anonymous_preceding_hook_body,
                ) = http_status_and_json(
                    f"http://127.0.0.1:{proxy_ports[0]}"
                    "/anonymous-budget-before-clinical/case"
                )
                anonymous_preceding_hook_timeout_ms = round(
                    (time.monotonic() - started) * 1000, 3
                )
                self.sql(
                    "postgres",
                    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname="
                    + helper.literal(self.gate_database)
                    + " AND query LIKE '%SELECT pg_sleep(15)%';",
                    False,
                )
                lock_process.wait(timeout=5)
                self.check(
                    "mounted_preceding_hook_timeout_within_5000ms",
                    preceding_hook_status == 503
                    and preceding_hook_timeout_ms < 5000
                    and preceding_hook_body.get("error")
                    == "authority_decision_unavailable",
                    status=preceding_hook_status,
                    elapsed_ms=preceding_hook_timeout_ms,
                    response_error=preceding_hook_body.get("error"),
                )
                self.check(
                    "mounted_anonymous_preceding_hook_timeout_within_5000ms",
                    anonymous_preceding_hook_status == 503
                    and anonymous_preceding_hook_timeout_ms < 5000
                    and anonymous_preceding_hook_body.get("error")
                    == "authority_decision_unavailable",
                    response_error=anonymous_preceding_hook_body.get("error"),
                    status=anonymous_preceding_hook_status,
                    elapsed_ms=anonymous_preceding_hook_timeout_ms,
                )

                helper = authority_fixture.gate_fixture
                self.sql(
                    "postgres",
                    "ALTER ROLE " + helper.identifier(self.reader_login) + " NOLOGIN;",
                )
                reader_disabled = True
                self.sql(
                    self.name,
                    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename="
                    + helper.literal(self.reader_login)
                    + " AND pid <> pg_backend_pid();",
                )

                bypass_deadline = time.monotonic() + 3
                bypass_states = [False, False]
                while time.monotonic() < bypass_deadline and not all(bypass_states):
                    for index, port in enumerate(admin_ports):
                        try:
                            with urllib.request.urlopen(
                                f"http://127.0.0.1:{port}/cache/stats", timeout=1
                            ) as response:
                                stats = json.loads(response.read())
                            bypass_states[index] = stats.get("authority_cache") == "bypass"
                        except (OSError, ValueError):
                            pass
                    if not all(bypass_states):
                        time.sleep(0.05)
                self.check(
                    "stalled_consumers_disable_both_process_caches",
                    all(bypass_states),
                    cache_bypass=bypass_states,
                )

                AuthorityHandler.deny.set()
                denial_statuses = []
                denial_milliseconds = []
                for port in proxy_ports:
                    started = time.monotonic()
                    denial_statuses.append(
                        http_status(
                            f"http://127.0.0.1:{port}/protected/case",
                            headers=headers,
                        )
                    )
                    denial_milliseconds.append(round((time.monotonic() - started) * 1000, 3))
                self.check(
                    "mounted_two_process_fresh_denial_within_5000ms",
                    denial_statuses == [403, 403]
                    and all(elapsed < 5000 for elapsed in denial_milliseconds),
                    statuses=denial_statuses,
                    elapsed_ms=denial_milliseconds,
                    process_count=len(processes),
                )

                self.sql(
                    "postgres",
                    "ALTER ROLE " + helper.identifier(self.reader_login) + " LOGIN;",
                )
                reader_disabled = False
                AuthorityHandler.deny.clear()
                ready_after_stall = self.wait_for_cache_mode(admin_ports, "ready")
                self.check(
                    "mounted_consumers_recover_after_stall",
                    all(item.get("authority_cache") == "ready" for item in ready_after_stall),
                    cache_states=ready_after_stall,
                )

                AuthorityHandler.reset_calls()
                tenant_a_warm = self.mounted_statuses(proxy_ports, "synthetic-mounted-session")
                tenant_b_warm = self.mounted_statuses(proxy_ports, "tenant-b-session")
                self.check(
                    "mounted_two_tenant_sessions_warm_independently",
                    tenant_a_warm == [200, 200] and tenant_b_warm == [200, 200],
                    tenant_a=tenant_a_warm,
                    tenant_b=tenant_b_warm,
                )
                sequence_before_denial = max(
                    int(item.get("authority_applied_sequence", 0))
                    for item in self.cache_snapshots(admin_ports)
                )

                denial_insert = self.sql(
                    self.name,
                    """
                    WITH expiry AS (
                      SELECT clock_timestamp() + interval '1 day' AS value
                    )
                    INSERT INTO aso.session_denials(
                      deployment_id, kratos_issuer, kratos_session_id,
                      session_expires_at, skew_allowance, retain_until,
                      confirmation_state, next_attempt_at
                    )
                    SELECT deployment_id, 'https://identity.test/',
                           '00000000-0000-0000-0000-000000000002',
                           expiry.value, interval '1 second',
                           expiry.value + interval '1 second',
                           'pending', clock_timestamp()
                      FROM aso.authority_deployment, expiry
                     WHERE singleton=true;
                    """,
                )
                self.check(
                    "mounted_tenant_a_durable_denial_committed",
                    denial_insert.returncode == 0,
                )
                caught_up_after_denial = []
                catch_up_deadline = time.monotonic() + 5
                while time.monotonic() < catch_up_deadline:
                    caught_up_after_denial = self.cache_snapshots(admin_ports)
                    if all(
                        item.get("authority_cache") == "ready"
                        and int(item.get("authority_applied_sequence", 0))
                        > sequence_before_denial
                        for item in caught_up_after_denial
                    ):
                        break
                    time.sleep(0.05)
                self.check(
                    "mounted_both_consumers_apply_tenant_a_denial_event",
                    len(caught_up_after_denial) == 2
                    and all(
                        item.get("authority_cache") == "ready"
                        and int(item.get("authority_applied_sequence", 0))
                        > sequence_before_denial
                        for item in caught_up_after_denial
                    ),
                    sequence_before=sequence_before_denial,
                    cache_states=caught_up_after_denial,
                )
                AuthorityHandler.deny_tenant_a.set()
                tenant_deadline = time.monotonic() + 5
                tenant_a_after = []
                tenant_b_after = []
                while time.monotonic() < tenant_deadline:
                    tenant_a_after = self.mounted_statuses(
                        proxy_ports, "synthetic-mounted-session"
                    )
                    tenant_b_after = self.mounted_statuses(proxy_ports, "tenant-b-session")
                    if tenant_a_after == [403, 403] and tenant_b_after == [200, 200]:
                        break
                    time.sleep(0.05)
                self.check(
                    "mounted_cross_tenant_denial_isolated_on_both_replicas",
                    tenant_a_after == [403, 403] and tenant_b_after == [200, 200],
                    tenant_a=tenant_a_after,
                    tenant_b=tenant_b_after,
                )

                fence_keys = self.redis_cli(
                    "KEYS", "flint:v2:authority:*:fence"
                ).stdout.splitlines()
                deployment_id = self.report["authority_identity"]["deployment_id"]
                fence_key = authority_fence_key("aso")
                fence_deployment = self.redis_cli(
                    "HGET", fence_key, "deployment"
                ).stdout.strip()
                self.check(
                    "mounted_shared_authority_fence_discovered",
                    fence_key in fence_keys and fence_deployment == deployment_id,
                    key_count=len(fence_keys),
                    source_key="aso",
                )
                old_fence = self.redis_cli("HGETALL", fence_key).stdout.splitlines()
                self.check(
                    "mounted_old_fence_snapshot_captured",
                    len(old_fence) >= 8 and len(old_fence) % 2 == 0,
                    field_count=len(old_fence) // 2,
                )

                removed = subprocess.run(
                    [DOCKER_TOOL, "rm", "--force", self.redis_container],
                    cwd=ROOT,
                    capture_output=True,
                    text=True,
                    timeout=20,
                )
                self.check("mounted_redis_partition_injected", removed.returncode == 0)
                self.sql(
                    self.name,
                    "UPDATE aso.capabilities SET description=description WHERE false;",
                )
                partition_bypass = self.wait_for_cache_mode(admin_ports, "bypass")
                AuthorityHandler.deny.set()
                partition_statuses = self.mounted_statuses(
                    proxy_ports, "tenant-b-session"
                )
                self.check(
                    "mounted_lost_notification_partition_forces_fresh_denial",
                    all(item.get("authority_cache") == "bypass" for item in partition_bypass)
                    and all(status != 200 for status in partition_statuses),
                    cache_states=partition_bypass,
                    statuses=partition_statuses,
                )

                self.start_redis("mounted_empty_restart_redis")
                AuthorityHandler.deny.clear()
                empty_ready = self.wait_for_cache_mode(admin_ports, "ready")
                empty_a = self.mounted_statuses(proxy_ports, "synthetic-mounted-session")
                empty_b = self.mounted_statuses(proxy_ports, "tenant-b-session")
                self.check(
                    "mounted_empty_restart_bootstraps_both_replicas",
                    all(item.get("authority_cache") == "ready" for item in empty_ready)
                    and empty_a == [403, 403]
                    and empty_b == [200, 200],
                    cache_states=empty_ready,
                    tenant_a=empty_a,
                    tenant_b=empty_b,
                )

                current_fence = self.redis_cli("HGETALL", fence_key).stdout.splitlines()
                self.sql(
                    "postgres",
                    "ALTER ROLE " + helper.identifier(self.reader_login) + " NOLOGIN;",
                )
                reader_disabled = True
                self.sql(
                    self.name,
                    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename="
                    + helper.literal(self.reader_login)
                    + " AND pid <> pg_backend_pid();",
                )
                self.redis_cli("DEL", fence_key)
                self.redis_cli("HSET", fence_key, *old_fence)
                old_bypass = self.wait_for_cache_mode(admin_ports, "bypass")
                calls_before_refill = AuthorityHandler.call_snapshot()
                AuthorityHandler.deny.set()
                stale_refill_statuses = self.mounted_statuses(
                    proxy_ports, "tenant-b-session"
                )
                calls_after_refill = AuthorityHandler.call_snapshot()
                self.check(
                    "mounted_restored_old_fence_rejects_delayed_refill",
                    current_fence != old_fence
                    and all(item.get("authority_cache") == "bypass" for item in old_bypass)
                    and all(status != 200 for status in stale_refill_statuses)
                    and calls_after_refill["tenant-b"] > calls_before_refill["tenant-b"],
                    cache_states=old_bypass,
                    statuses=stale_refill_statuses,
                    fresh_identity_calls=(
                        calls_after_refill["tenant-b"] - calls_before_refill["tenant-b"]
                    ),
                )

                self.sql(
                    "postgres",
                    "ALTER ROLE " + helper.identifier(self.reader_login) + " LOGIN;",
                )
                reader_disabled = False
                AuthorityHandler.deny.clear()
                restored_ready = self.wait_for_cache_mode(admin_ports, "ready")
                restored_a = self.mounted_statuses(
                    proxy_ports, "synthetic-mounted-session"
                )
                restored_b = self.mounted_statuses(proxy_ports, "tenant-b-session")
                self.check(
                    "mounted_old_fence_requires_bootstrap_before_recovery",
                    all(item.get("authority_cache") == "ready" for item in restored_ready)
                    and restored_a == [403, 403]
                    and restored_b == [200, 200],
                    cache_states=restored_ready,
                    tenant_a=restored_a,
                    tenant_b=restored_b,
                )

                invalidation_channel = fence_key.removesuffix(":fence") + ":invalidate"
                fence_before_duplicates = self.redis_cli("HGETALL", fence_key).stdout
                for payload in ("older", "duplicate", "older"):
                    self.redis_cli("PUBLISH", invalidation_channel, payload)
                time.sleep(0.3)
                duplicate_a = self.mounted_statuses(
                    proxy_ports, "synthetic-mounted-session"
                )
                duplicate_b = self.mounted_statuses(proxy_ports, "tenant-b-session")
                fence_after_duplicates = self.redis_cli("HGETALL", fence_key).stdout
                self.check(
                    "mounted_reordered_duplicate_notifications_cannot_regress_fence",
                    fence_after_duplicates == fence_before_duplicates
                    and duplicate_a == [403, 403]
                    and duplicate_b == [200, 200],
                    tenant_a=duplicate_a,
                    tenant_b=duplicate_b,
                )

                foreign_deployment = uuid.uuid4()
                foreign = self.sql(
                    self.name,
                    """
                    WITH expiry AS (
                      SELECT clock_timestamp() + interval '1 day' AS value
                    )
                    INSERT INTO aso.session_denials(
                      deployment_id, kratos_issuer, kratos_session_id,
                      session_expires_at, skew_allowance, retain_until,
                      confirmation_state, next_attempt_at
                    )
                    SELECT '"""
                    + str(foreign_deployment)
                    + """', 'https://identity.test', 'foreign-session',
                           expiry.value, interval '1 second',
                           expiry.value + interval '1 second',
                           'pending', clock_timestamp()
                      FROM expiry;
                    """,
                    False,
                )
                foreign_a = self.mounted_statuses(
                    proxy_ports, "synthetic-mounted-session"
                )
                foreign_b = self.mounted_statuses(proxy_ports, "tenant-b-session")
                self.check(
                    "mounted_foreign_deployment_rejected_without_cross_tenant_effect",
                    foreign.returncode != 0
                    and foreign_a == [403, 403]
                    and foreign_b == [200, 200],
                    insert_return_code=foreign.returncode,
                    tenant_a=foreign_a,
                    tenant_b=foreign_b,
                )
                self.report["processes"].append(
                    {
                        "label": "mounted_two_gate_protected_denial",
                        "command": [
                            "<flint-gate-binary>",
                            "--config",
                            "<per-replica-config>",
                            "--require-database",
                        ],
                        "process_count": len(processes),
                        "return_code": 0,
                        "actual_result_output": [
                            "mounted_gate_check: two_processes_ready",
                            "mounted_gate_check: admin_policy_uses_fenced_publication",
                            "mounted_gate_check: peer_observes_admin_policy_through_fence",
                            "mounted_gate_check: file_config_change_requires_restart",
                            "mounted_gate_check: stalled_consumers_bypass_cache",
                            "mounted_gate_check: fresh_denial_within_5000ms",
                            "mounted_gate_check: clinical_timeout_within_5000ms",
                            "mounted_gate_check: replica_grant_timeout_within_5000ms",
                            "mounted_gate_check: kratos_timeout_within_5000ms",
                            "mounted_gate_check: sequential_hooks_timeout_within_5000ms",
                            "mounted_gate_check: preceding_hook_timeout_within_5000ms",
                            "mounted_gate_check: anonymous_preceding_hook_timeout_within_5000ms",
                            "mounted_gate_check: cross_tenant_denial_isolated",
                            "mounted_gate_check: redis_partition_forces_bypass",
                            "mounted_gate_check: empty_restart_bootstraps",
                            "mounted_gate_check: restored_old_fence_rejects_refill",
                            "mounted_gate_check: duplicate_notifications_do_not_regress",
                            "mounted_gate_check: foreign_deployment_rejected",
                        ],
                    }
                )
        finally:
            AuthorityHandler.deny.clear()
            AuthorityHandler.delay_clinical.clear()
            AuthorityHandler.delay_grant.clear()
            AuthorityHandler.delay_kratos.clear()
            AuthorityHandler.delay_sequential.clear()
            AuthorityHandler.deny_tenant_a.clear()
            if reader_disabled:
                try:
                    helper = authority_fixture.gate_fixture
                    self.sql(
                        "postgres",
                        "ALTER ROLE " + helper.identifier(self.reader_login) + " LOGIN;",
                        False,
                    )
                except Exception:
                    pass
            for process in processes:
                if process.poll() is None:
                    process.terminate()
            for process in processes:
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)
            for log_handle in log_handles:
                log_handle.close()
            callback_server.shutdown()
            upstream_server.shutdown()
            callback_server.server_close()
            upstream_server.server_close()

    def cleanup(self):
        if self.redis_container:
            removed = subprocess.run(
                [DOCKER_TOOL, "rm", "--force", self.redis_container],
                cwd=ROOT,
                capture_output=True,
                text=True,
                timeout=20,
            )
            self.report["cleanup"]["disposable_redis_deleted"] = {
                "result": "Passed" if removed.returncode in (0, 1) else "Failed",
                "return_code": removed.returncode,
            }
        super().cleanup()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--postgres-user", default="flint")
    parser.add_argument("--postgres-port", type=int)
    parser.add_argument("--command-seconds", type=int, default=600)
    parser.add_argument("--install-mode", choices=("fresh", "upgrade"), default="fresh")
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    lock_path = Path(tempfile.gettempdir()) / "aso-gate-transaction-fixture.lock"
    with open(lock_path, "a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("Two-Gate fence probe: another fixture is running", file=sys.stderr)
            return 1
        return TwoGateFenceProbe(args).run()


if __name__ == "__main__":
    sys.exit(main())
