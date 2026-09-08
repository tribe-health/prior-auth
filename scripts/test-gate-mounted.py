#!/usr/bin/env python3
"""T1: actual Gate -> ASO -> Kratos/Postgres clinical boundary.

Run with the workspace build directory idle and a freshly built debug Gate:
  RUSTUP_TOOLCHAIN=1.97.1 python3 scripts/test-gate-mounted.py --gate-binary <path>

Only synthetic identities and disposable database resources are created.
The second Gate targets an accepting recording sink, so its denials cannot be
attributed to an AppServices command check or a clinical write trigger.
"""

import argparse
import copy
import datetime
import fcntl
import hashlib
import http.client
import importlib.util
import json
import os
from pathlib import Path
import secrets
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.dont_write_bytecode = True

import yaml


def load_helper(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


transaction = load_helper("gate_transaction_fixture", "test-gate-transaction.py")
boundary = load_helper("gate_session_fixture", "test-session-boundary.py")
ROOT = transaction.ROOT
OUTPUT = transaction.OUTPUT.with_name("mounted.json")
ROUTE_IDS = {"aso-gate-read", "aso-gate-affirm", "aso-gate-remove", "aso-gate-command"}
SNAPSHOT_KEYS = {"caseId", "affirmed", "gateAffirmedAt", "gateAffirmedBy"}
RESULT_KEYS = {"commandId", "caseId", "kind", "action", "gate", "committedAt"}
GATE_SOURCE_FILES = (
    "crates/flint-gate-core/src/config/types.rs",
    "crates/flint-gate-core/src/config/lookup.rs",
    "crates/flint-gate-core/src/middleware/mod.rs",
    "crates/flint-gate-core/src/middleware/pipeline.rs",
    "crates/flint-gate-core/src/middleware/aso_clinical_authorize.rs",
)


def free_port():
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return listener.getsockname()[1]


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


class MountedProbe(transaction.Probe):
    def __init__(self, args):
        super().__init__(args)
        self.subjects = {label: boundary.Probe(args) for label in self.contexts}
        self.direct = boundary.http_client()
        self.processes = []
        self.config_dirs = []
        self.application = None
        self.app = None
        self.sink = None
        self.sink_thread = None
        self.sink_calls = 0
        self.sink_lock = threading.Lock()
        self.origins = {boundary.KRATOS, boundary.ADMIN}
        self.report.update({
            "scope": "Mounted Gate clinical routes and independent gateway denial against an accepting sink",
            "commands": ["RUSTUP_TOOLCHAIN=1.97.1 python3 scripts/test-gate-mounted.py --gate-binary <debug executable>"],
            "environment_contract": {
                "migration": ["ASO_MIGRATION_DATABASE_URL"],
                "application": ["ASO_DATABASE_URL", "ASO_GATE_DATABASE_URL", "ASO_KRATOS_PUBLIC_URL", "ASO_ALLOW_INSECURE_KRATOS", "ASO_PORT"],
                "gateway": ["FLINT_GATE_CONFIG"],
                "credentials": "Captured in memory and supplied through request headers, environment or SQL stdin only",
            },
            "unverified": [
                "Physical devices, browser UI and production deployment are outside this mounted HTTP fixture.",
                "The agent negative control uses a non-Kratos credential, not a provisioned delegated agent identity.",
                "Repeated same-name credential headers are not exercised by this HTTP client.",
            ],
        })

    def mark(self, stage):
        self.stage = stage
        print("Mounted gate probe: " + stage, file=sys.stderr, flush=True)

    def http(self, origin, path, method="GET", body=None, headers=None, client=None, timeout=10):
        if origin not in self.origins:
            raise ValueError("unexpected_endpoint_origin")
        # The existing client refuses redirects and never prints payloads.
        subject = self.subjects["A"]
        previous = subject.app
        try:
            subject.app = origin
            return subject.http(client or self.direct, origin + path, method, body, headers, timeout)
        finally:
            subject.app = previous

    def create_identities(self):
        self.mark("synthetic_kratos_identities")
        for label, subject in self.subjects.items():
            subject.create_identity()
            self.contexts[label]["identity_id"] = subject.identity
        self.check("four_real_kratos_identities_mapped_before_seed",
                   len({value["identity_id"] for value in self.contexts.values()}) == 4)

    def runtime_login(self):
        self.mark("restricted_session_and_gate_runtime_login")
        password = secrets.token_urlsafe(36)
        self.sql("postgres", "CREATE ROLE " + transaction.identifier(self.login)
                 + " LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD "
                 + transaction.literal(password) + ";")
        self.created_login = True
        self.sql("postgres", "GRANT aso_session_reader, aso_gate_executor TO "
                 + transaction.identifier(self.login) + ";")
        valid = self.sql(self.name, f"""
            SELECT rolcanlogin AND NOT (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication)
              AND pg_has_role(oid,'aso_session_reader','USAGE')
              AND pg_has_role(oid,'aso_gate_executor','USAGE')
              AND NOT pg_has_role(oid,'aso_gate_owner','MEMBER')
              AND NOT EXISTS(SELECT FROM pg_namespace WHERE nspowner=r.oid)
              AND NOT EXISTS(SELECT FROM pg_class WHERE relowner=r.oid)
              AND NOT EXISTS(SELECT FROM pg_database WHERE datdba=r.oid)
              FROM pg_roles r WHERE rolname='{self.login}';
        """).stdout.strip()
        self.check("runtime_login_is_restricted_reader_and_executor", valid == "t")
        parsed = urllib.parse.urlsplit(self.admin_url)
        self.runtime_url = "postgresql://" + self.login + ":" + urllib.parse.quote(password, safe="")
        self.runtime_url += "@" + parsed.netloc.rsplit("@", 1)[1] + parsed.path

    def spawn(self, label, command, env):
        log = tempfile.TemporaryFile()
        entry = {"label": label, "process": None, "log": log}
        self.processes.append(entry)
        entry["process"] = subprocess.Popen(
            command, cwd=ROOT, env=env, stdin=subprocess.DEVNULL,
            stdout=log, stderr=subprocess.STDOUT, start_new_session=True,
        )
        return entry

    def ready(self, entry, origin, path, expected, headers=None):
        deadline = time.monotonic() + self.args.startup_seconds
        next_update = time.monotonic() + 30
        while time.monotonic() < deadline:
            if entry["process"].poll() is not None:
                self.check(entry["label"] + "_alive", False,
                           return_code=entry["process"].returncode)
            try:
                status, _, _ = self.http(origin, path, headers=headers, timeout=1)
                if status == expected:
                    self.check(entry["label"] + "_ready", True, status=status)
                    return
            except (OSError, ValueError, urllib.error.URLError):
                pass
            if time.monotonic() >= next_update:
                self.mark(entry["label"] + "_waiting_for_readiness")
                next_update = time.monotonic() + 30
            time.sleep(0.25)
        raise TimeoutError("process_readiness_deadline")

    def start_app(self):
        self.mark("mount_actual_application")
        port = free_port()
        self.app = f"http://localhost:{port}"
        self.origins.add(self.app)
        env = os.environ.copy()
        env.pop("ASO_MIGRATION_DATABASE_URL", None)
        env.pop("ASO_WEB_ROOT", None)
        env.update({
            "ASO_DATABASE_URL": self.runtime_url,
            "ASO_GATE_DATABASE_URL": self.runtime_url,
            "ASO_KRATOS_PUBLIC_URL": boundary.KRATOS,
            "ASO_ALLOW_INSECURE_KRATOS": "true",
            "ASO_PORT": str(port), "RUST_LOG": "error",
        })
        self.application = self.spawn("application", ["cargo", "run", "-p", "aso-web-server"], env)
        self.ready(self.application, self.app, "/api/session", 401)

    def start_gate(self, label, upstream, disable_policy=False):
        self.mark("mount_" + label)
        source = yaml.safe_load((ROOT / "docker/flint-gate/config.yaml").read_text())
        routes = copy.deepcopy([route for route in source["routes"] if route["id"] in ROUTE_IDS])
        self.check(label + "_checked_in_routes_present", {route["id"] for route in routes} == ROUTE_IDS)
        site_ids = {route["site"] for route in routes}
        sites = copy.deepcopy([site for site in source["sites"] if site["id"] in site_ids])
        proxy_port, admin_port = free_port(), free_port()
        while proxy_port == admin_port:
            admin_port = free_port()
        for site in sites:
            site["domains"] = [f"localhost:{proxy_port}", f"127.0.0.1:{proxy_port}"]
            site["default_upstream"] = upstream
            self.check(label + "_site_passthrough", site["default_auth"] == "passthrough")
        for route in routes:
            hooks = route.get("hooks", {}).get("pre_request", [])
            clinical = [hook for hook in hooks if hook["type"] == "aso_clinical_authorize"]
            self.check(label + "_" + route["id"] + "_policy_hook",
                       route["auth"] == "passthrough" and "upstream" not in route and len(clinical) == 1)
            clinical[0]["config"]["url"] = self.app + "/internal/gate/authorize"
            if disable_policy:
                # Deliberate negative control in this owned temporary config.
                # The checked-in route and the accepting sink are unchanged.
                hooks.remove(clinical[0])
        config = {
            "server": {"listen": f"127.0.0.1:{proxy_port}", "admin_listen": f"127.0.0.1:{admin_port}"},
            "database": {"url": ""},
            "auth_providers": {"passthrough": source["auth_providers"]["passthrough"]},
            "sites": sites, "routes": routes,
        }
        directory = tempfile.TemporaryDirectory(prefix="aso-mounted-gate-")
        self.config_dirs.append(directory)
        config_path = Path(directory.name, "config.yaml")
        config_path.write_text(yaml.safe_dump(config))
        env = os.environ.copy()
        # CLI environment overrides YAML. Inherited database/listen settings
        # must not redirect this disposable process to another resource.
        for key in list(env):
            if key == "DATABASE_URL" or key.startswith("FLINT_"):
                env.pop(key)
        env.update({"FLINT_GATE_CONFIG": str(config_path), "RUST_LOG": "error"})
        origin = f"http://localhost:{proxy_port}"
        self.origins.add(origin)
        entry = self.spawn(label, [str(self.args.gate_binary)], env)
        # Exercise an actual clinical route during readiness, not only /health.
        self.ready(entry, origin, f"/api/cases/{self.case}/gate", 200 if disable_policy else 401)
        return origin

    def start_sink(self):
        owner = self

        class Sink(BaseHTTPRequestHandler):
            def do_GET(self):
                with owner.sink_lock:
                    owner.sink_calls += 1
                self.rfile.read(int(self.headers.get("Content-Length", "0")))
                raw = b'{"accepted":true}'
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)

            do_POST = do_GET

            def log_message(self, *_args):
                pass

        self.sink = ThreadingHTTPServer(("127.0.0.1", 0), Sink)
        self.sink_thread = threading.Thread(target=self.sink.serve_forever, daemon=True)
        self.sink_thread.start()
        return f"http://localhost:{self.sink.server_port}"

    def request(self, label, origin, expected, subject=None, suffix="", method="GET", body=None,
                practice=None, transport="bearer", extra=None, require_no_store=False):
        headers = dict(extra or {})
        client = self.direct
        if subject:
            selected = self.subjects[subject]
            if transport == "cookie":
                client = selected.browser
            elif transport == "x-session-token":
                headers["X-Session-Token"] = selected.token
            else:
                headers["Authorization"] = "Bearer " + selected.token
        path = f"/api/cases/{self.case}/gate" + suffix
        if practice is not None:
            path += "?practiceId=" + practice
        status, response_headers, payload = self.http(origin, path, method, body, headers, client)
        details = {"status": status, "expected_status": expected}
        valid = status == expected
        if require_no_store:
            details["no_store"] = response_headers.get("Cache-Control") == "no-store"
            valid = valid and details["no_store"]
        error = payload.get("error") if isinstance(payload, dict) else None
        if isinstance(error, str) and error in {
            "invalid_gate_request", "unauthenticated", "gate_denied", "practice_denied",
            "gate_not_found", "command_conflict", "gate_unavailable", "session_unavailable",
            "clinical_authorization_denied", "clinical_authorization_unavailable",
        }:
            details["error_code"] = error
        self.check(label, valid, **details)
        return payload

    def command_count(self):
        return int(self.sql(self.name, f"SELECT count(*) FROM aso.gate_commands WHERE case_id='{self.case}';").stdout.strip())

    def clinical_counts(self, case):
        return json.loads(self.sql(self.name, f"""
            SELECT json_build_array(
                (SELECT count(*) FROM aso.gate_affirmations WHERE case_id='{case}'),
                (SELECT count(*) FROM aso.audit_events WHERE case_id='{case}' AND action LIKE 'gate.%'),
                (SELECT count(*) FROM aso.gate_commands WHERE case_id='{case}'));
        """).stdout.strip())

    def exercise_lost_response(self, gate):
        self.mark("committed_response_lost_before_client_headers")
        owner = self
        observed = []
        command = {"commandId": str(uuid.uuid4()), "kind": "policy"}
        path = f"/api/cases/{self.case}/gate/affirm?practiceId={self.home}"
        before = self.clinical_counts(self.case)

        class DropFirstResponse(BaseHTTPRequestHandler):
            def do_POST(self):
                try:
                    body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                    status, _, receipt = owner.http(gate, self.path, "POST", body,
                                                   {"Authorization": self.headers["Authorization"]})
                    observed.append((status, receipt))
                    if len(observed) > 1:
                        # Positive transport control: the same proxy delivers
                        # the deliberate retry normally, without inventing data.
                        raw = json.dumps(receipt).encode()
                        self.send_response(status)
                        self.send_header("Content-Type", "application/json")
                        self.send_header("Content-Length", str(len(raw)))
                        self.end_headers()
                        self.wfile.write(raw)
                finally:
                    # On the first request Gate's response was fully received;
                    # disconnect before sending any client response headers.
                    self.close_connection = True
                    self.connection.shutdown(socket.SHUT_WR)

            def log_message(self, *_args):
                pass

        proxy = ThreadingHTTPServer(("127.0.0.1", 0), DropFirstResponse)
        thread = threading.Thread(target=proxy.serve_forever, daemon=True)
        thread.start()
        headers = {"Content-Type": "application/json",
                   "Authorization": "Bearer " + self.subjects["A"].token}
        connection = http.client.HTTPConnection("127.0.0.1", proxy.server_port, timeout=15)
        try:
            disconnected = False
            connection.request("POST", path, json.dumps(command), headers)
            try:
                connection.getresponse()
            except http.client.RemoteDisconnected:
                disconnected = True
            self.check("lost_response_client_received_no_headers", disconnected)
            self.check("lost_response_gate_returned_committed_result",
                       len(observed) == 1 and observed[0][0] == 200
                       and observed[0][1]["commandId"] == command["commandId"])
            original = observed[0][1]
            after = self.clinical_counts(self.case)
            self.check("lost_response_one_affirmation_audit_and_command",
                       after == [value + 1 for value in before])
            lookup = self.request("lost_response_lookup", gate, 200, "A",
                                  "/commands/" + command["commandId"], practice=self.home)
            self.check("lost_response_lookup_recovers_original", lookup == original)
            connection.close()
            connection = http.client.HTTPConnection("127.0.0.1", proxy.server_port, timeout=15)
            connection.request("POST", path, json.dumps(command), headers)
            response = connection.getresponse()
            replay = json.loads(response.read())
            self.check("lost_response_deliberate_retry_returns_original",
                       response.status == 200 and replay == original and len(observed) == 2)
            self.check("lost_response_lookup_retry_have_no_second_effect",
                       self.clinical_counts(self.case) == after)
            for suffix, body in [("/affirm", {**command, "kind": "plan"}), ("/remove", command)]:
                self.request("lost_response_conflict_" + suffix[1:], gate, 409, "A",
                             suffix, "POST", body, self.home)
            other = self.upgrade_cases["stale_empty"]
            other_before = self.clinical_counts(other)
            status, _, body = self.http(gate, f"/api/cases/{other}/gate/affirm?practiceId={self.home}",
                                       "POST", command, headers)
            self.check("lost_response_changed_case_conflicts",
                       status == 409 and body == {"error": "command_conflict"})
            self.check("lost_response_all_payload_conflicts_have_no_effect",
                       self.clinical_counts(self.case) == after
                       and self.clinical_counts(other) == other_before)
            self.request("lost_response_later_removal", gate, 200, "A", "/remove", "POST",
                         {"commandId": str(uuid.uuid4()), "kind": "policy"}, self.home)
            historical = self.request("lost_response_historical_lookup", gate, 200, "A",
                                      "/commands/" + command["commandId"], practice=self.home)
            current = self.request("lost_response_current_read", gate, 200, "A", practice=self.home)
            self.check("lost_response_historical_receipt_does_not_replace_current_gate",
                       historical == original and current["affirmed"] == []
                       and historical["gate"]["affirmed"] == ["policy"])
        finally:
            connection.close()
            proxy.shutdown()
            proxy.server_close()
            thread.join(timeout=5)
            self.report["cleanup"]["response_loss_proxy_stopped"] = {
                "result": "Passed" if not thread.is_alive() else "Failed"}

    def exercise_mounted(self, gate):
        self.mark("mounted_durable_commands")
        initial = self.request("mounted_read", gate, 200, "A", practice=self.home, require_no_store=True)
        self.check("mounted_snapshot_contract", set(initial) == SNAPSHOT_KEYS
                   and initial["caseId"] == self.case and initial["affirmed"] == [])
        command = {"commandId": str(uuid.uuid4()), "kind": "policy"}
        result = self.request("mounted_affirm", gate, 200, "A", "/affirm", "POST", command,
                              self.home, require_no_store=True)
        self.check("mounted_command_contract", set(result) == RESULT_KEYS
                   and result["commandId"] == command["commandId"] and result["caseId"] == self.case
                   and result["action"] == "affirm" and result["kind"] == "policy"
                   and set(result["gate"]) == SNAPSHOT_KEYS and result["gate"]["affirmed"] == ["policy"])
        stored = self.sql(self.name, f"""
            SELECT count(*)=1 FROM aso.gate_affirmations
              WHERE case_id='{self.case}' AND kind='policy'
                AND affirmed_by='{self.contexts['A']['actor_id']}';
        """).stdout.strip()
        self.check("mounted_affirm_durable_sql", stored == "t" and self.command_count() == 1)
        replay = self.request("mounted_replay", gate, 200, "A", "/affirm", "POST", command, self.home)
        browser_replay = self.request("mounted_browser_cookie_post_replay", gate, 200, "A",
                                      "/affirm", "POST", command, self.home,
                                      transport="cookie", require_no_store=True)
        lookup = self.request("mounted_lookup", gate, 200, "A", "/commands/" + command["commandId"], practice=self.home)
        self.check("mounted_replay_lookup_equal_original",
                   replay == browser_replay == lookup == result and self.command_count() == 1)
        self.request("mounted_conflicting_replay", gate, 409, "A", "/affirm", "POST",
                     {**command, "kind": "plan"}, self.home)
        self.request("mounted_actor_body_rejected", gate, 400, "A", "/affirm", "POST",
                     {"commandId": str(uuid.uuid4()), "kind": "plan", "actor": self.contexts["admin"]["actor_id"]})
        for label, subject, status in (("admin", "admin", 403), ("foreign", "foreign", 403), ("anonymous", None, 401)):
            self.request("mounted_" + label + "_denied", gate, status, subject, "/affirm", "POST",
                         {"commandId": str(uuid.uuid4()), "kind": "plan"}, self.home)
        for subject in ("admin", "foreign"):
            self.request("direct_application_" + subject + "_denied", self.app, 403, subject,
                         "/affirm", "POST", {"commandId": str(uuid.uuid4()), "kind": "plan"},
                         self.home, require_no_store=True)
        self.check("mounted_denials_create_no_commands", self.command_count() == 1)
        browser = self.request("mounted_browser_cookie_json", gate, 200, "A", transport="cookie", require_no_store=True)
        self.check("mounted_browser_snapshot_matches", browser == result["gate"])
        self.request("mounted_native_x_session_token", gate, 200, "A", transport="x-session-token")
        self.request("mounted_second_identity_cannot_lookup_first_receipt", gate, 404, "B",
                     "/commands/" + command["commandId"], practice=self.home)
        removal = {"commandId": str(uuid.uuid4()), "kind": "policy"}
        removed = self.request("mounted_remove", gate, 200, "A", "/remove", "POST", removal, self.home)
        self.check("mounted_remove_durable_sql", removed["action"] == "remove" and removed["gate"]["affirmed"] == []
                   and self.command_count() == 2 and self.sql(self.name,
                   f"SELECT count(*) FROM aso.gate_affirmations WHERE case_id='{self.case}';").stdout.strip() == "0")
        subject = self.subjects["B"]
        status, _, _ = self.http(boundary.ADMIN, "/admin/identities/" + subject.identity, "DELETE")
        subject.identity_deleted = status == 204
        self.check("mounted_identity_revoked", subject.identity_deleted)
        self.request("mounted_revoked_credential_denied", gate, 401, "B", "/affirm", "POST",
                     {"commandId": str(uuid.uuid4()), "kind": "plan"}, self.home)

    def exercise_independent(self, gate):
        self.mark("independent_gateway_against_accepting_sink")
        body = {"commandId": str(uuid.uuid4()), "kind": "plan"}

        def attempt(label, expected, subject=None, extra=None, practice=None):
            before = self.sink_calls
            payload = self.request(label, gate, expected, subject, "/affirm", "POST", body, practice, extra=extra)
            after = self.sink_calls
            wanted = 1 if expected == 200 else 0
            self.check(label + "_downstream_calls", after - before == wanted, downstream_calls=after - before)
            if expected == 200:
                self.check(label + "_accepting_sink_control", payload == {"accepted": True})

        count = self.command_count()
        attempt("gateway_permit_forward_control", 200, "A", practice=self.home)
        attempt("gateway_admin_denied_independently", 403, "admin", practice=self.home)
        disabled_gate = self.start_gate("disabled_policy_control_gate",
                                        f"http://localhost:{self.sink.server_port}", disable_policy=True)
        before = self.sink_calls
        accepted = self.request("gateway_disabled_hook_allows_admin_control", disabled_gate, 200,
                                "admin", "/affirm", "POST", body, self.home)
        self.check("gateway_disabled_hook_admin_reaches_accepting_sink",
                   accepted == {"accepted": True} and self.sink_calls - before == 1,
                   downstream_calls=self.sink_calls - before)
        attempt("gateway_enabled_hook_still_denies_same_admin", 403, "admin", practice=self.home)
        attempt("gateway_foreign_denied_independently", 403, "foreign", practice=self.home)
        attempt("gateway_non_kratos_agent_denied", 401, extra={"Authorization": "Bearer synthetic-agent-non-kratos", "X-Principal": "agent"})
        attempt("gateway_missing_credential_denied", 401)
        attempt("gateway_mixed_credential_denied", 401, "A", extra={"X-Session-Token": self.subjects["admin"].token})
        self.sql(self.name, "DELETE FROM aso.role_capabilities WHERE role_id=(SELECT id FROM aso.roles WHERE key='surgeon') AND capability_key='affirm_gate';")
        try:
            attempt("gateway_fresh_capability_removal_denied", 403, "A", practice=self.home)
        finally:
            self.sql(self.name, "INSERT INTO aso.role_capabilities(role_id,capability_key) SELECT id,'affirm_gate' FROM aso.roles WHERE key='surgeon';")
        attempt("gateway_capability_restoration_permit", 200, "A", practice=self.home)
        self.check("gateway_policy_and_sink_do_not_write_clinical_commands", self.command_count() == count)
        self.stop_process(self.application)
        attempt("gateway_policy_unavailable_denied", 503, "A", practice=self.home)

    def stop_process(self, entry):
        process = entry["process"]
        if process is not None:
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                process.wait(timeout=10)

    def cleanup(self):
        self.mark("cleanup_owned_mounted_resources")
        cleanup = self.report["cleanup"]
        for entry in reversed(self.processes):
            try:
                self.stop_process(entry)
                entry["log"].close()
                cleanup[entry["label"] + "_process_and_log"] = {"result": "Passed"}
            except Exception as error:
                cleanup[entry["label"] + "_process_and_log"] = {"result": "Failed", "failure_type": type(error).__name__}
        if self.sink:
            self.sink.shutdown()
            self.sink.server_close()
            self.sink_thread.join(timeout=5)
            cleanup["recording_sink_stopped"] = {"result": "Passed" if not self.sink_thread.is_alive() else "Failed"}
        for label, subject in self.subjects.items():
            subject.cleanup()
            valid = all(value is not False for value in subject.report["cleanup"].values())
            cleanup[label + "_synthetic_identity_and_sessions"] = {"result": "Passed" if valid else "Failed"}
        for index, directory in enumerate(self.config_dirs):
            try:
                path = Path(directory.name)
                directory.cleanup()
                cleanup["temporary_gate_config_" + str(index)] = {"result": "Passed" if not path.exists() else "Failed"}
            except Exception as error:
                cleanup["temporary_gate_config_" + str(index)] = {"result": "Failed", "failure_type": type(error).__name__}
        super().cleanup()

    def run(self):
        try:
            self.mark("binary_and_source_evidence")
            self.args.gate_binary = self.args.gate_binary.resolve(strict=True)
            self.check("gate_binary_executable", os.access(self.args.gate_binary, os.X_OK))
            self.report["gate_binary_sha256"] = sha256(self.args.gate_binary)
            sources = [ROOT / "docker/flint-gate/config.yaml", ROOT / "crates/aso-server-axum/src/routes/gate.rs", Path(__file__)]
            sources.extend(self.args.gate_source_root / path for path in GATE_SOURCE_FILES)
            self.check("gate_and_application_source_files_present", all(path.is_file() for path in sources))
            self.report["source_sha256"] = {str(path): sha256(path) for path in sources}
            self.create_identities()
            self.create_database()
            migrated, _ = self.migration("mounted_fixture_server_migration")
            self.check("mounted_fixture_migrated", migrated.returncode == 0, return_code=migrated.returncode)
            self.runtime_login()
            self.start_app()
            actual_gate = self.start_gate("actual_upstream_gate", self.app)
            self.exercise_mounted(actual_gate)
            self.exercise_lost_response(actual_gate)
            sink_gate = self.start_gate("accepting_sink_gate", self.start_sink())
            self.exercise_independent(sink_gate)
            self.report["result"] = "Passed"
        except (Exception, KeyboardInterrupt) as error:
            self.report["failure"] = {"stage": self.stage, "type": type(error).__name__}
        finally:
            try:
                self.cleanup()
            except (Exception, KeyboardInterrupt) as error:
                self.report["result"] = "Failed"
                self.report["cleanup"]["cleanup_interrupted"] = {"result": "Failed", "failure_type": type(error).__name__}
            self.report["completed_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
            self.report["check_count"] = len(self.report["checks"])
            self.args.output.parent.mkdir(parents=True, exist_ok=True)
            self.args.output.write_text(json.dumps(self.report, indent=2) + "\n")
            print(json.dumps(self.report, indent=2))
        return 0 if self.report["result"] == "Passed" else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--gate-binary", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument("--gate-source-root", type=Path,
                        default=Path("/Users/gqadonis/Projects/prometheus/flint-gate"))
    parser.add_argument("--postgres-user", default="flint")
    parser.add_argument("--postgres-port", type=int)
    parser.add_argument("--startup-seconds", type=int, default=180)
    parser.add_argument("--command-seconds", type=int, default=600)
    args = parser.parse_args()
    with open(Path(tempfile.gettempdir()) / "aso-gate-transaction-fixture.lock", "a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("Mounted gate probe: another fixture is running", file=sys.stderr)
            return 1
        return MountedProbe(args).run()


if __name__ == "__main__":
    sys.exit(main())
