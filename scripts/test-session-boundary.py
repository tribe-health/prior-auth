#!/usr/bin/env python3
"""Tier 1: exercise the real session endpoint with disposable local resources.

Run after releasing the workspace's single-writer Cargo build directory:
  RUSTUP_TOOLCHAIN=1.97.1 python3 scripts/test-session-boundary.py

Requires the existing Docker Compose PostgreSQL and Kratos services. Only a
new database, a new database login, and a new synthetic Kratos identity are
modified. Credentials, IDs, responses, and process logs are never printed.
The process log is an unnamed temporary file deleted on close. Evidence goes
to the runtime-architecture phase's mounted-session.json.

This tests the direct app endpoint. The mounted gateway and native device UI
are separate verification surfaces.
"""

import argparse
import datetime
import http.cookiejar
import json
import os
from pathlib import Path
import secrets
import signal
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / ".kbd-orchestrator/phases/runtime-architecture/evidence/ra-01-verified-session/mounted-session.json"
KRATOS = "http://localhost:4433"
ADMIN = "http://localhost:4434"
SUMMARY_KEYS = {
    "identityId", "userId", "practiceId", "displayName", "principal",
    "capabilities", "expiresAt", "authorizationRevision",
}
SURGEON_CAPABILITIES = {"affirm_gate", "annotate", "sign_letter", "submit"}


def sql_literal(value):
    return "'" + value.replace("'", "''") + "'"


def sql_identifier(value):
    return '"' + value.replace('"', '""') + '"'


def instant(value):
    return datetime.datetime.fromisoformat(value.replace("Z", "+00:00"))


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def http_client(jar=None):
    handlers = [urllib.request.ProxyHandler({}), NoRedirect()]
    if jar is not None:
        handlers.append(urllib.request.HTTPCookieProcessor(jar))
    return urllib.request.build_opener(*handlers)


