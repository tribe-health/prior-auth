#!/usr/bin/env python3
"""T1: real Gate -> ASO -> Kratos/Postgres, two synthetic identities.

RUSTUP_TOOLCHAIN=1.98.1 python3 scripts/test-session-gateway.py
Uses the existing Gate image and Docker database/Kratos services. Creates only
owned temporary resources. Python PyYAML is required to read the actual route.
"""

import argparse
import datetime
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import yaml


spec = importlib.util.spec_from_file_location("session_boundary", Path(__file__).with_name("test-session-boundary.py"))
boundary = importlib.util.module_from_spec(spec)
spec.loader.exec_module(boundary)
boundary.OUTPUT = boundary.OUTPUT.with_name("gateway-session.json")


class GatewayProbe(boundary.Probe):
    def __init__(self, args):
        super().__init__(args)
        self.second = boundary.Probe(args)
        self.gate = None
        self.config_dir = None
        self.provider = None
        self.provider_thread = None
        self.provider_unavailable = False
        self.trace_count = 0
        self.trace_pids = {"A": set(), "B": set()}
        self.since = datetime.datetime.now(datetime.timezone.utc).isoformat()
        self.report.update(scope="Real disposable Gate and ASO application with two Kratos identities and shared PostgreSQL pool",
                           commands=["RUSTUP_TOOLCHAIN=1.98.1 python3 scripts/test-session-gateway.py"],
                           checks={}, unverified=[
                               "Native UI/IPC, production deployment and HTTP disconnect propagation are not tested.",
                               "Gate collapses repeated same-name credential headers; mixed distinct sources are tested, duplicate-header rejection parity is not claimed.",
                           ])

    def docker(self, *args):
        return subprocess.run(["docker", *args], cwd=boundary.ROOT, capture_output=True,
                              text=True, check=True, timeout=40).stdout.strip()

    def create_identity(self):
        super().create_identity()
        self.second.create_identity()

    def create_database(self):
        super().create_database()
        self.second.home = self.other
        self.sql(self.name, f"""
            INSERT INTO aso.users(id,kratos_identity_id,practice_id,email,full_name)
            VALUES('{self.second.user}','{self.second.identity}','{self.other}',
                   'synthetic-second@example.invalid','Synthetic Session Probe');
            INSERT INTO aso.user_roles(user_id,role_id,practice_id)
            SELECT '{self.second.user}',id,'{self.other}' FROM aso.roles WHERE key='staff';
        """)
        # Instrument only this disposable database. The original SQL function is
        # preserved and called unchanged. Logs contain A/B labels, never tokens
        # or identity UUIDs, and prove the GUC and backend at the real read.
        self.sql(self.name, f"""
            ALTER FUNCTION aso.current_app_user_id() RENAME TO session_probe_original_user_id;
            CREATE FUNCTION aso.current_app_user_id() RETURNS uuid LANGUAGE plpgsql STABLE AS $$
            DECLARE subject text; result uuid;
            BEGIN
                subject := CASE current_setting('aso.kratos_identity_id',true)
                    WHEN '{self.identity}' THEN 'A'
                    WHEN '{self.second.identity}' THEN 'B' ELSE 'NONE' END;
                RAISE LOG '{self.name} pid=% scope=% role=%', pg_backend_pid(), subject, current_user;
                SELECT aso.session_probe_original_user_id() INTO result;
                RETURN result;
            END; $$;
        """)
        self.db_container = self.docker("compose", "ps", "-q", "db")

    def start_app(self):
        owner = self
        real_kratos = boundary.KRATOS

        class Provider(BaseHTTPRequestHandler):
            def do_GET(self):
                if owner.provider_unavailable:
                    status, payload = 503, {"error": "synthetic unavailable provider"}
                else:
                    forwarded = {k: self.headers[k] for k in ("Authorization", "Cookie") if k in self.headers}
                    status, _, payload = owner.http(owner.direct, real_kratos + "/sessions/whoami", headers=forwarded)
                raw = json.dumps(payload).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(raw)

            def log_message(self, *_args):
                pass

        self.provider = ThreadingHTTPServer(("127.0.0.1", 0), Provider)
        self.provider_thread = threading.Thread(target=self.provider.serve_forever, daemon=True)
        self.provider_thread.start()
        try:
            boundary.KRATOS = f"http://127.0.0.1:{self.provider.server_port}"
            super().start_app()
        finally:
            boundary.KRATOS = real_kratos
        self.start_gate()

    def start_gate(self):
        self.mark("mount_existing_gate_image_with_checked_in_session_route")
        container = self.docker("compose", "ps", "-q", "flint-gate")
        image = self.docker("inspect", "--format", "{{.Image}}", container)
        config_path = boundary.ROOT / "docker/flint-gate/config.yaml"
        source = yaml.safe_load(config_path.read_text())
        site = next(s.copy() for s in source["sites"] if s["id"] == "aso-session")
        route = next(r for r in source["routes"] if r["id"] == "aso-session")
        assert route["match"] == {"path": "/api/session", "methods": ["GET"]}
        assert "upstream" not in route and route["auth"] == site["default_auth"] == "passthrough"
        app_port = self.app.rsplit(":", 1)[1]
        site["default_upstream"] = "http://host.docker.internal:" + app_port
        config = {"server": {"listen": "0.0.0.0:4456", "admin_listen": "127.0.0.1:4457"},
                  "database": {"url": ""}, "auth_providers": {"passthrough": source["auth_providers"]["passthrough"]},
                  "sites": [site], "routes": [route]}
        self.config_dir = tempfile.TemporaryDirectory(prefix="aso-session-gate-")
        Path(self.config_dir.name, "config.yaml").write_text(yaml.safe_dump(config))
        self.gate = self.name + "-gate"
        self.docker("run", "-d", "--name", self.gate, "--label", "aso.session-probe=" + self.name,
                    "-p", "127.0.0.1::4456", "-e", "RUST_LOG=error",
                    "--mount", "type=bind,src=" + self.config_dir.name + ",dst=/app/config,readonly", image)
        port = self.docker("port", self.gate, "4456/tcp").rsplit(":", 1)[1]
        self.app = "http://localhost:" + port
        self.report["gate_image_id"] = image
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            try:
                status, _, _ = self.http(self.direct, self.app + "/health")
                if status == 200:
                    return
            except (OSError, ValueError):
                pass
            time.sleep(0.2)
        raise TimeoutError("disposable gate startup")

    def traces(self):
        logs = subprocess.run(["docker", "logs", "--since", self.since, self.db_container],
                              capture_output=True, text=True, check=True, timeout=20)
        # Only controlled fixture markers leave this function. Shared logs are
        # never printed or stored in task evidence.
        return re.findall(re.escape(self.name) + r" pid=(\d+) scope=(A|B|NONE) role=(\S+)", logs.stdout + logs.stderr)

    def expect(self, label, status, subject=None, practice=None, transport="bearer", extra=None):
        headers = {"Host": "localhost:4456"}
        client = self.direct
        if subject:
            if transport == "cookie":
                client = subject.browser
            else:
                headers["Authorization" if transport == "bearer" else "X-Session-Token"] = (
                    "Bearer " + subject.token if transport == "bearer" else subject.token)
        headers.update(extra or {})
        query = "?practiceId=" + practice if practice else ""
        actual, response_headers, body = self.http(client, self.app + "/api/session" + query, headers=headers)
        no_store = response_headers.get("Cache-Control") == "no-store"
        self.report["app_response_count"] += 1
        self.report["no_store_response_count"] += int(no_store)
        valid = actual == status and no_store
        if status == 200:
            session = subject.browser_session if transport == "cookie" else subject.native_session
            expected_caps = boundary.SURGEON_CAPABILITIES if subject is self else self.staff_caps
            revision = self.sql(self.name, "SELECT incarnation::text || ':' || revision::text FROM aso.authorization_revision;").stdout.strip()
            valid = valid and set(body) == boundary.SUMMARY_KEYS and body["identityId"] == subject.identity
            valid = valid and body["userId"] == subject.user and body["practiceId"] == (practice or subject.home)
            valid = valid and body["principal"] == "user" and set(body["capabilities"]) == expected_caps
            valid = valid and body["displayName"] == "Synthetic Session Probe" and body["authorizationRevision"] == revision
            valid = valid and boundary.instant(body["expiresAt"]) == boundary.instant(session["expires_at"])
        else:
            valid = valid and body == {"error": {401: "unauthenticated", 403: "practice_denied", 503: "session_unavailable"}[status]}
        self.report["checks"][label] = {"result": "Failed", "status": actual,
                                          "expected_status": status, "no_store": no_store, "sanitized_contract": valid}
        assert valid, label
        if status == 200:
            wanted = "A" if subject is self else "B"
            deadline = time.monotonic() + 3
            while True:
                events = self.traces()
                current = events[self.trace_count:]
                if current or time.monotonic() >= deadline:
                    break
                time.sleep(0.05)
            assert current and all(scope == wanted and role == "aso_session_reader" for _, scope, role in current)
            self.trace_pids[wanted].update(pid for pid, _, _ in current)
            self.report["checks"][label]["verified_database_context"] = wanted
        self.trace_count = len(self.traces())
        self.report["checks"][label]["result"] = "Passed"
        return body

    def exercise(self):
        self.mark("two_identities_through_gate_with_shared_pool")
        caps = self.sql(self.name, f"SELECT capability_key FROM aso.user_capabilities WHERE user_id='{self.second.user}' ORDER BY capability_key;").stdout.splitlines()
        self.staff_caps = set(caps)
        assert caps and self.staff_caps != boundary.SURGEON_CAPABILITIES
        self.expect("anonymous", 401)
        for label, subject in (("A", self), ("B", self.second)):
            for transport in ("bearer", "x-session-token", "cookie"):
                self.expect(label + "_" + transport, 200, subject, subject.home, transport)
        for index, subject in enumerate([self, self, self.second, self.second, self.second, self] * 2):
            self.expect("alternating_pool_" + str(index), 200, subject)
        assert self.trace_pids["A"] & self.trace_pids["B"], "both identities must actually reuse a backend"
        self.report["pool_reuse"] = {"result": "Passed", "backend_counts": {k: len(v) for k, v in self.trace_pids.items()},
                                    "shared_backend_count": len(self.trace_pids["A"] & self.trace_pids["B"])}
        forged = {"X-User-Id": self.second.user, "X-Practice-Id": self.other, "X-Role": "administrator",
                  "X-Flint-Identity-Id": self.second.identity, "X-Flint-Identity-Traits": '{"role":"administrator"}'}
        self.expect("spoof_without_credential", 401, extra=forged)
        self.expect("spoof_with_A_credential", 200, self, extra=forged)
        self.expect("A_foreign_practice", 403, self, self.other)
        self.expect("B_foreign_practice", 403, self.second, self.home)
        self.expect("mixed_identity_tokens", 401, self, extra={"X-Session-Token": self.second.token})
        self.sql(self.name, f"DELETE FROM aso.user_roles WHERE user_id='{self.second.user}' AND practice_id='{self.other}';")
        self.expect("B_membership_removed", 403, self.second)
        self.expect("A_unaffected_by_B_membership_removal", 200, self)
        self.sql(self.name, f"INSERT INTO aso.user_roles(user_id,role_id,practice_id) SELECT '{self.second.user}',id,'{self.other}' FROM aso.roles WHERE key='staff';")
        self.expect("B_membership_restored", 200, self.second)
        self.sql(self.name, f"UPDATE aso.users SET status='deactivated' WHERE id='{self.user}';")
        self.expect("A_deactivated", 403, self)
        self.expect("B_unaffected_by_A_deactivation", 200, self.second)
        self.provider_unavailable = True
        self.expect("unavailable_Kratos_A", 503, self)
        self.expect("unavailable_Kratos_B", 503, self.second)
        self.expect("anonymous_with_unavailable_Kratos", 401)
        self.provider_unavailable = False
        self.expect("B_after_provider_recovery", 200, self.second)

    def cleanup(self):
        if self.gate:
            try:
                self.docker("rm", "-f", self.gate)
                self.report["cleanup"]["disposable_gate_removed"] = True
            except (subprocess.SubprocessError, OSError):
                self.report["cleanup"]["disposable_gate_removed"] = False
        if self.provider:
            self.provider.shutdown()
            self.provider.server_close()
            self.provider_thread.join(timeout=5)
            self.report["cleanup"]["provider_proxy_stopped"] = not self.provider_thread.is_alive()
        self.second.cleanup()
        self.report["cleanup"].update({"second_" + k: v for k, v in self.second.report["cleanup"].items()})
        super().cleanup()
        if self.config_dir:
            path = self.config_dir.name
            self.config_dir.cleanup()
            self.report["cleanup"]["temporary_gate_config_removed"] = not Path(path).exists()
        if not all(self.report["cleanup"].values()):
            self.report["result"] = "Failed"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--postgres-user", default="flint")
    parser.add_argument("--postgres-port", type=int)
    parser.add_argument("--startup-seconds", type=int, default=180)
    return GatewayProbe(parser.parse_args()).run()


if __name__ == "__main__":
    sys.exit(main())
