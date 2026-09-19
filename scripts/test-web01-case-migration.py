#!/usr/bin/env python3
"""Focused local PostgreSQL proof for web-01 durable case commands."""

import argparse
import datetime
import importlib.util
import json
import os
from pathlib import Path
import secrets
import sys
import urllib.parse
import uuid


ROOT = Path(__file__).resolve().parents[1]
BASE_PROBE = ROOT / "scripts/test-gate-transaction.py"
EVIDENCE = (
    ROOT
    / ".kbd-orchestrator/phases/runtime-architecture/children/"
    "web-case-to-letter/evidence/web-01-case-command-core"
)


def load_base_probe():
    spec = importlib.util.spec_from_file_location("web01_gate_probe", BASE_PROBE)
    if spec is None or spec.loader is None:
        raise RuntimeError("gate_probe_unavailable")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


base = load_base_probe()
base.SOURCE_FILES = base.SOURCE_FILES + (
    "migrations/server/2026090617_durable_case_commands.sql",
    "crates/aso-host/src/case_management.rs",
    "crates/aso-host/src/ports/mod.rs",
    "crates/aso-web-server/src/adapters/gate.rs",
    "crates/aso-web-server/src/adapters/gate/case_transaction_tests.rs",
    "crates/aso-web-server/src/migrations.rs",
    "scripts/test-web01-case-migration.py",
)

CASE_TEST = [
    "cargo",
    "test",
    "-p",
    "aso-web-server",
    "adapters::gate::case_transaction_tests::case_command_service_lifecycle",
    "--",
    "--ignored",
    "--exact",
    "--nocapture",
]

WRITE_TARGET_TEST = [
    "cargo",
    "test",
    "-p",
    "aso-web-server",
    (
        "adapters::gate::case_transaction_tests::"
        "case_write_target_authorization_without_read_capability"
    ),
    "--",
    "--ignored",
    "--exact",
    "--nocapture",
]

SAFE_RECEIPT_KEYS = {"commandId", "action", "caseId", "committedAt"}


def is_safe_receipt(value, case_id):
    return (
        isinstance(value, dict)
        and set(value) == SAFE_RECEIPT_KEYS
        and value["caseId"] == case_id
    )