class Probe:
    def __init__(self, args):
        self.args = args
        self.name = "synthetic_ra01_" + uuid.uuid4().hex
        self.login = self.name + "_login"
        self.home = str(uuid.uuid4())
        self.other = str(uuid.uuid4())
        self.user = str(uuid.uuid4())
        self.identity = None
        self.token = None
        self.native_session = None
        self.browser_session = None
        self.created_database = False
        self.created_login = False
        self.created_reader = False
        self.created_executor = False
        self.identity_deleted = False
        self.process = None
        self.process_log = None
        self.direct = http_client()
        self.jar = http.cookiejar.CookieJar()
        self.browser = http_client(self.jar)
        self.app = None
        self.stage = "initialization"
        self.report = {
            "result": "Failed",
            "verification_tier": 1,
            "observed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "scope": "Mounted aso-web-server /api/session with real Kratos and a disposable PostgreSQL database",
            "commands": [
                "RUSTUP_TOOLCHAIN=1.97.1 python3 scripts/test-session-boundary.py",
                "docker compose exec -T db psql -U <configured admin> -X -A -t -q -v ON_ERROR_STOP=1 -d <disposable database> (SQL on stdin)",
                "cargo run -p aso-web-server (configuration and disposable password supplied through environment)",
            ],
            "checks": {},
            "app_response_count": 0,
            "no_store_response_count": 0,
            "cleanup": {},
            "unverified": [
                "Mounted gateway routing and physical native/browser UI are outside this direct HTTP probe.",
                "Unavailable-provider behavior is covered separately by application tests.",
            ],
        }
        if OUTPUT.exists():
            previous = json.loads(OUTPUT.read_text())
            attempts = previous.get("attempt_history", [])
            if previous.get("result") == "Failed":
                attempts.append({
                    "observed_at": previous.get("observed_at"),
                    "result": "Failed",
                    "failure": previous.get("failure"),
                    "app_exit_code": previous.get("app_exit_code"),
                    "cleanup": previous.get("cleanup"),
                    "diagnosis": previous.get("diagnosis", "See recorded failure stage."),
                })
            if attempts:
                self.report["attempt_history"] = attempts

    def mark(self, stage):
        self.stage = stage
        print("Session probe: " + stage, file=sys.stderr, flush=True)

    def sql(self, database, statement, require_success=True):
        command = [
            "docker", "compose", "exec", "-T", "db", "psql", "-U",
            self.args.postgres_user, "-X", "-A", "-t", "-q", "-v",
            "ON_ERROR_STOP=1", "-d", database,
        ]
        completed = subprocess.run(
            command, input=statement, text=True, capture_output=True,
            cwd=ROOT, timeout=45,
        )
        if require_success and completed.returncode:
            raise RuntimeError("database_statement_failed")
        return completed

    def http(self, client, url, method="GET", body=None, headers=None, timeout=10):
        origin = urllib.parse.urlsplit(url)
        if f"{origin.scheme}://{origin.netloc}" not in (KRATOS, ADMIN, self.app):
            raise ValueError("unexpected_endpoint_origin")
        values = {"Accept": "application/json"}
        values.update(headers or {})
        data = None
        if body is not None:
            values["Content-Type"] = "application/json"
            data = json.dumps(body).encode()
        req = urllib.request.Request(url, data=data, headers=values, method=method)
        try:
            response = client.open(req, timeout=timeout)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            raw = response.read()
            payload = json.loads(raw) if raw else {}
            return response.status, response.headers, payload

    def check_request(self, label, expected, headers=None, query=None, client=None):
        path = "/api/session" + ("?" + query if query else "")
        status, response_headers, payload = self.http(
            client or self.direct, self.app + path, headers=headers,
        )
        self.report["app_response_count"] += 1
        no_store = response_headers.get("Cache-Control") == "no-store"
        self.report["no_store_response_count"] += int(no_store)
        self.report["checks"][label] = {
            "result": "Passed" if status == expected and no_store else "Failed",
            "status": status, "expected_status": expected, "no_store": no_store,
        }
        assert status == expected and no_store
        if status == 200:
            assert set(payload) == SUMMARY_KEYS
            assert payload["identityId"] == self.identity
            assert payload["userId"] == self.user
            assert payload["displayName"] == "Synthetic Session Probe"
            assert payload["principal"] == "user"
            assert instant(payload["expiresAt"]) > datetime.datetime.now(datetime.timezone.utc)
            incarnation, revision = payload["authorizationRevision"].split(":")
            uuid.UUID(incarnation)
            assert int(revision) > 0
            self.report["checks"][label]["sanitized_summary"] = True
        else:
            assert payload == {"error": {
                400: "invalid_session_request", 401: "unauthenticated",
                403: "practice_denied", 503: "session_unavailable",
            }[expected]}
        return payload

    def create_identity(self):
        self.mark("synthetic_kratos_identity_and_sessions")
        status, _, version = self.http(self.direct, ADMIN + "/version")
        assert status == 200 and version.get("version") == "v26.2.0"
        self.report["kratos_version"] = version["version"]
        email = self.name + "@example.invalid"
        password = secrets.token_urlsafe(36) + "Aa1!"
        status, _, identity = self.http(self.direct, ADMIN + "/admin/identities", "POST", {
            "schema_id": "clinician", "state": "active",
            "traits": {"email": email, "name": {"first": "Synthetic", "last": "Session Probe"}},
            "credentials": {"password": {"config": {"password": password}}},
        })
        if status == 201:
            self.identity = identity.get("id")
        assert self.identity
        body = {"method": "password", "identifier": email, "password": password}
        status, _, flow = self.http(self.direct, KRATOS + "/self-service/login/api")
        assert status == 200 and flow["type"] == "api"
        status, _, login = self.http(self.direct, flow["ui"]["action"], "POST", body)
        assert status == 200
        self.token = login["session_token"]
        status, _, self.native_session = self.http(
            self.direct, KRATOS + "/sessions/whoami", headers={"X-Session-Token": self.token},
        )
        assert status == 200 and self.native_session["identity"]["id"] == self.identity
        status, _, flow = self.http(self.browser, KRATOS + "/self-service/login/browser")
        assert status == 200 and flow["type"] == "browser"
        csrf = next(
            n["attributes"]["value"] for n in flow["ui"]["nodes"]
            if n.get("attributes", {}).get("name") == "csrf_token"
        )
        status, _, _ = self.http(
            self.browser, flow["ui"]["action"], "POST", {**body, "csrf_token": csrf},
        )
        assert status == 200
        status, _, self.browser_session = self.http(self.browser, KRATOS + "/sessions/whoami")
        assert status == 200 and self.browser_session["identity"]["id"] == self.identity
        assert self.browser_session["id"] != self.native_session["id"]
        self.report["checks"]["synthetic_native_and_browser_flows"] = {
            "result": "Passed", "identity_equal": True, "distinct_sessions": True,
        }

    def create_database(self):
        self.mark("disposable_database_and_restricted_login")
        port = self.args.postgres_port
        if port is None:
            published = subprocess.run(
                ["docker", "compose", "port", "db", "5432"], cwd=ROOT,
                text=True, capture_output=True, timeout=20, check=True,
            ).stdout.strip().splitlines()
            port = int(published[0].rsplit(":", 1)[1])
        assert 0 < port < 65536
        self.report["postgres_published_port"] = port
        reader_existed = self.sql("postgres", "SELECT EXISTS(SELECT FROM pg_roles WHERE rolname='aso_session_reader');").stdout.strip() == "t"
        executor_existed = self.sql("postgres", "SELECT EXISTS(SELECT FROM pg_roles WHERE rolname='aso_gate_executor');").stdout.strip() == "t"
        if not executor_existed:
            self.sql("postgres", "CREATE ROLE aso_gate_executor NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;")
            self.created_executor = True
        self.sql("postgres", f"CREATE DATABASE {self.name};")
        self.created_database = True
        self.sql(self.name, (ROOT / "docs/design/schema/schema.sql").read_text())
        self.sql(self.name, (ROOT / "docker/bootstrap/25-session-authority.sql").read_text())
        self.created_reader = not reader_existed
        if self.created_reader:
            self.sql("postgres", "COMMENT ON ROLE aso_session_reader IS " + sql_literal(self.name) + ";")
        if self.created_executor:
            self.sql("postgres", "COMMENT ON ROLE aso_gate_executor IS " + sql_literal(self.name) + ";")
        password = secrets.token_urlsafe(36)
        self.sql("postgres", f"CREATE ROLE {self.login} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD {sql_literal(password)};")
        self.created_login = True
        self.sql("postgres", f"GRANT aso_session_reader, aso_gate_executor TO {self.login};")
        self.sql(self.name, f"""
            SET search_path=aso,public;
            INSERT INTO aso.practices(id,name,key) VALUES
              ('{self.home}','Synthetic Home Practice','synthetic-home'),
              ('{self.other}','Synthetic Other Practice','synthetic-other');
            INSERT INTO aso.users(id,kratos_identity_id,practice_id,email,full_name)
              VALUES('{self.user}','{self.identity}','{self.home}',
                     'synthetic-session@example.invalid','Synthetic Session Probe');
            INSERT INTO aso.user_roles(user_id,role_id,practice_id)
              SELECT '{self.user}',id,'{self.home}' FROM aso.roles WHERE key='surgeon';
        """)
        role_ok = self.sql(self.name, f"""
            SELECT NOT (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication)
              AND rolcanlogin AND pg_has_role(oid,'aso_session_reader','USAGE')
              AND pg_has_role(oid,'aso_gate_executor','USAGE')
              AND NOT EXISTS(SELECT FROM pg_namespace WHERE nspname='aso' AND nspowner=r.oid)
              FROM pg_roles r WHERE rolname='{self.login}';
        """).stdout.strip()
        assert role_ok == "t"
        self.report["checks"]["disposable_login_is_nonowner_nonbypass_reader_and_executor_member"] = {"result": "Passed", "psql_output": "t"}
        self.database_url = (
            "postgresql://" + self.login + ":" + urllib.parse.quote(password, safe="")
            + f"@localhost:{port}/" + self.name
        )

    def start_app(self):
        self.mark("mount_actual_application")
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            port = listener.getsockname()[1]
        self.app = f"http://localhost:{port}"
        env = os.environ.copy()
        env.update({
            "ASO_DATABASE_URL": self.database_url,
            "ASO_GATE_DATABASE_URL": self.database_url,
            "ASO_KRATOS_PUBLIC_URL": KRATOS,
            "ASO_ALLOW_INSECURE_KRATOS": "true",
            "ASO_PORT": str(port),
            "RUST_LOG": "warn,aso_web_server=info",
        })
        env.pop("ASO_WEB_ROOT", None)
        self.process_log = tempfile.TemporaryFile()
        self.process = subprocess.Popen(
            ["cargo", "run", "-p", "aso-web-server"], cwd=ROOT, env=env,
            stdin=subprocess.DEVNULL, stdout=self.process_log,
            stderr=subprocess.STDOUT, start_new_session=True,
        )
        deadline = time.monotonic() + self.args.startup_seconds
        next_update = time.monotonic() + 30
        while time.monotonic() < deadline:
            if self.process.poll() is not None:
                self.report["app_exit_code"] = self.process.returncode
                raise RuntimeError("application_exited_before_readiness")
            try:
                status, headers, _ = self.http(self.direct, self.app + "/api/session", timeout=1)
                if status == 401 and headers.get("Cache-Control") == "no-store":
                    self.report["app_response_count"] += 1
                    self.report["no_store_response_count"] += 1
                    self.report["checks"]["actual_application_readiness"] = {"result": "Passed", "status": status, "no_store": True}
                    return
            except (urllib.error.URLError, TimeoutError, ConnectionError):
                pass
            if time.monotonic() >= next_update:
                print("Session probe: waiting for application readiness", file=sys.stderr, flush=True)
                next_update = time.monotonic() + 30
            time.sleep(0.25)
        raise TimeoutError("application_readiness_deadline")

    def assert_revision_advanced(self, earlier, later):
        old_incarnation, old_revision = earlier.split(":")
        new_incarnation, new_revision = later.split(":")
        assert old_incarnation == new_incarnation and int(new_revision) > int(old_revision)

    def exercise(self):
        self.mark("credential_transports_and_negative_controls")
        home_query = "practiceId=" + self.home
        native = {"Authorization": "Bearer " + self.token}
        session_token = {"X-Session-Token": self.token}
        initial = self.check_request("native_bearer", 200, native, home_query)
        native_x = self.check_request("native_x_session_token", 200, session_token, home_query)
        cookie = self.check_request("browser_cookie", 200, query=home_query, client=self.browser)
        assert initial == native_x
        assert initial["practiceId"] == cookie["practiceId"] == self.home
        assert set(initial["capabilities"]) == set(cookie["capabilities"]) == SURGEON_CAPABILITIES
        assert instant(initial["expiresAt"]) == instant(self.native_session["expires_at"])
        assert instant(cookie["expiresAt"]) == instant(self.browser_session["expires_at"])
        for key in SUMMARY_KEYS - {"expiresAt"}:
            assert initial[key] == cookie[key]
        assert initial["authorizationRevision"] == self.sql(
            self.name, "SELECT incarnation::text || ':' || revision::text FROM aso.authorization_revision;",
        ).stdout.strip()
        self.report["checks"]["transport_projection_matches_authoritative_whoami_and_database"] = {
            "result": "Passed", "identity_equal": True, "capability_count": 4,
            "native_expiry_matches_whoami": True, "browser_expiry_matches_whoami": True,
            "unchanged_authorization_revision_equal": True,
        }
        assert self.check_request("default_home_practice", 200, native) == initial
        self.check_request("anonymous", 401)
        self.check_request("invalid_bearer", 401, {"Authorization": "Bearer synthetic-invalid"})
        self.check_request("invalid_x_session_token", 401, {"X-Session-Token": "synthetic-invalid"})
        self.check_request("invalid_cookie", 401, {"Cookie": "ory_kratos_session=synthetic-invalid"})
        forged = {
            "X-User-Id": str(uuid.uuid4()), "X-User-Email": "forged@example.invalid",
            "X-Practice-Id": self.other, "X-Principal": "agent", "X-Capabilities": "configure",
        }
        self.check_request("forged_headers_without_credential", 401, forged)
        assert self.check_request("valid_credential_ignores_forged_headers", 200, {**native, **forged}, home_query) == initial
        self.check_request("foreign_practice", 403, native, "practiceId=" + self.other)
        self.check_request("extra_query_rejected", 400, native, home_query + "&role=admin")
        self.check_request("mixed_native_credentials", 401, {**native, **session_token})
        self.check_request("mixed_cookie_and_bearer", 401, native, client=self.browser)

        self.mark("live_capability_update_and_aba")
        self.sql(self.name, "DELETE FROM aso.role_capabilities WHERE role_id=(SELECT id FROM aso.roles WHERE key='surgeon') AND capability_key='sign_letter';")
        reduced = self.check_request("capability_removal_visible_next_request", 200, native, home_query)
        assert set(reduced["capabilities"]) == SURGEON_CAPABILITIES - {"sign_letter"}
        self.assert_revision_advanced(initial["authorizationRevision"], reduced["authorizationRevision"])
        self.sql(self.name, "INSERT INTO aso.role_capabilities(role_id,capability_key) SELECT id,'sign_letter' FROM aso.roles WHERE key='surgeon';")
        restored = self.check_request("capability_restore_visible_next_request", 200, native, home_query)
        assert set(restored["capabilities"]) == SURGEON_CAPABILITIES
        self.assert_revision_advanced(reduced["authorizationRevision"], restored["authorizationRevision"])
        assert restored["authorizationRevision"] != initial["authorizationRevision"]
        self.report["checks"]["authorization_revision_resists_aba"] = {"result": "Passed", "capabilities_restored": True, "revision_not_reused": True}

        self.mark("live_membership_and_user_status_changes")
        self.sql(self.name, f"DELETE FROM aso.user_roles WHERE user_id='{self.user}' AND practice_id='{self.home}';")
        self.check_request("membership_removal_visible_next_request", 403, native, home_query)
        self.check_request("default_home_requires_membership", 403, native)
        self.sql(self.name, f"INSERT INTO aso.user_roles(user_id,role_id,practice_id) SELECT '{self.user}',id,'{self.home}' FROM aso.roles WHERE key='surgeon';")
        membership_restored = self.check_request("membership_restore_visible_next_request", 200, native, home_query)
        self.assert_revision_advanced(restored["authorizationRevision"], membership_restored["authorizationRevision"])
        for state in ("suspended", "deactivated"):
            self.sql(self.name, f"UPDATE aso.users SET status='{state}' WHERE id='{self.user}';")
            self.check_request(state + "_user_refused", 403, native, home_query)
            self.sql(self.name, f"UPDATE aso.users SET status='active' WHERE id='{self.user}';")
            self.check_request(state + "_user_restored", 200, native, home_query)

        self.mark("runtime_login_privilege_changes")
        self.sql(self.name, f"GRANT UPDATE(display_name) ON aso.users TO {self.login};")
        try:
            self.check_request("runtime_login_column_write_grant_refused", 503, native, home_query)
        finally:
            self.sql(self.name, f"REVOKE UPDATE(display_name) ON aso.users FROM {self.login};")
        self.check_request("runtime_login_column_write_revoked_read_restored", 200, native, home_query)
        original_owner = self.sql(
            self.name, "SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='aso.facility_types'::regclass;",
        ).stdout.strip()
        self.sql(self.name, f"ALTER TABLE aso.facility_types OWNER TO {self.login};")
        try:
            self.check_request("runtime_login_table_ownership_refused", 503, native, home_query)
        finally:
            self.sql(self.name, "ALTER TABLE aso.facility_types OWNER TO " + sql_identifier(original_owner) + ";")
        self.check_request("runtime_login_table_ownership_restored_read_restored", 200, native, home_query)

        self.mark("identity_revocation_visible_next_request")
        status, _, _ = self.http(self.direct, ADMIN + "/admin/identities/" + self.identity, "DELETE")
        self.identity_deleted = status == 204
        assert self.identity_deleted
        self.check_request("revoked_native_session_refused", 401, native, home_query)
        self.check_request("revoked_browser_session_refused", 401, query=home_query, client=self.browser)
        assert self.report["app_response_count"] == self.report["no_store_response_count"]

    def cleanup(self):
        self.mark("cleanup_owned_resources")
        cleanup = self.report["cleanup"]
        if self.process is not None:
            try:
                if self.process.poll() is None:
                    os.killpg(self.process.pid, signal.SIGTERM)
                    try:
                        self.process.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        os.killpg(self.process.pid, signal.SIGKILL)
                        self.process.wait(timeout=10)
                cleanup["application_process_stopped"] = self.process.poll() is not None
            except Exception as error:
                cleanup["application_process_stopped"] = False
                cleanup["process_failure_type"] = type(error).__name__
        if self.process_log is not None:
            self.process_log.close()
            cleanup["temporary_process_log_deleted"] = True
        if self.identity:
            try:
                if not self.identity_deleted:
                    status, _, _ = self.http(self.direct, ADMIN + "/admin/identities/" + self.identity, "DELETE")
                    self.identity_deleted = status == 204
                status, _, _ = self.http(self.direct, ADMIN + "/admin/identities/" + self.identity)
                cleanup["synthetic_identity_deleted"] = self.identity_deleted and status == 404
                if self.token:
                    status, _, _ = self.http(self.direct, KRATOS + "/sessions/whoami", headers={"X-Session-Token": self.token})
                    cleanup["native_session_revoked"] = status == 401
                status, _, _ = self.http(self.browser, KRATOS + "/sessions/whoami")
                cleanup["browser_session_revoked"] = status == 401
            except Exception as error:
                cleanup["synthetic_identity_deleted"] = False
                cleanup["identity_failure_type"] = type(error).__name__
        for owned, label, statement in (
            (self.created_database, "disposable_database_deleted", f"DROP DATABASE {self.name};"),
            (self.created_login, "disposable_login_deleted", f"DROP ROLE {self.login};"),
        ):
            if owned:
                try:
                    cleanup[label] = self.sql("postgres", statement, False).returncode == 0
                except Exception as error:
                    cleanup[label] = False
                    cleanup[label + "_failure_type"] = type(error).__name__
        if self.created_reader:
            try:
                safe = self.sql("postgres", f"""
                    SELECT shobj_description(r.oid,'pg_authid')={sql_literal(self.name)}
                      AND NOT (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)
                      AND NOT EXISTS(SELECT FROM pg_auth_members WHERE roleid=r.oid OR member=r.oid)
                      AND NOT EXISTS(SELECT FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid=r.oid)
                    FROM pg_roles r WHERE rolname='aso_session_reader';
                """).stdout.strip() == "t"
                cleanup["probe_created_reader_deleted"] = safe and self.sql("postgres", "DROP ROLE aso_session_reader;", False).returncode == 0
            except Exception as error:
                cleanup["probe_created_reader_deleted"] = False
                cleanup["reader_failure_type"] = type(error).__name__
        else:
            cleanup["preexisting_reader_preserved"] = True
        if self.created_executor:
            try:
                safe = self.sql("postgres", f"""
                    SELECT shobj_description(r.oid,'pg_authid')={sql_literal(self.name)}
                      AND NOT (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)
                      AND NOT EXISTS(SELECT FROM pg_auth_members WHERE roleid=r.oid OR member=r.oid)
                      AND NOT EXISTS(SELECT FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid=r.oid)
                    FROM pg_roles r WHERE rolname='aso_gate_executor';
                """).stdout.strip() == "t"
                cleanup["probe_created_executor_deleted"] = safe and self.sql("postgres", "DROP ROLE aso_gate_executor;", False).returncode == 0
            except Exception as error:
                cleanup["probe_created_executor_deleted"] = False
                cleanup["executor_failure_type"] = type(error).__name__
        else:
            cleanup["preexisting_executor_preserved"] = True
        if any(value is False for value in cleanup.values()):
            self.report["result"] = "Failed"

    def run(self):
        try:
            self.create_identity()
            self.create_database()
            self.start_app()
            self.exercise()
            self.report["result"] = "Passed"
        except Exception as error:
            # Exception strings, subprocess output and HTTP payloads can contain
            # credentials. Preserve only the safe class and controlled stage.
            self.report["failure"] = {"stage": self.stage, "type": type(error).__name__}
        finally:
            self.cleanup()
            self.report["check_count"] = len(self.report["checks"])
            self.report["completed_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
            OUTPUT.parent.mkdir(parents=True, exist_ok=True)
            OUTPUT.write_text(json.dumps(self.report, indent=2) + "\n")
            print(json.dumps(self.report, indent=2))
        return 0 if self.report["result"] == "Passed" else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--postgres-user", default="flint")
    parser.add_argument("--postgres-port", type=int, help="Override the detected Docker Compose published port")
    parser.add_argument("--startup-seconds", type=int, default=180)
    return Probe(parser.parse_args()).run()


if __name__ == "__main__":
    sys.exit(main())
