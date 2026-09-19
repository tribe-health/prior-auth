#!/usr/bin/env python3
"""Tier 1 local recovery proof for the RA06c distributed Gate authority fence."""

import argparse
import fcntl
import hashlib
import importlib.util
import os
from pathlib import Path
import re
import secrets
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
import urllib.parse


ROOT = Path(__file__).resolve().parents[1]
DOCKER_TOOL = os.environ.get("RA06_TOOL_DOCKER", "docker")
GATE_ROOT = Path(os.environ.get("RA06_GATE_SOURCE_ROOT", ROOT.parents[2] / "prometheus/flint-gate"))
TWO_GATE_FIXTURE = ROOT / "scripts/test-ra06c-two-gate-fence.py"
SPEC = importlib.util.spec_from_file_location("aso_two_gate_fixture", TWO_GATE_FIXTURE)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("two_gate_fixture_unavailable")
two_gate_fixture = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(two_gate_fixture)

OUTPUT = (
    ROOT
    / ".kbd-orchestrator/phases/runtime-architecture/children/"
    "ra06-revocation-contract-repair/evidence/task-5-fence-recovery.json"
)
RECOVERY_TEST = two_gate_fixture.gate_test_command(
    "cache::redis_fence::tests::authority_recovery_requires_snapshot_and_replay",
)

two_gate_fixture.authority_fixture.gate_fixture.SOURCE_FILES = (
    "migrations/server/2026090609_durable_session_authority.sql",
    "docker/bootstrap/25-session-authority.sql",
    "docker/bootstrap/27-gate-authority-event-reader.sql",
    "crates/aso-web-server/src/migrations.rs",
    "scripts/test-gate-transaction.py",
    "scripts/test-ra06c-authority-migration.py",
    "scripts/test-ra06c-two-gate-fence.py",
    "scripts/test-ra06c-fence-recovery.py",
)


def free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.bind(("127.0.0.1", 0))
        return listener.getsockname()[1]


def sanitized_failure_output(output):
    return [
        re.sub(r"(?:postgres(?:ql)?|redis)://\S+", "<redacted-url>", line)
        for line in output.splitlines()[-80:]
    ]


