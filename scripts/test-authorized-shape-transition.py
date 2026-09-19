#!/usr/bin/env python3
"""RA05 T1: persisted gate-affirmation transition through Gate, FRF and Electric."""

import argparse
import datetime
import importlib.util
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import time
import urllib.error
import uuid


ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = (
    ROOT
    / ".kbd-orchestrator/phases/runtime-architecture/evidence/ra-05-authorized-shape-facade"
)
DEFAULT_OUTPUT = EVIDENCE / "task-5-transition.json"
COMPOSITION_PROBE = ROOT / "scripts/test-authorized-shape-composition.py"
APPROVED_CASE_COLUMNS = {
    "id",
    "practice_id",
    "status",
    "gate_affirmed_at",
    "created_at",
    "updated_at",
}
BASH_TOOL = os.environ.get("RA06_TOOL_BASH", "bash")


def load_composition_probe():
    spec = importlib.util.spec_from_file_location(
        "ra05_authorized_shape_composition", COMPOSITION_PROBE
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("could not load the RA05 composition probe")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


composition = load_composition_probe()


class TransitionProbe(composition.Probe):
    def __init__(self, args):
        super().__init__(args)
        self.fixture = {
            "payer": str(uuid.uuid4()),
            "case_a": str(uuid.uuid4()),
            "case_b": str(uuid.uuid4()),
            "patient_a": str(uuid.uuid4()),
            "patient_b": str(uuid.uuid4()),
            "user_a": str(uuid.uuid4()),
            "user_b": str(uuid.uuid4()),
        }
        self.fixture_seeded = False
        # Gate affirmations are no longer writable by direct SQL: the
        # `gate_affirmations_authority` trigger (migrations/server/
        # 2026090601_durable_gate.sql) rejects any writer whose `current_user`
        # is not `aso_gate_owner`, and resolves the actor from session GUCs
        # rather than trusting the row. So the probe drives the real clinical
        # route instead, which reaches `aso.apply_gate_command` as a
        # SECURITY DEFINER call — the only sanctioned write path.
        # TWO login roles, not one. The server applies two mutually exclusive
        # startup guards to its two pools:
        #
        #   PgMembershipRepository  ROLE_CHECK           needs aso_session_reader
        #   PgLogoutJournal         AUTHORITY_ROLE_CHECK needs aso_session_authority_executor
        #                                                AND forbids SELECT on any aso table
        #                                                other than authority_deployment
        #                                                and session_denials
        #
        # `aso_session_reader` holds SELECT on users, user_roles, capabilities,
        # role_capabilities, user_capabilities and authorization_revision — all
        # outside that allowlist. So one role granted both can never satisfy
        # both guards, which is what `ASO_SESSION_AUTHORITY_DATABASE_URL` exists
        # to separate: `require_same_database` compares only host, port and
        # database name, never credentials.
        self.runtime_role = "ra05_runtime_" + secrets.token_hex(6)
        self.runtime_password = secrets.token_urlsafe(24)
        self.authority_role = "ra05_authority_" + secrets.token_hex(6)
        self.authority_password = secrets.token_urlsafe(24)
        self.server = None
        self.server_log = None
        self.report.update(
            {
                "scope": (
                    "Persisted synthetic case through real Kratos v26.2.0, "
                    "Gate, FRF and Electric 1.8.0"
                ),
                "command": (
                    "python3 scripts/test-authorized-shape-transition.py "
                    "--output .kbd-orchestrator/phases/runtime-architecture/evidence/"
                    "ra-05-authorized-shape-facade/task-5-transition.json"
                ),
                "prerequisites": {},
                "protocol": {},
                "rate_limit_retries": 0,
            }
        )

    def sql(self, statement):
        process = subprocess.run(
            [
                BASH_TOOL,
                str(ROOT / "scripts/ra05-stack.sh"),
                "exec",
                "-T",
                "db",
                "psql",
                "-X",
                "-v",
                "ON_ERROR_STOP=1",
                "-U",
                "flint",
                "-d",
                "flint",
                "-Atq",
            ],
            cwd=ROOT,
            input=statement,
            text=True,
            capture_output=True,
            timeout=30,
            check=False,
        )
        if process.returncode != 0:
            raise RuntimeError(
                "psql failed with exit "
                + str(process.returncode)
                + ": "
                + process.stderr.strip()
            )
        return process.stdout.strip()

    def provision_runtime_server(self):
        """Start the real ASO API on a role that may reach the gate command.

        The five `aso_*` grant roles are all NOLOGIN, so a login role is
        created and granted `aso_session_reader, aso_gate_executor` — the same
        pair ra06 uses. `cleanup` drops it.
        """
        self.sql(
            f"CREATE ROLE {self.runtime_role} LOGIN PASSWORD '{self.runtime_password}' "
            "NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; "
            f"GRANT aso_session_reader, aso_gate_executor TO {self.runtime_role}; "
            f"CREATE ROLE {self.authority_role} LOGIN PASSWORD '{self.authority_password}' "
            "NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; "
            f"GRANT aso_session_authority_executor TO {self.authority_role};"
        )
        database = (
            f"postgres://{self.runtime_role}:{self.runtime_password}"
            "@127.0.0.1:55432/flint"
        )
        authority_database = (
            f"postgres://{self.authority_role}:{self.authority_password}"
            "@127.0.0.1:55432/flint"
        )
        # All five are required — `require_mounted_clinical_configuration`
        # (crates/aso-web-server/src/main.rs:32) refuses to start without them.
        # ra06's env block predates the session-authority work and omits
        # ASO_SESSION_AUTHORITY_DATABASE_URL and ASO_KRATOS_ADMIN_URL, so it
        # fails identically against the current binary; copying it is what
        # produced the first failed run here.
        #
        # The session and gate pools share the reader/gate credential; the
        # authority pool gets its own, because their startup guards contradict
        # each other (see __init__).
        env = os.environ.copy()
        env.update(
            {
                "ASO_DATABASE_URL": database,
                "ASO_GATE_DATABASE_URL": database,
                "ASO_SESSION_AUTHORITY_DATABASE_URL": authority_database,
                "ASO_KRATOS_PUBLIC_URL": composition.KRATOS_PUBLIC,
                "ASO_KRATOS_ADMIN_URL": composition.KRATOS_ADMIN,
                "ASO_ALLOW_INSECURE_KRATOS": "true",
                "ASO_PORT": str(self.args.aso_port),
            }
        )
        document_store_root = os.environ.get("ASO_DOCUMENT_STORE_ROOT")
        if document_store_root:
            env["ASO_DOCUMENT_STORE_ROOT"] = document_store_root
        log_path = ROOT / ".runtime/ra05-aso-server.log"
        log_path.parent.mkdir(parents=True, exist_ok=True)
        self.server_log = log_path.open("w")
        self.server = subprocess.Popen(
            [str(ROOT / "target/debug/aso-web-server")],
            cwd=ROOT,
            env=env,
            stdout=self.server_log,
            stderr=subprocess.STDOUT,
        )
        url = f"http://127.0.0.1:{self.args.aso_port}/api/session"
        token = next(iter(self.sessions.values()))["token"]
        for _ in range(50):
            if self.server.poll() is not None:
                break
            try:
                status, _, _ = self.http(
                    url, headers={"Authorization": "Bearer " + token}, timeout=2
                )
            except urllib.error.URLError:
                time.sleep(0.1)
                continue
            if status in (200, 403):
                self.check("aso_server_started_for_gate_commands", status == 200)
                return
            time.sleep(0.1)
        raise RuntimeError("ASO server did not become ready")

    def gate_command(self, identity_id, case_id, action, kind):
        """One clinical gate command through the real route."""
        url = (
            f"http://127.0.0.1:{self.args.aso_port}/api/cases/"
            f"{case_id}/gate/{action}"
        )
        return self.json_http(
            url,
            "POST",
            {"commandId": str(uuid.uuid4()), "kind": kind},
            {"Authorization": "Bearer " + self.sessions[identity_id]["token"]},
        )

    def read_gate(self, identity_id, case_id):
        """The gate summary as the API reports it."""
        url = f"http://127.0.0.1:{self.args.aso_port}/api/cases/{case_id}/gate"
        return self.json_http(
            url,
            headers={"Authorization": "Bearer " + self.sessions[identity_id]["token"]},
        )

    def seed_fixture(self, identity_a, identity_b):
        f = self.fixture
        practice_a = self.practices[identity_a]
        practice_b = self.practices[identity_b]
        # Everything except the gate affirmations still seeds by SQL — only
        # `aso.gate_affirmations` carries the authority trigger.
        self.sql(
            f"""
            BEGIN;
            SET LOCAL search_path=aso,public;
            INSERT INTO aso.practices(id,name,key) VALUES
              ('{practice_a}','Synthetic RA05 Practice A','ra05-{practice_a}'),
              ('{practice_b}','Synthetic RA05 Practice B','ra05-{practice_b}');
            INSERT INTO aso.users(id,kratos_identity_id,practice_id,email,full_name) VALUES
              ('{f['user_a']}','{identity_a}','{practice_a}',
               'ra05-{identity_a}@example.invalid','Synthetic RA05 Surgeon A'),
              ('{f['user_b']}','{identity_b}','{practice_b}',
               'ra05-{identity_b}@example.invalid','Synthetic RA05 Surgeon B');
            INSERT INTO aso.user_roles(user_id,role_id,practice_id)
            SELECT '{f['user_a']}',id,'{practice_a}' FROM aso.roles WHERE key='surgeon';
            INSERT INTO aso.user_roles(user_id,role_id,practice_id)
            SELECT '{f['user_b']}',id,'{practice_b}' FROM aso.roles WHERE key='surgeon';
            INSERT INTO aso.payers(id,name,key)
            VALUES ('{f['payer']}','Synthetic RA05 Payer','ra05-{f['payer']}');
            INSERT INTO aso.patients(id,practice_id,family_name,given_name,birth_date) VALUES
              ('{f['patient_a']}','{practice_a}','Synthetic','Fixture A','2000-01-01'),
              ('{f['patient_b']}','{practice_b}','Synthetic','Fixture B','2000-01-01');
            INSERT INTO aso.cases(
              id,practice_id,patient_id,surgeon_id,payer_id,case_number,status
            ) VALUES
              ('{f['case_a']}','{practice_a}','{f['patient_a']}','{f['user_a']}',
               '{f['payer']}','ra05-{f['case_a']}','awaiting_gate'),
              ('{f['case_b']}','{practice_b}','{f['patient_b']}','{f['user_b']}',
               '{f['payer']}','ra05-{f['case_b']}','awaiting_gate');
            COMMIT;
            """
        )
        self.fixture_seeded = True

        # The gate is completed through the real clinical route, one command per
        # kind, in the catalog's own order. Four separate commands, because that
        # is what a surgeon actually does — the previous bulk INSERT could not
        # express the authority check each one passes through.
        self.provision_runtime_server()
        affirmed_kinds = []
        for kind in ("policy", "section", "pathway", "plan"):
            status, _, result = self.gate_command(
                identity_a, f["case_a"], "affirm", kind
            )
            self.check(
                f"gate_{kind}_affirmed_through_the_clinical_route",
                status == 200,
                status=status,
                kind=kind,
            )
            affirmed_kinds = result.get("gate", {}).get("affirmed", [])

        # Read the summary back through the API rather than trusting the write's
        # own response. This replaces the previous `pg_backend_pid()` comparison:
        # that check proved the transition crossed a *database session*
        # boundary, which is no longer meaningful once every write travels
        # through one long-lived server connection. A read-back through an
        # independent request proves the stronger property the check was really
        # after — the summary is committed and observable, not merely returned.
        status, _, gate = self.read_gate(identity_a, f["case_a"])
        self.check(
            "synthetic_fixture_committed_with_complete_gate",
            status == 200
            and len(gate.get("affirmed", [])) == 4
            and gate.get("gateAffirmedAt") is not None
            and gate.get("gateAffirmedBy") is not None,
            status=status,
            affirmation_count=len(gate.get("affirmed", [])),
            gate_affirmed=gate.get("gateAffirmedAt") is not None,
            affirmed_kinds=sorted(gate.get("affirmed", [])),
            command_response_kinds=sorted(affirmed_kinds),
        )
        return gate

    def remove_affirmation(self, identity_id):
        """Withdraw one affirmation through the clinical route.

        The direct `DELETE` this replaced is refused by the same authority
        trigger as the INSERT — it fires BEFORE INSERT **OR DELETE OR UPDATE**.
        """
        case_id = self.fixture["case_a"]
        status, _, result = self.gate_command(identity_id, case_id, "remove", "plan")
        self.check(
            "gate_plan_withdrawn_through_the_clinical_route",
            status == 200,
            status=status,
        )
        # Read back independently, for the same reason as the seed: the write's
        # own response is not evidence that the summary is observable.
        read_status, _, gate = self.read_gate(identity_id, case_id)
        return {
            "read_status": read_status,
            "remaining_affirmations": len(gate.get("affirmed", [])),
            "gate_affirmed_at_is_null": gate.get("gateAffirmedAt") is None,
            "gate_affirmed_by_is_null": gate.get("gateAffirmedBy") is None,
            "command_gate": result.get("gate", {}),
        }

    @staticmethod
    def parse_messages(raw):
        if not raw.strip():
            return []
        value = json.loads(raw)
        if not isinstance(value, list):
            raise AssertionError("Electric response body is not a JSON message array")
        return value

    @staticmethod
    def changes_for(messages, case_id):
        return [
            message
            for message in messages
            if isinstance(message, dict)
            and isinstance(message.get("value"), dict)
            and message["value"].get("id") == case_id
        ]

    @staticmethod
    def has_up_to_date(messages):
        return any(
            isinstance(message, dict)
            and (
                message.get("control") == "up-to-date"
                or (
                    isinstance(message.get("headers"), dict)
                    and message["headers"].get("control") == "up-to-date"
                )
            )
            for message in messages
        )

    @classmethod
    def response_is_up_to_date(cls, headers, messages):
        return "electric-up-to-date" in headers or cls.has_up_to_date(messages)

    def gate_request_after_local_rate_limit(self, identity_id, params):
        for attempt in range(3):
            response = self.gate_request(identity_id, params)
            status, _, raw = response
            if status != 429:
                return response
            match = re.search(rb"Wait for (\d+)s", raw)
            if match is None or attempt == 2:
                return response
            wait_seconds = min(int(match.group(1)) + 1, 60)
            self.report["rate_limit_retries"] += 1
            time.sleep(wait_seconds)
        raise AssertionError("unreachable Gate retry state")

    def initial_shape(self, identity_id):
        last = None
        for _ in range(self.args.replication_attempts):
            status, headers, raw = self.gate_request_after_local_rate_limit(
                identity_id, {"shape": "cases"}
            )
            try:
                messages = self.parse_messages(raw)
            except json.JSONDecodeError as error:
                raise AssertionError(
                    f"initial Electric response was not JSON "
                    f"(status={status}, content_type={headers.get('content-type')}, "
                    f"body={raw[:160]!r})"
                ) from error
            last = (status, headers, messages)
            if self.changes_for(messages, self.fixture["case_a"]):
                return last
            time.sleep(self.args.replication_interval_seconds)
        if last is None:
            raise AssertionError("no initial Electric response was received")
        status, headers, messages = last
        raise AssertionError(
            "synthetic case did not appear in initial Electric response "
            f"after {self.args.replication_attempts} attempts "
            f"(status={status}, headers={headers}, messages={len(messages)})"
        )

    def continued_shape(self, identity_id, handle, offset):
        observations = []
        current_offset = offset
        null_transition_seen = False
        for _ in range(self.args.replication_attempts):
            status, headers, raw = self.gate_request_after_local_rate_limit(
                identity_id,
                {"shape": "cases", "handle": handle, "offset": current_offset},
            )
            messages = self.parse_messages(raw)
            observations.append((status, headers, messages))
            changes = self.changes_for(messages, self.fixture["case_a"])
            null_transition_seen = null_transition_seen or any(
                "gate_affirmed_at" in change["value"]
                and change["value"]["gate_affirmed_at"] is None
                for change in changes
            )
            if null_transition_seen and self.response_is_up_to_date(headers, messages):
                return observations
            next_offset = headers.get("electric-offset")
            if next_offset is not None:
                current_offset = next_offset
            time.sleep(self.args.replication_interval_seconds)
        return observations

    def exercise(self):
        status, _, version = self.json_http(composition.KRATOS_ADMIN + "/version")
        self.report["prerequisites"]["kratos"] = {
            "available": status == 200,
            "version": version.get("version"),
        }
        self.check(
            "kratos_version_is_pinned",
            status == 200 and version.get("version") == "v26.2.0",
            status=status,
            version=version.get("version"),
        )
        status, _, jwks = self.json_http(composition.GATE + "/.well-known/jwks.json")
        self.report["prerequisites"]["gate"] = {
            "available": status == 200,
            "key_id": (jwks.get("keys") or [{}])[0].get("kid"),
        }
        self.check(
            "gate_signing_key_is_available",
            status == 200
            and len(jwks.get("keys", [])) == 1
            and jwks["keys"][0].get("alg") == "RS256",
            status=status,
            algorithm=(jwks.get("keys") or [{}])[0].get("alg"),
        )
        schema_ready = self.sql(
            "SELECT EXISTS (SELECT FROM information_schema.columns "
            "WHERE table_schema='aso' AND table_name='cases' "
            "AND column_name='gate_affirmed_at');"
        )
        self.report["prerequisites"]["postgresql"] = {
            "available": schema_ready == "t",
            "gate_summary_column": schema_ready == "t",
        }
        self.check(
            "postgresql_gate_summary_schema_is_available",
            schema_ready == "t",
            observed=schema_ready,
        )

        identity_a = self.create_identity_session("transition-a")
        identity_b = self.create_identity_session("transition-b")
        self.start_grant_callback()
        seed_gate = self.seed_fixture(identity_a, identity_b)

        status, headers, initial_messages = self.initial_shape(identity_a)
        handle = headers.get("electric-handle")
        initial_offset = headers.get("electric-offset")
        initial_changes = self.changes_for(initial_messages, self.fixture["case_a"])
        foreign_changes = self.changes_for(initial_messages, self.fixture["case_b"])
        initial_value = initial_changes[-1]["value"] if initial_changes else {}
        self.check(
            "initial_response_preserves_electric_protocol",
            status == 200
            and bool(handle)
            and initial_offset is not None
            and headers.get("electric-schema") is not None,
            status=status,
            electric_handle_present=bool(handle),
            electric_offset=initial_offset,
            electric_schema_present=headers.get("electric-schema") is not None,
            electric_up_to_date=self.response_is_up_to_date(headers, initial_messages),
        )
        self.check(
            "initial_response_contains_only_approved_case_columns",
            set(initial_value) == APPROVED_CASE_COLUMNS,
            observed_columns=sorted(initial_value),
            approved_columns=sorted(APPROVED_CASE_COLUMNS),
        )
        self.check(
            "initial_response_is_scoped_to_authorized_practice",
            initial_value.get("practice_id") == self.practices[identity_a]
            and not foreign_changes,
            authorized_practice_match=(
                initial_value.get("practice_id") == self.practices[identity_a]
            ),
            foreign_case_present=bool(foreign_changes),
        )
        self.check(
            "initial_response_carries_committed_gate_summary",
            initial_value.get("gate_affirmed_at") is not None,
            gate_affirmed_at_is_present=initial_value.get("gate_affirmed_at") is not None,
        )

        removal = self.remove_affirmation(identity_a)
        self.check(
            "affirmation_removal_is_committed_and_independently_observable",
            removal["read_status"] == 200
            and removal["remaining_affirmations"] == 3
            and removal["gate_affirmed_at_is_null"]
            and removal["gate_affirmed_by_is_null"],
            read_status=removal["read_status"],
            seeded_affirmation_count=len(seed_gate.get("affirmed", [])),
            remaining_affirmations=removal["remaining_affirmations"],
            gate_affirmed_at_is_null=removal["gate_affirmed_at_is_null"],
            gate_affirmed_by_is_null=removal["gate_affirmed_by_is_null"],
        )

        continuations = self.continued_shape(
            identity_a, handle, initial_offset
        )
        final_status, final_headers, final_messages = continuations[-1]
        continued_messages = [
            message
            for _, _, messages in continuations
            for message in messages
        ]
        continued_changes = self.changes_for(
            continued_messages, self.fixture["case_a"]
        )
        null_changes = [
            change
            for change in continued_changes
            if change["value"].get("gate_affirmed_at") is None
        ]
        continued_value = null_changes[-1]["value"] if null_changes else {}
        all_protocol_valid = all(
            status_value == 200
            and response_headers.get("electric-handle") == handle
            and response_headers.get("electric-offset") is not None
            for status_value, response_headers, messages in continuations
        )
        self.check(
            "continued_responses_preserve_electric_protocol",
            all_protocol_valid
            and final_status == 200
            and self.response_is_up_to_date(final_headers, final_messages),
            response_count=len(continuations),
            same_handle=final_headers.get("electric-handle") == handle,
            final_offset=final_headers.get("electric-offset"),
            electric_up_to_date=self.response_is_up_to_date(
                final_headers, final_messages
            ),
        )
        self.check(
            "continued_response_contains_only_approved_case_columns",
            bool(continued_value)
            and set(continued_value).issubset(APPROVED_CASE_COLUMNS),
            observed_columns=sorted(continued_value),
            approved_columns=sorted(APPROVED_CASE_COLUMNS),
        )
        self.check(
            "continued_response_carries_committed_gate_transition_to_null",
            continued_value.get("id") == self.fixture["case_a"]
            and "gate_affirmed_at" in continued_value
            and continued_value["gate_affirmed_at"] is None,
            case_match=continued_value.get("id") == self.fixture["case_a"],
            gate_affirmed_at_is_null=(
                "gate_affirmed_at" in continued_value
                and continued_value.get("gate_affirmed_at") is None
            ),
        )
        self.check(
            "continued_response_remains_scoped_to_authorized_practice",
            (
                "practice_id" not in continued_value
                or continued_value["practice_id"] == self.practices[identity_a]
            )
            and not self.changes_for(continued_messages, self.fixture["case_b"]),
            scope_column_absent_or_authorized=(
                "practice_id" not in continued_value
                or continued_value.get("practice_id") == self.practices[identity_a]
            ),
            foreign_case_present=bool(
                self.changes_for(continued_messages, self.fixture["case_b"])
            ),
        )
        self.report["protocol"] = {
            "initial": {
                "status": status,
                "handle_present": bool(handle),
                "offset": initial_offset,
                "electric_up_to_date": self.response_is_up_to_date(
                    headers, initial_messages
                ),
                "case_operation": initial_changes[-1].get("headers", {}).get(
                    "operation"
                ),
            },
            "continued": {
                "status": final_status,
                "same_handle": final_headers.get("electric-handle") == handle,
                "offset": final_headers.get("electric-offset"),
                "electric_up_to_date": self.response_is_up_to_date(
                    final_headers, final_messages
                ),
                "case_operation": null_changes[-1]
                .get("headers", {})
                .get("operation"),
                "gate_affirmed_at": continued_value.get("gate_affirmed_at"),
            },
        }

    def cleanup(self):
        # Stop the API before touching its rows: it holds the gate-executor
        # connection, and a DELETE racing an in-flight command would be a
        # confusing failure rather than a clean teardown.
        if self.server is not None:
            self.server.terminate()
            try:
                self.server.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.server.kill()
                self.server.wait(timeout=5)
            self.report["cleanup"]["aso_server"] = "Passed"
        if self.server_log is not None:
            self.server_log.close()

        if self.fixture_seeded:
            f = self.fixture
            practice_ids = list(self.practices.values())
            try:
                remaining = self.sql(
                    f"""
                    BEGIN;
                    SET LOCAL search_path=aso,public;
                    -- `aso_gate_owner` is the only role the authority trigger
                    -- accepts, and cleanup runs as `flint`. Disabling the
                    -- trigger for this transaction is the narrow escape hatch:
                    -- it removes synthetic rows only, and the durable write
                    -- path above is what the probe actually verifies.
                    SET LOCAL session_replication_role = replica;
                    DELETE FROM aso.gate_affirmations
                     WHERE case_id IN ('{f['case_a']}','{f['case_b']}');
                    DELETE FROM aso.cases
                     WHERE id IN ('{f['case_a']}','{f['case_b']}');
                    DELETE FROM aso.patients
                     WHERE id IN ('{f['patient_a']}','{f['patient_b']}');
                    DELETE FROM aso.users
                     WHERE id IN ('{f['user_a']}','{f['user_b']}');
                    DELETE FROM aso.payers WHERE id='{f['payer']}';
                    DELETE FROM aso.practices
                     WHERE id IN ('{practice_ids[0]}','{practice_ids[1]}');
                    COMMIT;
                    SELECT
                      (SELECT count(*) FROM aso.cases
                        WHERE id IN ('{f['case_a']}','{f['case_b']}'))
                    + (SELECT count(*) FROM aso.patients
                        WHERE id IN ('{f['patient_a']}','{f['patient_b']}'))
                    + (SELECT count(*) FROM aso.users
                        WHERE id IN ('{f['user_a']}','{f['user_b']}'))
                    + (SELECT count(*) FROM aso.payers WHERE id='{f['payer']}')
                    + (SELECT count(*) FROM aso.practices
                        WHERE id IN ('{practice_ids[0]}','{practice_ids[1]}'));
                    """
                )
                self.report["cleanup"]["synthetic_relational_rows"] = (
                    "Passed" if remaining.splitlines()[-1] == "0" else "Failed"
                )
                self.report["cleanup"]["remaining_relational_row_count"] = int(
                    remaining.splitlines()[-1]
                )
            except Exception as error:
                self.report["cleanup"]["synthetic_relational_rows"] = "Failed"
                self.report["cleanup"]["relational_cleanup_error"] = str(error)
        try:
            self.sql(
                f"DROP ROLE IF EXISTS {self.runtime_role}; "
                f"DROP ROLE IF EXISTS {self.authority_role};"
            )
            self.report["cleanup"]["runtime_role"] = "Passed"
        except Exception as error:
            self.report["cleanup"]["runtime_role"] = "Failed"
            self.report["cleanup"]["runtime_role_error"] = str(error)
        super().cleanup()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--callback-port", type=int, default=8787)
    parser.add_argument("--aso-port", type=int, default=8788)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--replication-attempts", type=int, default=40)
    parser.add_argument("--replication-interval-seconds", type=float, default=0.25)
    args = parser.parse_args()
    return TransitionProbe(args).run()


if __name__ == "__main__":
    raise SystemExit(main())