class CaseMigrationProbe(base.Probe):
    def __init__(self, args):
        super().__init__(args)
        self.output = Path(args.output)
        self.include_service = args.include_service
        self.report.update({
            "observed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "scope": (
                "Additive web-01 migration, least-privilege case functions, "
                "idempotency, revisions, tenant refusal, and direct-write refusal "
                "against disposable PostgreSQL"
            ),
            "commands": [
                "python3 scripts/test-web01-case-migration.py "
                f"--install-mode {self.install_mode}",
                "cargo run -p aso-web-server -- --migrate-server",
            ],
            "unverified": [
                (
                    "Mounted HTTP routes, React UI, browser flow, Tauri, and mobile "
                    "are outside web-01 task 1.3."
                    if self.include_service
                    else "Rust AppServices, mounted HTTP routes, React UI, browser flow, "
                    "Tauri, and mobile are outside web-01 task 1.2."
                )
            ],
        })
        self.new_case = str(uuid.uuid4())
        self.new_patient = str(uuid.uuid4())
        self.create_command = str(uuid.uuid4())
        self.update_command = str(uuid.uuid4())
        self.transition_command = str(uuid.uuid4())
        self.service_case = str(uuid.uuid4())
        self.service_patient = str(uuid.uuid4())

    def session_sql(self, body, context="A", require_success=True):
        actor = self.contexts[context]
        statement = f"""
        BEGIN;
        SET LOCAL ROLE aso_case_executor;
        SELECT set_config('aso.kratos_identity_id','{actor['identity_id']}',true),
               set_config('aso.actor_id','{actor['actor_id']}',true),
               set_config('aso.practice_id','{actor['practice_id']}',true),
               set_config('aso.principal','user',true),
               set_config('aso.session_expires_at',
                 (clock_timestamp() + interval '10 minutes')::text,true);
        {body}
        COMMIT;
        """
        return self.sql(self.name, statement, require_success)

    def expect_sqlstate(self, label, body, state, context="A"):
        wrapped = f"""
        DO $expected$
        BEGIN
          {body}
          RAISE EXCEPTION 'expected refusal was not observed' USING ERRCODE='P0001';
        EXCEPTION WHEN SQLSTATE '{state}' THEN
          NULL;
        END;
        $expected$;
        """
        result = self.session_sql(wrapped, context=context, require_success=False)
        self.check(label, result.returncode == 0, expected_sqlstate=state)

    def seed_command_fixture(self):
        self.mark("seed_web01_case_command_fixture")
        payer = self.sql(
            self.name, "SELECT id FROM aso.payers ORDER BY created_at LIMIT 1;"
        ).stdout.strip()
        self.payer = payer
        home = self.home
        surgeon = self.contexts["A"]["actor_id"]
        self.sql(
            self.name,
            f"""
            INSERT INTO aso.patients(
              id,practice_id,family_name,given_name,birth_date)
            VALUES ('{self.new_patient}','{home}',
              'Synthetic','Web Case','1970-01-01'),
              ('{self.service_patient}','{home}',
              'Synthetic','Service Case','1970-01-02');
            """,
        )
        self.check("synthetic_case_fixture_seeded", bool(payer and surgeon))

    def create_call(self, command=None, case_number="SYN-WEB01-001"):
        command = command or self.create_command
        return f"""
        SELECT aso.create_case_command(
          '{command}','{self.new_case}','{case_number}',
          '{self.new_patient}','{self.contexts['A']['actor_id']}',NULL,NULL,
          '{self.payer}','SYN-MEMBER-001','2026-04-15',
          'SYN-LUMBAR-001','synthetic-ppo','{{}}'::jsonb)::text;
        """

    def update_expression(self, command, expected_revision, member="SYN-MEMBER-002"):
        return f"""
        aso.update_case_command(
          '{command}','{self.new_case}',{expected_revision},'SYN-WEB01-001',
          '{self.new_patient}','{self.contexts['A']['actor_id']}',NULL,NULL,
          '{self.payer}','{member}','2026-04-15',
          'SYN-LUMBAR-001','synthetic-ppo','{{}}'::jsonb)
        """

    def update_call(self, command, expected_revision, member="SYN-MEMBER-002"):
        return "SELECT " + self.update_expression(
            command, expected_revision, member
        ).strip() + "::text;"

    def exercise_transaction(self):
        self.seed_command_fixture()
        created_text = self.session_sql(self.create_call()).stdout.splitlines()[-1]
        created = json.loads(created_text)
        created_state = json.loads(
            self.sql(
                self.name,
                f"SELECT jsonb_build_object("
                f"'status',status,'revision',revision,"
                f"'caseInputRevision',case_input_revision,"
                f"'statusRevision',status_revision)::text "
                f"FROM aso.cases WHERE id='{self.new_case}';",
            ).stdout.strip()
        )
        self.check(
            "create_commits_one_intake_case_with_revisions",
            is_safe_receipt(created, self.new_case)
            and created_state == {
                "status": "intake",
                "revision": 1,
                "caseInputRevision": 1,
                "statusRevision": 0,
            },
        )

        retried_text = self.session_sql(self.create_call()).stdout.splitlines()[-1]
        self.check(
            "lost_create_response_reconciles_exact_result",
            retried_text == created_text
            and self.sql(
                self.name,
                f"SELECT count(*) FROM aso.cases WHERE id='{self.new_case}';",
            ).stdout.strip() == "1",
        )
        self.expect_sqlstate(
            "same_command_different_payload_is_explicit_conflict",
            "PERFORM aso.create_case_command(" +
            f"'{self.create_command}','{self.new_case}','SYN-CONFLICT'," +
            f"'{self.new_patient}','{self.contexts['A']['actor_id']}',NULL,NULL," +
            f"'{self.payer}','SYN-MEMBER-001','2026-04-15'," +
            "'SYN-LUMBAR-001','synthetic-ppo','{}'::jsonb);",
            "23505",
        )

        updated_text = self.session_sql(
            self.update_call(self.update_command, 1)
        ).stdout.splitlines()[-1]
        updated = json.loads(updated_text)
        updated_state = json.loads(
            self.sql(
                self.name,
                f"SELECT jsonb_build_object("
                f"'memberId',member_id,'revision',revision,"
                f"'caseInputRevision',case_input_revision,"
                f"'statusRevision',status_revision)::text "
                f"FROM aso.cases WHERE id='{self.new_case}';",
            ).stdout.strip()
        )
        self.check(
            "update_advances_case_and_input_revisions",
            is_safe_receipt(updated, self.new_case)
            and updated_state == {
                "memberId": "SYN-MEMBER-002",
                "revision": 2,
                "caseInputRevision": 2,
                "statusRevision": 0,
            },
        )
        self.expect_sqlstate(
            "stale_case_revision_is_refused",
            "PERFORM " + self.update_expression(str(uuid.uuid4()), 1).strip() + ";",
            "40001",
        )

        transitioned_text = self.session_sql(
            f"SELECT aso.transition_case_command('{self.transition_command}',"
            f"'{self.new_case}',0,'evidence')::text;"
        ).stdout.splitlines()[-1]
        transitioned = json.loads(transitioned_text)
        transitioned_state = json.loads(
            self.sql(
                self.name,
                f"SELECT jsonb_build_object("
                f"'status',status,'revision',revision,"
                f"'caseInputRevision',case_input_revision,"
                f"'statusRevision',status_revision)::text "
                f"FROM aso.cases WHERE id='{self.new_case}';",
            ).stdout.strip()
        )
        self.check(
            "valid_transition_advances_status_and_row_revisions",
            is_safe_receipt(transitioned, self.new_case)
            and transitioned_state == {
                "status": "evidence",
                "revision": 3,
                "caseInputRevision": 2,
                "statusRevision": 1,
            },
        )
        self.expect_sqlstate(
            "invalid_transition_is_refused",
            f"PERFORM aso.transition_case_command('{uuid.uuid4()}',"
            f"'{self.new_case}',1,'awaiting_gate');",
            "23514",
        )

        foreign_case = self.foreign_case
        self.expect_sqlstate(
            "foreign_practice_case_is_refused",
            f"PERFORM aso.read_case('{foreign_case}');",
            "42501",
        )
        self.expect_sqlstate(
            "executor_direct_case_insert_is_refused",
            "INSERT INTO aso.cases(id,practice_id,patient_id,surgeon_id,payer_id,"
            "case_number) VALUES (gen_random_uuid(),gen_random_uuid(),"
            "gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'denied');",
            "42501",
        )
        self.expect_sqlstate(
            "executor_direct_case_update_is_refused",
            f"UPDATE aso.cases SET member_id='forged' WHERE id='{self.new_case}';",
            "42501",
        )
        self.expect_sqlstate(
            "executor_cannot_read_local_command_ledger",
            "PERFORM count(*) FROM aso.case_commands;",
            "42501",
        )

        lookups = self.session_sql(
            f"SELECT jsonb_build_array("
            f"aso.lookup_create_case_command('{self.create_command}'),"
            f"aso.lookup_case_command('{self.new_case}','{self.update_command}'),"
            f"aso.lookup_case_command('{self.new_case}','{self.transition_command}')"
            ")::text;"
        ).stdout.splitlines()[-1]
        self.check(
            "known_anchor_lookups_reconcile_all_committed_results",
            all(
                is_safe_receipt(item, self.new_case)
                for item in json.loads(lookups)
            ),
        )
        counts = self.sql(
            self.name,
            f"""
            SELECT jsonb_build_object(
              'commands',(SELECT count(*) FROM aso.case_commands
                WHERE case_id='{self.new_case}'),
              'audits',(SELECT count(*) FROM aso.audit_events
                WHERE case_id='{self.new_case}'
                  AND action IN ('case.create','case.update','case.transition')),
              'ownerMembers',(SELECT count(*) FROM pg_auth_members membership
                JOIN pg_roles role ON role.oid=membership.roleid
                WHERE role.rolname='aso_case_owner'),
              'executorCaseWrite',has_table_privilege(
                'aso_case_executor','aso.cases','INSERT,UPDATE,DELETE'),
              'executorLedgerRead',has_table_privilege(
                'aso_case_executor','aso.case_commands','SELECT'))::text;
            """,
        ).stdout.strip()
        observed = json.loads(counts)
        self.check(
            "least_privilege_and_atomic_audit_contract",
            observed == {
                "commands": 3,
                "audits": 3,
                "ownerMembers": 0,
                "executorCaseWrite": False,
                "executorLedgerRead": False,
            },
            observed=observed,
        )
        migrated = self.sql(
            self.name,
            "SELECT count(*)=1 FROM public._sqlx_migrations "
            "WHERE version=2026090617 AND success;",
        ).stdout.strip()
        defaults = self.sql(
            self.name,
            f"SELECT revision=1 AND case_input_revision=1 AND status_revision=0 "
            f"FROM aso.cases WHERE id='{self.case}';",
        ).stdout.strip()
        self.check(
            "migration_recorded_and_existing_case_defaults_preserved",
            migrated == "t" and defaults == "t",
        )
        if self.include_service:
            self.exercise_case_service()

    def exercise_case_service(self):
        self.mark("restricted_case_service_runtime")
        password = secrets.token_urlsafe(36)
        self.sql(
            "postgres",
            "CREATE ROLE " + base.identifier(self.login)
            + " LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION "
            + "NOBYPASSRLS PASSWORD " + base.literal(password) + ";",
        )
        self.created_login = True
        self.sql(
            "postgres",
            "GRANT aso_gate_executor, aso_case_executor TO "
            + base.identifier(self.login) + ";",
        )
        role_ok = self.sql(
            self.name,
            f"""
            SELECT rolcanlogin
              AND NOT (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole
                       OR rolreplication)
              AND pg_has_role(oid,'aso_gate_executor','USAGE')
              AND pg_has_role(oid,'aso_case_executor','USAGE')
              AND NOT pg_has_role(oid,'aso_gate_owner','MEMBER')
              AND NOT pg_has_role(oid,'aso_case_owner','MEMBER')
              FROM pg_roles WHERE rolname='{self.login}';
            """,
        ).stdout.strip()
        self.check(
            "case_service_login_is_restricted_executor",
            role_ok == "t",
            psql_output=role_ok if role_ok in ("t", "f") else "unexpected",
        )
        parsed = urllib.parse.urlsplit(self.admin_url)
        runtime_url = (
            "postgresql://" + self.login + ":"
            + urllib.parse.quote(password, safe="") + "@"
            + parsed.netloc.rsplit("@", 1)[1] + parsed.path
        )
        environment = os.environ.copy()
        environment.update({
            "ASO_TEST_CASE_DATABASE_URL": runtime_url,
            "ASO_TEST_CASE_CONTEXT": json.dumps(self.contexts["A"]),
            "ASO_TEST_CASE_ID": self.service_case,
            "ASO_TEST_CASE_PATIENT_ID": self.service_patient,
            "ASO_TEST_CASE_PAYER_ID": self.payer,
            "ASO_TEST_FOREIGN_CASE_ID": self.foreign_case,
            "ASO_TEST_WRITE_ONLY_CASE_ID": self.new_case,
            "ASO_TEST_WRITE_ONLY_COMMAND_ID": self.transition_command,
        })
        completed, entry = self.run_process(
            "actual_case_command_service_lifecycle", CASE_TEST, environment
        )
        output = entry["actual_result_output"]
        if completed.returncode != 0:
            entry["failure_output"] = (
                completed.stdout + "\n" + completed.stderr
            ).splitlines()[-80:]
        ran_test = any(
            "case_command_service_lifecycle ... ok" in line for line in output
        )
        assertions = [
            line for line in output if line.startswith("case_transaction_check: ")
        ]
        self.check(
            "actual_appservices_case_repository_lifecycle",
            completed.returncode == 0 and ran_test and len(assertions) == 5,
            return_code=completed.returncode,
            assertion_count=len(assertions),
        )

        self.sql(
            self.name,
            """
            DELETE FROM aso.role_capabilities grant_record
            USING aso.roles role
            WHERE grant_record.role_id = role.id
              AND role.key = 'surgeon'
              AND grant_record.capability_key = 'case:read';
            """,
        )
        capability_counts = self.sql(
            self.name,
            f"""
            SELECT jsonb_build_object(
              'read', count(*) FILTER (WHERE capability_key = 'case:read'),
              'write', count(*) FILTER (WHERE capability_key = 'case_write'))::text
            FROM aso.user_capabilities
            WHERE user_id = '{self.contexts["A"]["actor_id"]}';
            """,
        ).stdout.strip()
        self.check(
            "fixture_principal_has_write_without_read",
            json.loads(capability_counts) == {"read": 0, "write": 1},
            capability_counts=capability_counts,
        )

        write_completed, write_entry = self.run_process(
            "actual_write_only_target_authorization", WRITE_TARGET_TEST, environment
        )
        write_output = write_entry["actual_result_output"]
        if write_completed.returncode != 0:
            write_entry["failure_output"] = (
                write_completed.stdout + "\n" + write_completed.stderr
            ).splitlines()[-80:]
        write_test_ran = any(
            "case_write_target_authorization_without_read_capability ... ok" in line
            for line in write_output
        )
        write_assertions = [
            line
            for line in write_output
            if line.startswith("case_transaction_check: ")
        ]
        self.check(
            "actual_write_only_gateway_target_authorization",
            write_completed.returncode == 0
            and write_test_ran
            and write_assertions
            == ["case_transaction_check: write_only_target_and_safe_receipt"],
            return_code=write_completed.returncode,
            assertion_count=len(assertions) + len(write_assertions),
        )


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--postgres-user", default="flint")
    parser.add_argument("--postgres-port", type=int)
    parser.add_argument("--command-seconds", type=int, default=600)
    parser.add_argument("--install-mode", choices=("fresh", "upgrade"), required=True)
    parser.add_argument("--include-service", action="store_true")
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def main():
    args = parse_args()
    with open(Path("/tmp/aso-web01-case-migration.lock"), "a") as lock:
        import fcntl

        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("web-01 case migration probe: another fixture is running", file=sys.stderr)
            return 1
        return CaseMigrationProbe(args).run()


if __name__ == "__main__":
    sys.exit(main())