class FenceRecoveryProbe(two_gate_fixture.TwoGateFenceProbe):
    def __init__(self, args):
        super().__init__(args)
        self.redis_port = free_port()
        self.redis_running = False
        self.test_process = None
        self.control_dir = Path(tempfile.mkdtemp(prefix="aso-ra06c02-control-"))
        self.report.update(
            scope=(
                "Consumer freshness expiry, Redis partition, empty restart and restored-old-fence "
                "recovery over disposable ASO/Gate Postgres and Redis"
            ),
            commands=[
                "RUSTUP_TOOLCHAIN=1.98.1 python3 scripts/test-ra06c-fence-recovery.py",
                "docker compose port db 5432",
                "docker compose exec -T db printenv POSTGRES_PASSWORD (captured only)",
                "docker run --detach --rm --publish 127.0.0.1:<ephemeral>:6379 "
                + two_gate_fixture.REDIS_IMAGE
                + " redis-server --save '' --appendonly no",
                "docker rm --force <fixture Redis> (partition injection)",
                " ".join(RECOVERY_TEST),
            ],
            candidate_digest=os.environ.get("RA06_CANDIDATE_DIGEST"),
            frozen_test_artifact=(
                {
                    "path": two_gate_fixture.GATE_TEST_BINARY,
                    "sha256": hashlib.sha256(
                        Path(two_gate_fixture.GATE_TEST_BINARY).read_bytes()
                    ).hexdigest(),
                }
                if two_gate_fixture.GATE_TEST_BINARY
                else None
            ),
            environment_contract={
                "test": [
                    "RA06C02_ASO_READER_DATABASE_URL",
                    "RA06C02_ASO_OWNER_DATABASE_URL",
                    "RA06C02_GATE_DATABASE_URL",
                    "RA06C02_REDIS_URL",
                    "RA06C02_REDIS_CONTROL_DIR",
                    "CARGO_TARGET_DIR",
                ],
                "credentials": (
                    "Disposable passwords supplied only through environment or captured SQL stdin"
                ),
            },
            unverified=[
                "Mounted proxy processes, final FRF body delivery, UI and physical devices are "
                "outside this focused Gate component proof."
            ],
        )
        self.report["redis"].update(
            restart="same loopback port with a new empty digest-pinned container",
            partition="container removed while the Gate cache retained its live connection manager",
        )

    def start_fixed_redis(self, label):
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
                "aso.fixture=ra06c02-recovery",
                "--publish",
                f"127.0.0.1:{self.redis_port}:6379",
                two_gate_fixture.REDIS_IMAGE,
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
        self.redis_running = True
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
                return
            time.sleep(0.05)
        self.check(label + "_ready", False)

    def wait_for_control(self, name, timeout):
        deadline = time.monotonic() + timeout
        path = self.control_dir / name
        while time.monotonic() < deadline:
            if path.is_file():
                return
            if self.test_process is not None and self.test_process.poll() is not None:
                raise RuntimeError("recovery_test_exited_before_" + name.replace("-", "_"))
            time.sleep(0.05)
        raise TimeoutError("control_timeout_" + name.replace("-", "_"))

    def exercise_gate_consumer(self):
        self.mark("fence_recovery")
        password = secrets.token_urlsafe(36)
        helper = two_gate_fixture.authority_fixture.gate_fixture
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
        self.start_fixed_redis("initial_redis")
        env = os.environ.copy()
        env.update(
            {
                "RA06C02_ASO_READER_DATABASE_URL": reader_url,
                "RA06C02_ASO_OWNER_DATABASE_URL": self.admin_url,
                "RA06C02_GATE_DATABASE_URL": gate_url,
                "RA06C02_REDIS_URL": f"redis://127.0.0.1:{self.redis_port}/",
                "RA06C02_REDIS_CONTROL_DIR": str(self.control_dir),
                "CARGO_TARGET_DIR": "/tmp/ra06c02-gate-target",
            }
        )
        entry = {"label": "fence_recovery", "command": RECOVERY_TEST, "return_code": None}
        self.report["processes"].append(entry)
        self.test_process = subprocess.Popen(
            RECOVERY_TEST,
            cwd=ROOT,
            env=env,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            start_new_session=True,
        )
        try:
            self.wait_for_control("partition-ready", 120)
            removed = subprocess.run(
                [DOCKER_TOOL, "rm", "--force", self.redis_container],
                cwd=ROOT,
                capture_output=True,
                text=True,
                timeout=20,
            )
            self.check("redis_partition_injected", removed.returncode == 0)
            self.redis_running = False
            (self.control_dir / "partitioned").write_text("partitioned\n")
            self.wait_for_control("partition-observed", 30)
            self.start_fixed_redis("empty_restart_redis")
            (self.control_dir / "restored-empty").write_text("restored\n")
            stdout, stderr = self.test_process.communicate(timeout=self.args.command_seconds)
        except (Exception, KeyboardInterrupt):
            if self.test_process.poll() is None:
                try:
                    os.killpg(self.test_process.pid, signal.SIGTERM)
                    stdout, stderr = self.test_process.communicate(timeout=10)
                except subprocess.TimeoutExpired:
                    os.killpg(self.test_process.pid, signal.SIGKILL)
                    stdout, stderr = self.test_process.communicate(timeout=10)
                except ProcessLookupError:
                    stdout, stderr = self.test_process.communicate(timeout=10)
            else:
                stdout, stderr = self.test_process.communicate(timeout=10)
            print(
                "\n".join(sanitized_failure_output(stdout + "\n" + stderr)),
                file=sys.stderr,
            )
            raise
        entry["return_code"] = self.test_process.returncode
        output = stdout + "\n" + stderr
        assertions = [
            line.strip()
            for line in output.splitlines()
            if re.fullmatch(r"authority_recovery_check: [a-z][a-z0-9_]*", line.strip())
        ]
        result_lines = [
            line.strip()
            for line in output.splitlines()
            if re.fullmatch(
                r"test cache::redis_fence::tests::authority_recovery_requires_snapshot_and_replay "
                r"\.\.\. (ok|FAILED)",
                line.strip(),
            )
        ]
        entry["actual_result_output"] = assertions + result_lines
        if self.test_process.returncode != 0:
            entry["failure_output"] = sanitized_failure_output(output)
        self.check(
            "fence_recovery",
            self.test_process.returncode == 0
            and len(assertions) == 6
            and result_lines
            == [
                "test cache::redis_fence::tests::authority_recovery_requires_snapshot_and_replay "
                "... ok"
            ],
            return_code=self.test_process.returncode,
            assertion_count=len(assertions),
        )

    def cleanup(self):
        if self.test_process is not None and self.test_process.poll() is None:
            try:
                os.killpg(self.test_process.pid, signal.SIGTERM)
                self.test_process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(self.test_process.pid, signal.SIGKILL)
                self.test_process.wait(timeout=10)
            except ProcessLookupError:
                pass
        super().cleanup()
        shutil.rmtree(self.control_dir, ignore_errors=True)
        self.report["cleanup"]["control_directory_deleted"] = {
            "result": "Passed" if not self.control_dir.exists() else "Failed"
        }


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
            print("Fence recovery probe: another fixture is running", file=sys.stderr)
            return 1
        return FenceRecoveryProbe(args).run()


if __name__ == "__main__":
    sys.exit(main())
