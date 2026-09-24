#!/usr/bin/env python3
"""Tier 1: disposable PostgreSQL fixture for the actual durable gate transaction.

Run with the workspace Cargo build directory idle:
  RUSTUP_TOOLCHAIN=1.98.1 python3 scripts/test-gate-transaction.py

The default upgrade mode seeds populated legacy cases before migration.
Use --install-mode fresh --output <receipt path> to migrate an empty clinical
schema before seeding the same transaction lifecycle fixture.

Requires the existing Compose db service, its configured admin password, and
the pinned Rust toolchain. No Kratos service is required: the ignored Rust test
constructs server-produced contexts through the verified-session test seam.
Only synthetic records are seeded. Credentials and raw subprocess output stay
in memory; evidence retains assertion labels and aggregate test results only.
"""

import argparse
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import signal
import subprocess
import sys
import tempfile
import urllib.parse
import uuid


ROOT = Path(__file__).resolve().parents[1]
DOCKER_TOOL = os.environ.get("RA06_TOOL_DOCKER", "docker")
CARGO_TOOL = os.environ.get("RA06_TOOL_CARGO", "cargo")
OUTPUT = ROOT / ".kbd-orchestrator/phases/runtime-architecture/evidence/ra-02-durable-affirmation/transaction.json"
ROLES = (
    "aso_session_reader",
    "aso_gate_executor",
    "aso_gate_owner",
    "aso_case_executor",
    "aso_case_owner",
    "aso_authority_event_reader",
)
MIGRATE = [CARGO_TOOL, "run", "-p", "aso-web-server", "--", "--migrate-server"]
TEST = [
    CARGO_TOOL,
    "test",
    "-p",
    "aso-web-server",
    "adapters::gate::transaction_tests::gate_transaction_lifecycle",
    "--",
    "--ignored",
    "--exact",
    "--nocapture",
]
MIGRATION_VERSION = 2026090601
SOURCE_FILES = (
    "migrations/server/2026090601_durable_gate.sql",
    "crates/aso-web-server/src/adapters/gate.rs",
    "crates/aso-web-server/src/adapters/gate/transaction_tests.rs",
    "crates/aso-host/src/affirmation.rs",
    "crates/aso-host/src/lib.rs",
    "docs/design/schema/schema.sql",
    "docker/bootstrap/25-session-authority.sql",
    "scripts/test-gate-transaction.py",
)
CLINICAL_FIXTURE_TABLES = (
    "practices", "users", "user_roles", "patients", "patient_identities",
    "cases", "documents", "case_evidence", "evidence_citations", "annotations",
    "case_pathways", "case_procedure_codes", "case_diagnosis_codes",
    "gate_affirmations", "letters", "letter_claims", "letter_qa_results",
    "submissions", "submission_attachments", "receipts", "receipt_items",
    "custody_events", "peer_reviews", "determinations", "audit_events",
)


def literal(value):
    return "'" + value.replace("'", "''") + "'"


def identifier(value):
    return '"' + value.replace('"', '""') + '"'


