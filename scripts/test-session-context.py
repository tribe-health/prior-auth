#!/usr/bin/env python3
"""Tier 1 task 1.3: transaction lifecycle and mounted provider error/trait contract.

Reuses only the disposable resource owner from test-session-boundary.py. Run:
RUSTUP_TOOLCHAIN=1.98.1 python3 scripts/test-session-context.py
"""

import argparse
import importlib.util
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


spec = importlib.util.spec_from_file_location(
    "session_boundary", Path(__file__).with_name("test-session-boundary.py"))
boundary = importlib.util.module_from_spec(spec)
spec.loader.exec_module(boundary)
boundary.OUTPUT = boundary.OUTPUT.with_name("context-session.json")


class ContextProbe(boundary.Probe):
    def __init__(self, args):
        super().__init__(args)
        self.report["scope"] = "Task 1.3: real PostgreSQL transaction lifecycle and mounted session authority refusals"
        self.report["commands"][0] = "RUSTUP_TOOLCHAIN=1.98.1 python3 scripts/test-session-context.py"
        self.report["unverified"] = [
            "Gate routing, two-identity assembled pool campaign and physical native UI remain later tasks.",
            "Cancellation is proved on the production transaction owner with an active PostgreSQL query; HTTP disconnect propagation is not claimed.",
        ]

    def create_database(self):
        super().create_database()
        self.mark("real_transaction_lifecycle")
        env = dict(os.environ, ASO_TEST_DATABASE_URL=self.database_url,
                   ASO_TEST_IDENTITY_ID=self.identity, ASO_TEST_USER_ID=self.user,
                   ASO_TEST_PRACTICE_ID=self.home)
        command = ["cargo", "test", "-p", "aso-web-server",
                   "session_transaction_context_lifecycle", "--", "--ignored", "--nocapture"]
        self.report["commands"].append(" ".join(command))
        result = subprocess.run(command, cwd=boundary.ROOT, env=env,
                                capture_output=True, text=True, timeout=180)
        markers = [line for line in result.stdout.splitlines()
                   if line.startswith("context check passed:") or line.startswith("test result:")]
        self.report["transaction_test"] = {"exit": result.returncode, "output": markers}
        if result.returncode:
            diagnostic = result.stdout + result.stderr
            for secret in (self.database_url, self.identity, self.user, self.home, self.login):
                diagnostic = diagnostic.replace(secret, "<redacted>")
            self.report["transaction_test"]["diagnostic"] = diagnostic[-12000:]
        print("Transaction test: " + json.dumps(self.report["transaction_test"]), flush=True)
        assert result.returncode == 0 and len([m for m in markers if m.startswith("context check passed:")]) == 6
        self.report["checks"]["production_transaction_lifecycle"] = {"result": "Passed", "exit_paths": 6}

    def exercise(self):
        super().exercise()
        # Switch this owned app process to a controlled provider fixture to test
        # provider traits and error mapping through the same mounted composition.
        self.mark("mounted_controlled_provider_traits_and_outage")
        os.killpg(self.process.pid, signal.SIGTERM)
        self.process.wait(timeout=10)
        self.process_log.close()
        body = dict(self.native_session)
        body["identity"] = dict(body["identity"])
        body["identity"]["traits"] = {
            "role": "administrator", "principal": "service",
            "practice_id": self.other, "capabilities": ["all_permissions"],
        }
        response = {"status": 200, "body": json.dumps(body).encode()}

        class Provider(BaseHTTPRequestHandler):
            def do_GET(self):
                self.send_response(response["status"])
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(response["body"])

            def log_message(self, *_args):
                pass

        provider = ThreadingHTTPServer(("127.0.0.1", 0), Provider)
        thread = threading.Thread(target=provider.serve_forever, daemon=True)
        thread.start()
        real_kratos = boundary.KRATOS
        try:
            boundary.KRATOS = f"http://127.0.0.1:{provider.server_port}"
            try:
                self.start_app()
            finally:
                boundary.KRATOS = real_kratos
            self.mark("mounted_controlled_provider_traits_and_outage")
            credential = {"Authorization": "Bearer synthetic-controlled-provider-token"}
            query = "practiceId=" + self.home
            summary = self.check_request("provider_traits_do_not_grant_authority", 200, credential, query)
            assert summary["principal"] == "user" and summary["practiceId"] == self.home
            assert summary["userId"] == self.user and set(summary["capabilities"]) == boundary.SURGEON_CAPABILITIES
            self.check_request("provider_traits_do_not_grant_foreign_practice", 403, credential,
                               "practiceId=" + self.other)
            response.update(status=503, body=b'{"error":"synthetic provider outage"}')
            self.check_request("mounted_provider_outage_is_unavailable", 503, credential, query)
            self.check_request("anonymous_during_provider_outage", 401)
            response.update(status=401, body=b'{}')
            self.check_request("mounted_invalid_provider_session_is_unauthenticated", 401, credential)
            response.update(status=403, body=b'{}')
            status, headers, payload = self.http(self.direct, self.app + "/api/session", headers=credential)
            no_store = headers.get("Cache-Control") == "no-store"
            self.report["app_response_count"] += 1
            self.report["no_store_response_count"] += int(no_store)
            valid = status == 403 and no_store and payload == {"error": "reauthentication_required"}
            self.report["checks"]["mounted_provider_requires_reauthentication"] = {
                "result": "Passed" if valid else "Failed", "status": status,
                "expected_status": 403, "no_store": no_store,
                "reauthentication_code_matches": payload == {"error": "reauthentication_required"},
            }
            assert valid
        finally:
            provider.shutdown()
            provider.server_close()
            thread.join(timeout=5)
            self.report["controlled_provider_stopped"] = not thread.is_alive()
            assert self.report["controlled_provider_stopped"]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--postgres-user", default="flint")
    parser.add_argument("--postgres-port", type=int)
    parser.add_argument("--startup-seconds", type=int, default=180)
    return ContextProbe(parser.parse_args()).run()


if __name__ == "__main__":
    sys.exit(main())
