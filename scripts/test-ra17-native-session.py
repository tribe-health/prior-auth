#!/usr/bin/env python3
"""RA17 T1: live Kratos native login through the host platform keyring."""

import datetime
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import urllib.error
import urllib.request
import uuid


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = (
    ROOT
    / ".kbd-orchestrator/phases/runtime-architecture/evidence/ra-17-native-session-transport/task-2-native-kratos.json"
)
KRATOS_PUBLIC = "http://127.0.0.1:4433"
KRATOS_ADMIN = "http://127.0.0.1:4434"


class Probe:
    def __init__(self):
        self.identity_id = None
        self.email = f"ra17-{uuid.uuid4()}@example.invalid"
        self.password = secrets.token_urlsafe(36) + "Aa1!"
        self.account = f"ra17-synthetic-{uuid.uuid4()}"
        self.report = {
            "schemaVersion": 1,
            "change": "ra-17-native-session-transport",
            "task": "1.2",
            "result": "Failed",
            "observedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "command": "RUSTUP_TOOLCHAIN=1.98.1 python3 scripts/test-ra17-native-session.py",
            "scope": "Synthetic native API login against Kratos 26.2.0 using the operating-system credential store",
            "checks": {},
            "cleanup": {},
        }

    def check(self, name, condition, **details):
        self.report["checks"][name] = {
            "result": "Passed" if condition else "Failed",
            **details,
        }
        if not condition:
            raise AssertionError(name)

    @staticmethod
    def json_http(url, method="GET", body=None):
        data = None
        headers = {"Accept": "application/json"}
        if body is not None:
            data = json.dumps(body).encode()
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            response = urllib.request.urlopen(request, timeout=15)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            raw = response.read()
            return response.status, json.loads(raw) if raw else {}

    def create_identity(self):
        status, version = self.json_http(KRATOS_ADMIN + "/version")
        observed_version = version.get("version", "")
        self.check(
            "kratos_version_is_pinned",
            status == 200 and observed_version.lstrip("v") == "26.2.0",
            status=status,
            version=observed_version,
        )
        status, identity = self.json_http(
            KRATOS_ADMIN + "/admin/identities",
            "POST",
            {
                "schema_id": "clinician",
                "state": "active",
                "traits": {
                    "email": self.email,
                    "name": {"first": "Synthetic", "last": "RA17 Probe"},
                },
                "credentials": {"password": {"config": {"password": self.password}}},
            },
        )
        self.check("synthetic_identity_created", status == 201, status=status)
        self.identity_id = identity["id"]

    def run_host_test(self):
        command = [
            "cargo",
            "test",
            "-p",
            "aso-desktop",
            "native_kratos_keyring_transport_end_to_end",
            "--",
            "--ignored",
            "--nocapture",
            "--test-threads=1",
        ]
        env = dict(
            os.environ,
            ASO_TEST_KRATOS_PUBLIC_URL=KRATOS_PUBLIC,
            ASO_TEST_NATIVE_EMAIL=self.email,
            ASO_TEST_NATIVE_PASSWORD=self.password,
            ASO_TEST_NATIVE_ACCOUNT=self.account,
            RUSTUP_TOOLCHAIN="1.98.1",
        )
        result = subprocess.run(
            command,
            cwd=ROOT,
            env=env,
            capture_output=True,
            text=True,
            timeout=240,
        )
        combined = result.stdout + result.stderr
        expected = sorted(
            [
                "ra17 check passed: native login returned sanitized session",
                "ra17 check passed: platform credential reopened protected session",
                "ra17 check passed: renderer projection contains no credential",
                "ra17 check passed: host credential owner invoked protected session command",
                "ra17 check passed: platform credential removed on cleanup",
            ]
        )
        markers = sorted(marker for marker in expected if marker in combined)
        self.check(
            "live_host_transport_passed",
            result.returncode == 0 and markers == expected,
            exitCode=result.returncode,
            markers=markers,
        )
        self.check(
            "synthetic_secrets_absent_from_output",
            self.password not in combined and self.account not in combined,
        )

    def cleanup(self):
        if self.identity_id is None:
            self.report["cleanup"]["synthetic_identity"] = "NotCreated"
            return
        status, _ = self.json_http(
            KRATOS_ADMIN + "/admin/identities/" + self.identity_id,
            "DELETE",
        )
        self.report["cleanup"]["synthetic_identity"] = (
            "Passed" if status == 204 else "Failed"
        )
        self.report["cleanup"]["status"] = status

    def run(self):
        failure = None
        try:
            self.create_identity()
            self.run_host_test()
        except Exception as error:
            failure = f"{type(error).__name__}: {error}"
        finally:
            self.cleanup()
            cleanup_passed = self.report["cleanup"].get("synthetic_identity") in {
                "Passed",
                "NotCreated",
            }
            checks_passed = self.report["checks"] and all(
                value["result"] == "Passed"
                for value in self.report["checks"].values()
            )
            self.report["result"] = (
                "Passed" if failure is None and cleanup_passed and checks_passed else "Failed"
            )
            if failure:
                self.report["failure"] = failure
            OUTPUT.parent.mkdir(parents=True, exist_ok=True)
            OUTPUT.write_text(json.dumps(self.report, indent=2) + "\n")
            print(
                json.dumps(
                    {
                        "result": self.report["result"],
                        "checks": self.report["checks"],
                        "cleanup": self.report["cleanup"],
                        "evidence": str(OUTPUT.relative_to(ROOT)),
                    },
                    indent=2,
                )
            )
        return 0 if self.report["result"] == "Passed" else 1


if __name__ == "__main__":
    sys.exit(Probe().run())