class Probe:
    def __init__(self, args):
        self.args = args
        # Mounted probes import this helper with their existing argument set.
        self.install_mode = getattr(args, "install_mode", "upgrade")
        self.output = Path(getattr(args, "output", OUTPUT))
        self.name = "synthetic_ra02_" + uuid.uuid4().hex
        self.login = self.name + "_login"
        self.owner_role = self.name + "_owner"
        self.owner_role_available = False
        self.home = str(uuid.uuid4())
        self.foreign = str(uuid.uuid4())
        self.case = str(uuid.uuid4())
        self.foreign_case = str(uuid.uuid4())
        self.upgrade_cases = {
            label: str(uuid.uuid4())
            for label in ("stale_empty", "stale_complete", "correct_complete")
        }
        self.contexts = {
            label: {
                "identity_id": str(uuid.uuid4()),
                "actor_id": str(uuid.uuid4()),
                "practice_id": self.foreign if label == "foreign" else self.home,
            }
            for label in ("A", "B", "admin", "foreign")
        }
        self.created_database = False
        self.created_login = False
        self.created_roles = set()
        self.preexisting_roles = set()
        self.stage = "initialization"
        self.report = {
            "result": "Failed",
            "verification_tier": 1,
            "install_mode": self.install_mode,
            "observed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "scope": "Actual AppServices and PgGateRepository against a disposable PostgreSQL database",
            "prerequisites": [
                "Existing Docker Compose db service with schema extensions available",
                "Configured PostgreSQL admin password from container environment",
                "Pinned Rust toolchain and idle workspace Cargo build directory",
                "No concurrent database fixtures; a local exclusive lock covers this runner",
            ],
            "commands": [
                "RUSTUP_TOOLCHAIN=1.98.1 python3 scripts/test-gate-transaction.py --install-mode " + self.install_mode,
                "docker compose port db 5432",
                "docker compose exec -T db printenv POSTGRES_PASSWORD (captured only)",
                "docker compose exec -T db psql -U <configured admin> -X -A -t -q -v ON_ERROR_STOP=1 -d <disposable database> (SQL on stdin)",
                " ".join(MIGRATE),
                " ".join(TEST),
            ],
            "environment_contract": {
                "migration": ["ASO_MIGRATION_DATABASE_URL"],
                "test": ["ASO_TEST_DATABASE_URL", "ASO_TEST_ADMIN_DATABASE_URL", "ASO_TEST_OWNER_ROLE", "ASO_TEST_GATE_CONTEXTS", "ASO_TEST_GATE_CASE_ID", "ASO_TEST_FOREIGN_CASE_ID"],
                "credentials": "Disposable passwords supplied only through environment or captured SQL stdin",
            },
            "checks": {},
            "processes": [],
            "cleanup": {},
            "unverified": ["Mounted HTTP/gateway, UI and physical devices are outside this transaction fixture."],
        }

    def mark(self, stage):
        self.stage = stage
        print("Gate transaction probe: " + stage, file=sys.stderr, flush=True)

    def sql(self, database, statement, require_success=True):
        completed = subprocess.run(
            [DOCKER_TOOL, "compose", "exec", "-T", "db", "psql", "-U",
             self.args.postgres_user, "-X", "-A", "-t", "-q", "-v",
             "ON_ERROR_STOP=1", "-d", database],
            input=statement, capture_output=True, text=True, cwd=ROOT, timeout=60,
        )
        if require_success and completed.returncode:
            raise RuntimeError("database_statement_failed")
        return completed

    def check(self, label, condition, **details):
        self.report["checks"][label] = {
            "result": "Passed" if condition else "Failed", **details,
        }
        if not condition:
            raise AssertionError(label)

    def roles_present(self):
        return set(self.sql("postgres", "SELECT rolname FROM pg_roles WHERE rolname IN (" +
                            ",".join(literal(role) for role in ROLES) + ");").stdout.split())

    def with_role_tracking(self, action):
        # Snapshot immediately around each role-creating bootstrap/migration,
        # including partial failures; preserve every role present beforehand.
        before = self.roles_present()
        try:
            return action()
        finally:
            added = self.roles_present() - before
            self.created_roles.update(added)
            for role in added:
                self.sql("postgres", "COMMENT ON ROLE " + identifier(role) + " IS " + literal(self.name) + ";")

    def run_process(self, label, command, env):
        self.mark(label)
        entry = {"label": label, "command": command, "return_code": None}
        self.report["processes"].append(entry)
        process = subprocess.Popen(command, env=env, cwd=ROOT, text=True,
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                   start_new_session=True)
        try:
            stdout, stderr = process.communicate(timeout=self.args.command_seconds)
        except (subprocess.TimeoutExpired, KeyboardInterrupt) as error:
            entry["timed_out"] = isinstance(error, subprocess.TimeoutExpired)
            # Cargo can leave a test or migration child alive if only its own
            # process is killed. Stop this runner's process group before DB cleanup.
            try:
                os.killpg(process.pid, signal.SIGTERM)
                process.communicate(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.communicate(timeout=10)
            except ProcessLookupError:
                process.communicate(timeout=10)
            entry["return_code"] = process.returncode
            raise
        completed = subprocess.CompletedProcess(command, process.returncode, stdout, stderr)
        entry["return_code"] = completed.returncode
        # Do not serialize panic messages or logs: they may carry connection
        # parameters. Only strict synthetic assertions and Rust totals leave.
        output = completed.stdout + "\n" + completed.stderr
        entry["actual_result_output"] = [
            line.strip() for line in output.splitlines()
            if re.fullmatch(r"gate_transaction_check: [a-z][a-z0-9_]*", line.strip())
            or re.fullmatch(r"case_transaction_check: [a-z][a-z0-9_]*", line.strip())
            or re.fullmatch(r"test [a-zA-Z0-9_:]*gate_transaction_lifecycle \.\.\. (ok|FAILED)", line.strip())
            or re.fullmatch(r"test [a-zA-Z0-9_:]*case_command_service_lifecycle \.\.\. (ok|FAILED)", line.strip())
            or re.fullmatch(r"test [a-zA-Z0-9_:]*case_write_target_authorization_without_read_capability \.\.\. (ok|FAILED)", line.strip())
            or re.fullmatch(r"test result: (ok|FAILED)\. \d+ passed; \d+ failed; \d+ ignored; \d+ measured; \d+ filtered out; finished in [0-9.]+s", line.strip())
        ]
        return completed, entry

    def create_database(self):
        self.mark("disposable_database_and_" + self.install_mode + "_fixture")
        self.preexisting_roles = self.roles_present()
        port = self.args.postgres_port
        if port is None:
            published = subprocess.run([DOCKER_TOOL, "compose", "port", "db", "5432"],
                                       cwd=ROOT, capture_output=True, text=True, timeout=20)
            self.check("postgres_port_discovery", published.returncode == 0,
                       return_code=published.returncode)
            port = int(published.stdout.strip().splitlines()[0].rsplit(":", 1)[1])
        if not 0 < port < 65536:
            raise ValueError("invalid_database_port")
        password_result = subprocess.run(
            [DOCKER_TOOL, "compose", "exec", "-T", "db", "printenv", "POSTGRES_PASSWORD"],
            cwd=ROOT, capture_output=True, text=True, timeout=20,
        )
        self.check("configured_admin_password_available",
                   password_result.returncode == 0 and bool(password_result.stdout.strip()),
                   return_code=password_result.returncode)
        admin_password = password_result.stdout.strip()
        self.admin_url = "postgresql://" + urllib.parse.quote(self.args.postgres_user, safe="") + ":" + urllib.parse.quote(admin_password, safe="") + f"@localhost:{port}/" + self.name
        self.sql("postgres", "CREATE DATABASE " + identifier(self.name) + ";")
        self.created_database = True
        self.sql(self.name, (ROOT / "docs/design/schema/schema.sql").read_text())
        self.with_role_tracking(lambda: self.sql(self.name, (ROOT / "docker/bootstrap/25-session-authority.sql").read_text()))
        if self.install_mode == "fresh":
            self.assert_empty_clinical_schema("fresh_schema_has_no_clinical_rows_before_migration")
        else:
            self.seed_case_fixture()
            self.seed_upgrade_summaries()

    def assert_empty_clinical_schema(self, label, migrated=False):
        tables = CLINICAL_FIXTURE_TABLES + (
            ("gate_commands", "case_commands") if migrated else ()
        )
        fields = ",".join(literal(table) + ", (SELECT count(*) FROM aso." + identifier(table) + ")"
                          for table in tables)
        counts = json.loads(self.sql(self.name, "SELECT jsonb_build_object(" + fields + ")::text;").stdout.strip())
        self.check(label, all(count == 0 for count in counts.values()), row_counts=counts)

    def seed_case_fixture(self):
        self.mark("seed_" + self.install_mode + "_transaction_fixture")
        self.sql(self.name, f"""
            INSERT INTO aso.practices(id,name,key) VALUES
                ('{self.home}','Synthetic Home Practice','synthetic-home'),
                ('{self.foreign}','Synthetic Foreign Practice','synthetic-foreign');
        """)
        for label, context in self.contexts.items():
            role = "admin" if label == "admin" else "surgeon"
            self.sql(self.name, f"""
                INSERT INTO aso.users(id,kratos_identity_id,practice_id,email,full_name)
                VALUES ('{context['actor_id']}','{context['identity_id']}',
                    '{context['practice_id']}','synthetic-{label.lower()}@example.invalid',
                    'Synthetic {label}');
                INSERT INTO aso.user_roles(user_id,role_id,practice_id)
                SELECT '{context['actor_id']}',id,'{context['practice_id']}'
                  FROM aso.roles WHERE key='{role}';
            """)
        payer = str(uuid.uuid4())
        self.sql(self.name, f"INSERT INTO aso.payers(id,name,key) VALUES ('{payer}','Synthetic Payer','synthetic-payer');")
        for label, case_id in (("A", self.case), ("foreign", self.foreign_case)):
            context = self.contexts[label]
            patient = str(uuid.uuid4())
            self.sql(self.name, f"""
                INSERT INTO aso.patients(id,practice_id,family_name,given_name,birth_date)
                VALUES ('{patient}','{context['practice_id']}','Synthetic','Fixture','2000-01-01');
                INSERT INTO aso.cases(id,practice_id,patient_id,surgeon_id,payer_id,case_number)
                VALUES ('{case_id}','{context['practice_id']}','{patient}',
                    '{context['actor_id']}','{payer}','synthetic-{label.lower()}');
            """)
        self.original_cases = self.case_snapshot()
        label = "fresh_fixture_seeded_after_migration" if self.install_mode == "fresh" else "populated_upgrade_fixture_created"
        self.check(label, len(json.loads(self.original_cases)) == 2)

    def case_snapshot(self, case_ids=None):
        selected = case_ids if case_ids is not None else (self.case, self.foreign_case)
        return self.sql(self.name, "SELECT jsonb_agg(to_jsonb(c) - ARRAY['revision','case_input_revision','status_revision','resolution_revision','procedure_code','plan_key'] ORDER BY id)::text FROM aso.cases c WHERE id IN (" +
                        ",".join(literal(case_id) for case_id in selected) + ");").stdout.strip()

    def upgrade_affirmations_snapshot(self):
        return self.sql(self.name, "SELECT jsonb_agg(to_jsonb(a) ORDER BY case_id,kind)::text FROM aso.gate_affirmations a WHERE case_id IN (" +
                        ",".join(literal(case_id) for case_id in self.upgrade_cases.values()) + ");").stdout.strip()

    def seed_upgrade_summaries(self):
        self.mark("legacy_derived_summary_upgrade_fixtures")
        surgeon_a = self.contexts["A"]["actor_id"]
        surgeon_b = self.contexts["B"]["actor_id"]
        # These rows represent data that predates the verified-context command
        # boundary. Bypass only the current authority trigger while constructing
        # that historical state; retain the summary trigger and restore authority
        # enforcement before any migration runs.
        self.sql(
            self.name,
            "ALTER TABLE aso.gate_affirmations "
            "DISABLE TRIGGER gate_affirmations_authority;",
        )
        try:
            for label, case_id in self.upgrade_cases.items():
                self.sql(self.name, f"""
                    INSERT INTO aso.cases(
                      id,practice_id,patient_id,surgeon_id,payer_id,case_number)
                    SELECT '{case_id}',practice_id,patient_id,surgeon_id,payer_id,
                           'synthetic-{label}'
                      FROM aso.cases WHERE id='{self.case}';
                """)
                if label != "stale_empty":
                    # The last affirmation belongs to B and has a distinct fixed
                    # timestamp so the migration can repair the derived summary.
                    self.sql(self.name, f"""
                        SET search_path=aso,public;
                        INSERT INTO aso.gate_affirmations(
                          case_id,kind,affirmed_by,affirmed_at)
                        SELECT '{case_id}',key,
                            CASE WHEN ordinal=4 THEN '{surgeon_b}'::uuid
                                 ELSE '{surgeon_a}'::uuid END,
                            TIMESTAMPTZ '2001-01-01 00:00:00+00'
                              + ordinal * INTERVAL '1 hour'
                          FROM aso.gate_affirmation_kinds ORDER BY ordinal;
                    """)
        finally:
            self.sql(
                self.name,
                "ALTER TABLE aso.gate_affirmations "
                "ENABLE TRIGGER gate_affirmations_authority;",
            )
        empty = self.upgrade_cases["stale_empty"]
        complete = self.upgrade_cases["stale_complete"]
        correct = self.upgrade_cases["correct_complete"]
        self.sql(self.name, f"""
            UPDATE aso.cases SET gate_affirmed_at='1999-01-01 00:00:00+00',
                gate_affirmed_by='{surgeon_a}' WHERE id='{empty}';
            UPDATE aso.cases SET gate_affirmed_at=NULL,gate_affirmed_by=NULL
                WHERE id='{complete}';
        """)
        seeded = self.sql(self.name, f"""
            SELECT
                (SELECT gate_affirmed_at IS NOT NULL AND gate_affirmed_by='{surgeon_a}'
                   FROM aso.cases WHERE id='{empty}')
                AND NOT EXISTS(SELECT FROM aso.gate_affirmations WHERE case_id='{empty}')
                AND (SELECT gate_affirmed_at IS NULL AND gate_affirmed_by IS NULL
                       FROM aso.cases WHERE id='{complete}')
                AND (SELECT count(*)=4 FROM aso.gate_affirmations WHERE case_id='{complete}')
                AND (SELECT gate_affirmed_at=TIMESTAMPTZ '2001-01-01 04:00:00+00'
                       AND gate_affirmed_by='{surgeon_b}' FROM aso.cases WHERE id='{correct}')
                AND (SELECT count(*)=4 FROM aso.gate_affirmations WHERE case_id='{correct}');
        """).stdout.strip()
        self.check("legacy_stale_and_valid_summary_fixtures_created", seeded == "t")
        self.correct_upgrade_case = self.case_snapshot((correct,))
        self.original_upgrade_affirmations = self.upgrade_affirmations_snapshot()

    def verify_upgrade_summaries(self):
        empty = self.upgrade_cases["stale_empty"]
        complete = self.upgrade_cases["stale_complete"]
        cleared = self.sql(self.name, f"""
            SELECT gate_affirmed_at IS NULL AND gate_affirmed_by IS NULL
              FROM aso.cases WHERE id='{empty}';
        """).stdout.strip()
        self.check("upgrade_clears_stale_empty_gate_summary", cleared == "t")
        recomputed = self.sql(self.name, f"""
            SELECT gate_affirmed_at=TIMESTAMPTZ '2001-01-01 04:00:00+00'
              AND gate_affirmed_by='{self.contexts['B']['actor_id']}'
              FROM aso.cases WHERE id='{complete}';
        """).stdout.strip()
        self.check("upgrade_recomputes_stale_complete_gate_summary", recomputed == "t")
        self.check("upgrade_preserves_correct_complete_case_including_updated_at",
                   self.case_snapshot((self.upgrade_cases["correct_complete"],)) == self.correct_upgrade_case)
        self.check("upgrade_preserves_legacy_affirmation_records",
                   self.upgrade_affirmations_snapshot() == self.original_upgrade_affirmations)

    def migration(self, label):
        env = os.environ.copy()
        env["ASO_MIGRATION_DATABASE_URL"] = self.admin_url
        # Migration credentials must never become runtime credentials.
        env.pop("ASO_DATABASE_URL", None)
        return self.with_role_tracking(lambda: self.run_process(label, MIGRATE, env))

    def exercise_migrations(self):
        initial, _ = self.migration("initial_server_migration")
        self.check("initial_server_migration", initial.returncode == 0, return_code=initial.returncode)
        if self.install_mode == "fresh":
            self.assert_empty_clinical_schema("fresh_migration_leaves_clinical_rows_empty", migrated=True)
            self.seed_case_fixture()
        else:
            self.check("original_case_ids_and_contents_survive_upgrade", self.case_snapshot() == self.original_cases)
            self.verify_upgrade_summaries()
            upgraded_cases = self.case_snapshot(self.upgrade_cases.values())
        ledger = self.sql(self.name, "SELECT version::text || ':' || success::text || ':' || encode(checksum,'hex') FROM public._sqlx_migrations ORDER BY version;").stdout.strip()
        rerun, _ = self.migration("unchanged_server_migration_rerun")
        self.check("unchanged_migration_rerun", rerun.returncode == 0, return_code=rerun.returncode)
        rerun_ledger = self.sql(self.name, "SELECT version::text || ':' || success::text || ':' || encode(checksum,'hex') FROM public._sqlx_migrations ORDER BY version;").stdout.strip()
        self.check("migration_ledger_and_populated_cases_unchanged", ledger == rerun_ledger and self.case_snapshot() == self.original_cases)
        if self.install_mode == "upgrade":
            self.check("unchanged_rerun_preserves_repaired_and_valid_upgrade_cases",
                       self.case_snapshot(self.upgrade_cases.values()) == upgraded_cases)
        checksum = self.sql(self.name, f"SELECT encode(checksum,'hex') FROM public._sqlx_migrations WHERE version={MIGRATION_VERSION} AND success;").stdout.strip()
        self.check("durable_gate_migration_recorded", bool(re.fullmatch(r"[0-9a-f]+", checksum)))
        try:
            self.sql(self.name, f"UPDATE public._sqlx_migrations SET checksum=decode('00','hex') WHERE version={MIGRATION_VERSION};")
            refused, entry = self.migration("checksum_mismatch_refusal")
            detected = bool(re.search(r"checksum|modified", refused.stdout + refused.stderr, re.IGNORECASE))
            entry["checksum_mismatch_reported"] = detected
            self.check("checksum_mismatch_refused", refused.returncode != 0 and detected,
                       return_code=refused.returncode, checksum_mismatch_reported=detected)
            self.check("checksum_refusal_preserves_populated_cases", self.case_snapshot() == self.original_cases)
        finally:
            self.sql(self.name, f"UPDATE public._sqlx_migrations SET checksum=decode('{checksum}','hex') WHERE version={MIGRATION_VERSION};")
        restored, _ = self.migration("restored_checksum_migration_rerun")
        self.check("restored_checksum_rerun", restored.returncode == 0, return_code=restored.returncode)
        restored_ledger = self.sql(self.name, "SELECT version::text || ':' || success::text || ':' || encode(checksum,'hex') FROM public._sqlx_migrations ORDER BY version;").stdout.strip()
        self.check("checksum_restoration_preserves_ledger_and_cases", restored_ledger == ledger and self.case_snapshot() == self.original_cases)
        if self.install_mode == "upgrade":
            self.check("checksum_probe_preserves_upgrade_cases_and_affirmations",
                       self.case_snapshot(self.upgrade_cases.values()) == upgraded_cases
                       and self.upgrade_affirmations_snapshot() == self.original_upgrade_affirmations)

    def exercise_transaction(self):
        self.mark("restricted_runtime_login")
        password = secrets.token_urlsafe(36)
        self.sql("postgres", "CREATE ROLE " + identifier(self.login) + " LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD " + literal(password) + ";")
        self.created_login = True
        self.sql("postgres", "GRANT aso_session_reader, aso_gate_executor TO " + identifier(self.login) + ";")
        role_ok = self.sql(self.name, f"""
            SELECT rolcanlogin AND NOT (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication)
              AND pg_has_role(oid,'aso_gate_executor','USAGE')
              AND pg_has_role(oid,'aso_session_reader','USAGE')
              AND NOT pg_has_role(oid,'aso_gate_owner','MEMBER')
              AND NOT EXISTS(SELECT FROM pg_namespace WHERE nspowner=r.oid)
              AND NOT EXISTS(SELECT FROM pg_class WHERE relowner=r.oid)
              AND NOT EXISTS(SELECT FROM pg_database WHERE datdba=r.oid)
              FROM pg_roles r WHERE rolname='{self.login}';
        """).stdout.strip()
        self.check("runtime_login_nonowner_nonbypass_executor_member", role_ok == "t", psql_output=role_ok if role_ok in ("t", "f") else "unexpected")
        parsed = urllib.parse.urlsplit(self.admin_url)
        runtime_url = "postgresql://" + self.login + ":" + urllib.parse.quote(password, safe="") + "@" + parsed.netloc.rsplit("@", 1)[1] + parsed.path
        env = os.environ.copy()
        env.pop("ASO_MIGRATION_DATABASE_URL", None)
        env.pop("ASO_DATABASE_URL", None)
        owner_absent = self.sql("postgres", "SELECT NOT EXISTS(SELECT FROM pg_roles WHERE rolname=" + literal(self.owner_role) + ");").stdout.strip() == "t"
        self.check("fixture_owner_role_initially_absent", owner_absent)
        self.owner_role_available = True
        env.update({
            "ASO_TEST_DATABASE_URL": runtime_url,
            "ASO_TEST_ADMIN_DATABASE_URL": self.admin_url,
            "ASO_TEST_OWNER_ROLE": self.owner_role,
            "ASO_TEST_GATE_CONTEXTS": json.dumps(self.contexts),
            "ASO_TEST_GATE_CASE_ID": self.case,
            "ASO_TEST_FOREIGN_CASE_ID": self.foreign_case,
        })
        completed, entry = self.run_process("actual_gate_transaction_lifecycle", TEST, env)
        output = entry["actual_result_output"]
        if completed.returncode != 0:
            entry["failure_output"] = (completed.stdout + "\n" + completed.stderr).splitlines()[-80:]
        ran_test = any("gate_transaction_lifecycle ... ok" in line for line in output)
        assertions = [line for line in output if line.startswith("gate_transaction_check: ")]
        self.check("actual_appservices_pg_repository_lifecycle", completed.returncode == 0 and ran_test and bool(assertions),
                   return_code=completed.returncode, assertion_count=len(assertions))

    def cleanup(self):
        self.mark("cleanup_owned_resources")
        cleanup = self.report["cleanup"]
        for created, label, statement in (
            (self.created_database, "disposable_database_deleted", "DROP DATABASE " + identifier(self.name) + ";"),
            (self.created_login, "disposable_login_deleted", "DROP ROLE " + identifier(self.login) + ";"),
        ):
            if created:
                try:
                    result = self.sql("postgres", statement, False)
                    cleanup[label] = {"result": "Passed" if result.returncode == 0 else "Failed", "return_code": result.returncode}
                except Exception as error:
                    cleanup[label] = {"result": "Failed", "failure_type": type(error).__name__}
        if self.owner_role_available:
            # A test interruption can leave its temporary owner role behind.
            # Only the exact reserved name is eligible, after DB/LOGIN cleanup.
            try:
                exists = self.sql("postgres", "SELECT EXISTS(SELECT FROM pg_roles WHERE rolname=" + literal(self.owner_role) + ");").stdout.strip() == "t"
                if not exists:
                    cleanup["disposable_owner_role"] = {"result": "Passed", "action": "already_absent"}
                else:
                    safe = self.sql("postgres", f"""
                        SELECT NOT (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)
                          AND NOT EXISTS(SELECT FROM pg_auth_members WHERE roleid=r.oid OR member=r.oid)
                          AND NOT EXISTS(SELECT FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid=r.oid)
                        FROM pg_roles r WHERE rolname={literal(self.owner_role)};
                    """).stdout.strip() == "t"
                    code = self.sql("postgres", "DROP ROLE " + identifier(self.owner_role) + ";", False).returncode if safe else None
                    cleanup["disposable_owner_role"] = {"result": "Passed" if code == 0 else "Failed", "action": "fixture_owner_role_deletion", "return_code": code}
            except Exception as error:
                cleanup["disposable_owner_role"] = {"result": "Failed", "failure_type": type(error).__name__}
        for role in ROLES:
            if role in self.preexisting_roles:
                cleanup[role] = {"result": "Passed", "action": "preexisting_role_preserved"}
            elif role in self.created_roles:
                try:
                    safe = self.sql("postgres", f"""
                        SELECT shobj_description(r.oid,'pg_authid')={literal(self.name)}
                          AND NOT (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)
                          AND NOT EXISTS(SELECT FROM pg_auth_members WHERE roleid=r.oid OR member=r.oid)
                          AND NOT EXISTS(SELECT FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid=r.oid)
                        FROM pg_roles r WHERE rolname={literal(role)};
                    """).stdout.strip() == "t"
                    code = self.sql("postgres", "DROP ROLE " + identifier(role) + ";", False).returncode if safe else None
                    cleanup[role] = {"result": "Passed" if code == 0 else "Failed", "action": "fixture_created_role_deletion", "return_code": code}
                except Exception as error:
                    cleanup[role] = {"result": "Failed", "failure_type": type(error).__name__}
        if any(value["result"] == "Failed" for value in cleanup.values()):
            self.report["result"] = "Failed"

    def run(self):
        try:
            self.mark("capture_source_hashes")
            self.report["source_sha256"] = {
                filename: hashlib.sha256((ROOT / filename).read_bytes()).hexdigest()
                for filename in SOURCE_FILES
            }
            self.create_database()
            self.exercise_migrations()
            self.exercise_transaction()
            self.report["result"] = "Passed"
        except (Exception, KeyboardInterrupt) as error:
            self.report["failure"] = {"stage": self.stage, "type": type(error).__name__}
        finally:
            self.cleanup()
            self.report["completed_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
            self.output.parent.mkdir(parents=True, exist_ok=True)
            self.output.write_text(json.dumps(self.report, indent=2) + "\n")
            print(json.dumps(self.report, indent=2))
        return 0 if self.report["result"] == "Passed" else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--postgres-user", default="flint")
    parser.add_argument("--postgres-port", type=int)
    parser.add_argument("--command-seconds", type=int, default=600)
    parser.add_argument("--install-mode", choices=("fresh", "upgrade"), default="upgrade")
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    # This persistent lock file holds no fixture data or secrets. Unlinking it
    # after unlock creates an inode race that permits overlapping fixtures.
    with open(Path(tempfile.gettempdir()) / "aso-gate-transaction-fixture.lock", "a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("Gate transaction probe: another fixture is running", file=sys.stderr)
            return 1
        return Probe(args).run()


if __name__ == "__main__":
    sys.exit(main())
