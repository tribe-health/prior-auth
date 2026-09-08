#!/usr/bin/env python3
"""RA04 T1: mounted Gate replica-grant fail-closed integration fixture.

The fixture starts the actual debug Gate binary against synthetic in-process
Kratos, ASO grant, and accepting downstream HTTP endpoints. It records whether
the downstream was reached, verifies the successful HS256 token locally, and
proves grant, membership, linkage, credential, and minter failures stop before
the downstream boundary.
"""

import argparse
import base64
import datetime
import hashlib
import hmac
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import yaml


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / ".kbd-orchestrator/phases/runtime-architecture/evidence/ra-04-projection-grants/task-4-mounted-grant.json"
SECRET = "synthetic-ra04-hs256-secret-at-least-32-bytes"


def free_port():
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return listener.getsockname()[1]


def b64url_decode(value):
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class Probe:
    def __init__(self, args):
        self.args = args
        self.identity_id = str(uuid.uuid4())
        self.session_id = str(uuid.uuid4())
        self.practice_id = str(uuid.uuid4())
        self.other_practice_id = str(uuid.uuid4())
        self.callback_status = 200
        self.grant_overrides = {}
        self.mock_calls = {"whoami": 0, "grant": 0, "downstream": 0}
        self.last_grant_headers = {}
        self.last_downstream = {}
        self.last_response_headers = {}
        self.processes = []
        self.tempdirs = []
        self.stage = "initialization"
        self.mock = None
        self.mock_thread = None
        self.client = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
        self.report = {
            "result": "Failed",
            "verification_tier": 1,
            "observed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "scope": "Actual Gate binary with synthetic Kratos/ASO and an accepting downstream",
            "command": "python3 scripts/test-replica-grant.py --gate-binary <debug executable> --output <receipt>",
            "checks": {},
            "cleanup": {},
            "unverified": [
                "RA05 owns the deployed Gate to FRF to Electric facade and continuation protocol.",
                "This fixture validates the mounted Gate boundary but does not claim a production network topology.",
            ],
        }

    def check(self, label, condition, **details):
        self.report["checks"][label] = {
            "result": "Passed" if condition else "Failed",
            **details,
        }
        if not condition:
            raise AssertionError(label)

    def start_mock(self):
        owner = self

        class Handler(BaseHTTPRequestHandler):
            def json_response(self, status, value):
                raw = json.dumps(value).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)

            def do_GET(self):
                parsed = urllib.parse.urlsplit(self.path)
                if parsed.path == "/sessions/whoami":
                    owner.mock_calls["whoami"] += 1
                    self.json_response(200, {
                        "id": owner.session_id,
                        "active": True,
                        "identity": {
                            "id": owner.identity_id,
                            "traits": {"role": "administrator", "table": "aso.patients"},
                            "metadata_public": {"role": "authenticated"},
                            "schema_id": "clinician",
                        },
                        "authenticator_assurance_level": "aal1",
                    })
                    return
                if parsed.path == "/api/session/replica-grant":
                    owner.mock_calls["grant"] += 1
                    owner.last_grant_headers = {
                        key.lower(): value for key, value in self.headers.items()
                    }
                    if owner.callback_status != 200:
                        self.json_response(owner.callback_status, {"error": "synthetic"})
                        return
                    grant = {
                        "identityId": owner.identity_id,
                        "originatingSessionId": owner.session_id,
                        "practiceId": owner.practice_id,
                        "authorizationRevision": "membership:synthetic-ra04",
                        "projectionRevision": 1,
                        "expiresAt": (
                            datetime.datetime.now(datetime.timezone.utc)
                            + datetime.timedelta(minutes=5)
                        ).isoformat(),
                        "projections": [
                            {"id": "cases"},
                            {"id": "case_evidence"},
                            {"id": "evidence_states"},
                            {"id": "evidence_citations"},
                            {"id": "documents"},
                        ],
                    }
                    grant.update(owner.grant_overrides)
                    self.json_response(200, grant)
                    return
                if parsed.path in {"/v1/shape", "/v1/service-shape"}:
                    owner.mock_calls["downstream"] += 1
                    owner.last_downstream = {
                        "path": self.path,
                        "authorization": self.headers.get("Authorization"),
                    }
                    self.json_response(200, {"accepted": True})
                    return
                self.json_response(404, {"error": "not_found"})

            def log_message(self, *_args):
                pass

        self.mock = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.mock_thread = threading.Thread(target=self.mock.serve_forever, daemon=True)
        self.mock_thread.start()

    def config(self, proxy_port, admin_port, with_minter):
        origin = f"http://127.0.0.1:{self.mock.server_port}"
        config = {
            "server": {
                "listen": f"127.0.0.1:{proxy_port}",
                "admin_listen": f"127.0.0.1:{admin_port}",
                "strict_agent_governance": True,
            },
            "database": {"url": ""},
            "auth_providers": {
                "kratos": {
                    "type": "kratos",
                    "base_url": origin,
                    "forward_cookies": True,
                    "session_cookie": "ory_kratos_session",
                },
                "anonymous": {"type": "anonymous", "default_subject": "service"},
            },
            "sites": [{
                "id": "replica",
                "domains": [f"127.0.0.1:{proxy_port}", f"localhost:{proxy_port}"],
                "default_auth": "kratos",
                "default_upstream": origin,
            }],
            "routes": [
                {
                    "id": "replica-shape",
                    "site": "replica",
                    "match": {"path": "/v1/shape", "methods": ["GET"]},
                    "auth": "kratos",
                    "hooks": {"pre_request": [{
                        "type": "claims_enhancement",
                        "config": {"aso_replica_grant": {
                            "url": origin + "/api/session/replica-grant",
                            "audience": "frf-gateway",
                            "max_ttl_seconds": 60,
                        }},
                    }]},
                },
                {
                    "id": "service-shape",
                    "site": "replica",
                    "match": {"path": "/v1/service-shape", "methods": ["GET"]},
                    "auth": "anonymous",
                    "hooks": {"pre_request": [{
                        "type": "claims_enhancement",
                        "config": {"aso_replica_grant": {
                            "url": origin + "/api/session/replica-grant",
                            "audience": "frf-gateway",
                            "max_ttl_seconds": 60,
                        }},
                    }]},
                },
            ],
        }
        if with_minter:
            config["jwt"] = {
                "signing_algorithm": "HS256",
                "signing_key_secret": SECRET,
                "issuer": "https://gate.synthetic.invalid",
                "default_ttl_seconds": 300,
            }
        return config

    def spawn_gate(self, label, with_minter):
        proxy_port, admin_port = free_port(), free_port()
        while proxy_port == admin_port:
            admin_port = free_port()
        directory = tempfile.TemporaryDirectory(prefix="aso-ra04-gate-")
        self.tempdirs.append(directory)
        config_path = Path(directory.name, "config.yaml")
        config_path.write_text(yaml.safe_dump(self.config(proxy_port, admin_port, with_minter)))
        env = os.environ.copy()
        for key in list(env):
            if key == "DATABASE_URL" or key.startswith("FLINT_"):
                env.pop(key)
        env.update({"FLINT_GATE_CONFIG": str(config_path), "RUST_LOG": "error"})
        log = tempfile.TemporaryFile()
        process = subprocess.Popen(
            [str(self.args.gate_binary)],
            cwd=self.args.gate_binary.parent,
            env=env,
            stdin=subprocess.DEVNULL,
            stdout=log,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
        entry = {"label": label, "process": process, "log": log}
        self.processes.append(entry)
        deadline = time.monotonic() + self.args.startup_seconds
        while time.monotonic() < deadline:
            if process.poll() is not None:
                raise RuntimeError(label + "_exited_before_readiness")
            try:
                status, _, _ = self.http(f"http://127.0.0.1:{admin_port}/health")
                if status == 200:
                    return f"http://127.0.0.1:{proxy_port}"
            except (OSError, urllib.error.URLError):
                pass
            time.sleep(0.1)
        raise TimeoutError(label + "_readiness_deadline")

    def http(self, url, headers=None):
        request = urllib.request.Request(url, headers=headers or {}, method="GET")
        try:
            response = self.client.open(request, timeout=10)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            raw = response.read()
            payload = json.loads(raw) if raw else {}
            return response.status, response.headers, payload

    def request(self, origin, path, expected, headers=None, label=None):
        before = self.mock_calls["downstream"]
        status, response_headers, payload = self.http(origin + path, headers=headers)
        self.last_response_headers = {
            key.lower(): value for key, value in response_headers.items()
        }
        reached = self.mock_calls["downstream"] > before
        self.check(
            label or path,
            status == expected,
            status=status,
            expected_status=expected,
            downstream_reached=reached,
        )
        return payload, reached

    def decode_token(self, token):
        parts = token.split(".")
        if len(parts) != 3:
            raise AssertionError("jwt_segments")
        signed = (parts[0] + "." + parts[1]).encode()
        expected = hmac.new(SECRET.encode(), signed, hashlib.sha256).digest()
        if not hmac.compare_digest(expected, b64url_decode(parts[2])):
            raise AssertionError("jwt_signature")
        return json.loads(b64url_decode(parts[1]))

    def exercise(self):
        self.stage = "start_mock_endpoints"
        self.start_mock()
        headers = {
            "Authorization": "Bearer synthetic-ra04-session",
            "X-Flint-Role": "administrator",
            "X-ASO-Columns": "patient_id",
        }
        query = (
            "?practiceId=" + self.practice_id
            + "&table=aso.patients&where=true&columns=patient_id"
        )

        self.stage = "mounted_gate_with_required_minter"
        gate = self.spawn_gate("gate_with_minter", True)
        _, reached = self.request(gate, "/v1/shape" + query, 200, headers, "valid_grant_reaches_downstream")
        self.check("valid_grant_reaches_downstream_once", reached and self.mock_calls["downstream"] == 1)
        authorization = self.last_downstream.get("authorization", "")
        self.check("inbound_credential_is_replaced", authorization.startswith("Bearer ") and authorization != headers["Authorization"])
        claims = self.decode_token(authorization.removeprefix("Bearer "))
        expected_keys = {
            "iss", "sub", "aud", "iat", "exp", "jti", "scope", "tenant_id",
            "authorization_revision", "originating_session_id",
            "projection_revision", "projection_ids",
        }
        self.check(
            "mounted_token_has_exact_allowlist",
            set(claims) == expected_keys
            and claims["scope"] == "aso.replica.read"
            and claims["tenant_id"] == self.practice_id
            and claims["originating_session_id"] == self.session_id
            and claims["projection_ids"] == [
                "cases", "case_evidence", "evidence_states", "evidence_citations", "documents"
            ],
            claim_count=len(claims),
        )
        forwarded = set(self.last_grant_headers)
        self.check(
            "grant_callback_receives_only_raw_credential_authority",
            "authorization" in forwarded
            and "x-flint-role" not in forwarded
            and "x-aso-columns" not in forwarded,
        )

        before = self.mock_calls["downstream"]
        self.callback_status = 403
        payload, reached = self.request(gate, "/v1/shape" + query, 403, headers, "membership_denial_stops_before_downstream")
        self.check("membership_denial_has_no_pass_through", not reached and self.mock_calls["downstream"] == before)
        self.check(
            "membership_denial_response_is_private",
            self.last_response_headers.get("cache-control") == "no-store"
            and "Cookie" in self.last_response_headers.get("vary", "")
            and payload == {"error": "replica_grant_denied"},
        )

        self.callback_status = 503
        _, reached = self.request(gate, "/v1/shape" + query, 503, headers, "membership_resolution_failure_stops_before_downstream")
        self.check("membership_failure_has_no_pass_through", not reached and self.mock_calls["downstream"] == before)

        self.callback_status = 200
        self.grant_overrides = {"originatingSessionId": str(uuid.uuid4())}
        _, reached = self.request(gate, "/v1/shape" + query, 403, headers, "invented_session_linkage_is_refused")
        self.check("invented_linkage_has_no_pass_through", not reached and self.mock_calls["downstream"] == before)
        self.grant_overrides = {}

        _, reached = self.request(
            gate,
            "/v1/shape" + query,
            401,
            {**headers, "Cookie": "ory_kratos_session=synthetic-other"},
            "mixed_credentials_are_refused",
        )
        self.check("mixed_credentials_have_no_pass_through", not reached and self.mock_calls["downstream"] == before)

        grant_calls = self.mock_calls["grant"]
        _, reached = self.request(
            gate,
            "/v1/service-shape?practiceId=" + self.practice_id,
            403,
            {"Authorization": "Bearer synthetic-service-token"},
            "non_session_service_principal_is_refused",
        )
        self.check(
            "service_principal_has_no_callback_or_downstream",
            not reached and self.mock_calls["grant"] == grant_calls and self.mock_calls["downstream"] == before,
        )

        self.stage = "mounted_gate_without_required_minter"
        gate_without_minter = self.spawn_gate("gate_without_minter", False)
        payload, reached = self.request(
            gate_without_minter,
            "/v1/shape" + query,
            503,
            headers,
            "required_minter_absence_stops_before_downstream",
        )
        self.check("mint_failure_has_no_pass_through", not reached and self.mock_calls["downstream"] == before)
        self.check(
            "mint_failure_response_is_private",
            self.last_response_headers.get("cache-control") == "no-store"
            and "Cookie" in self.last_response_headers.get("vary", "")
            and payload == {"error": "replica_grant_unavailable"},
        )

    def cleanup(self):
        for entry in reversed(self.processes):
            process = entry["process"]
            if process.poll() is None:
                try:
                    os.killpg(process.pid, signal.SIGTERM)
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.wait(timeout=10)
                except ProcessLookupError:
                    pass
            entry["log"].close()
            self.report["cleanup"][entry["label"]] = "Passed" if process.poll() is not None else "Failed"
        if self.mock is not None:
            self.mock.shutdown()
            self.mock.server_close()
        if self.mock_thread is not None:
            self.mock_thread.join(timeout=5)
            self.report["cleanup"]["synthetic_http_endpoints"] = "Passed" if not self.mock_thread.is_alive() else "Failed"
        for directory in self.tempdirs:
            directory.cleanup()

    def run(self):
        error = None
        try:
            self.exercise()
            self.report["result"] = "Passed"
        except Exception as caught:
            error = caught
            self.report["failure"] = type(caught).__name__ + ":" + str(caught)
            self.report["failure_stage"] = self.stage
        finally:
            self.cleanup()
            if any(value != "Passed" for value in self.report["cleanup"].values()):
                self.report["result"] = "Failed"
            self.report["observed_counts"] = dict(self.mock_calls)
            self.args.output.parent.mkdir(parents=True, exist_ok=True)
            self.args.output.write_text(json.dumps(self.report, indent=2) + "\n")
        print(json.dumps({
            "result": self.report["result"],
            "checks": len(self.report["checks"]),
            "observed_counts": self.report["observed_counts"],
            "cleanup": self.report["cleanup"],
        }, indent=2))
        return 1 if error is not None or self.report["result"] != "Passed" else 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--gate-binary",
        type=Path,
        default=Path("/Users/gqadonis/Projects/prometheus/flint-gate/target/debug/flint-gate"),
    )
    parser.add_argument("--startup-seconds", type=int, default=60)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    if not args.gate_binary.is_file():
        parser.error("--gate-binary must name the built debug Gate executable")
    return Probe(args).run()


if __name__ == "__main__":
    sys.exit(main())
