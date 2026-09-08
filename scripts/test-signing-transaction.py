#!/usr/bin/env python3
"""Tier 1 disposable PostgreSQL fixture for verified letter signing.

This runner reuses the durable-gate fixture lifecycle while selecting the
signing migration and ignored Rust transaction test. Only synthetic records
are created. Credentials and raw subprocess output remain in memory.
"""

import argparse
import fcntl
import importlib.util
from pathlib import Path
import sys
import tempfile
import uuid


ROOT = Path(__file__).resolve().parents[1]
HELPER = ROOT / "scripts/test-gate-transaction.py"
SPEC = importlib.util.spec_from_file_location("aso_gate_transaction_fixture", HELPER)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("gate_transaction_fixture_unavailable")
gate_fixture = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(gate_fixture)

OUTPUT = ROOT / ".kbd-orchestrator/phases/runtime-architecture/evidence/ra-03-clinical-command-parity/signing-transaction.json"
gate_fixture.MIGRATION_VERSION = 2026090608
gate_fixture.TEST = [
    "cargo", "test", "-p", "aso-web-server",
    "signing_gate_transaction_lifecycle", "--", "--ignored", "--nocapture",
]
gate_fixture.SOURCE_FILES = (
    "migrations/server/2026090600_local_publication_boundary.sql",
    "migrations/server/2026090602_durable_signing.sql",
    "crates/aso-host/src/signing.rs",
    "crates/aso-host/src/ports/mod.rs",
    "crates/aso-server-axum/src/routes/letters.rs",
    "crates/aso-web-server/src/adapters/gate.rs",
    "crates/aso-web-server/src/adapters/gate/signing_transaction_tests.rs",
    "crates/aso-web-server/src/migrations.rs",
    "desktop/src-tauri/src/lib.rs",
    "docker/flint-gate/config.yaml",
    "migrations/server/2026090604_immutable_approved_sources.sql",
    "migrations/server/2026090605_clinical_revision_guards.sql",
    "migrations/server/2026090606_clinical_truncate_guards.sql",
    "migrations/server/2026090607_publication_ddl_serialization.sql",
    "migrations/server/2026090608_approval_qa_serialization.sql",
    "scripts/test-signing-transaction.py",
)


class SigningProbe(gate_fixture.Probe):
    def __init__(self, args):
        super().__init__(args)
        self.report["scope"] = (
            "Actual AppServices and PgGateRepository verified signing command "
            "against a disposable PostgreSQL database"
        )
        self.report["commands"][0] = (
            "RUSTUP_TOOLCHAIN=1.97.1 python3 scripts/test-signing-transaction.py "
            "--install-mode " + self.install_mode
        )
        self.report["commands"][-1] = " ".join(gate_fixture.TEST)
        self.report["unverified"] = [
            "Mounted HTTP/gateway, UI and physical devices are outside this transaction fixture."
        ]

    def assert_empty_clinical_schema(self, label, migrated=False):
        tables = gate_fixture.CLINICAL_FIXTURE_TABLES
        if migrated:
            tables += ("gate_commands", "letter_sign_commands")
        fields = ",".join(
            gate_fixture.literal(table)
            + ", (SELECT count(*) FROM aso."
            + gate_fixture.identifier(table)
            + ")"
            for table in tables
        )
        counts = gate_fixture.json.loads(
            self.sql(
                self.name,
                "SELECT jsonb_build_object(" + fields + ")::text;",
            ).stdout.strip()
        )
        self.check(
            label,
            all(count == 0 for count in counts.values()),
            row_counts=counts,
        )

    def exercise_migrations(self):
        publication = "ra03_local_only_" + uuid.uuid4().hex
        self.sql(
            self.name,
            "CREATE PUBLICATION " + gate_fixture.identifier(publication) + " FOR ALL TABLES;",
        )
        refused, entry = self.migration("unsafe_publication_preflight_refusal")
        output = refused.stdout + refused.stderr
        reported = "explicit-table publications" in output
        entry["publication_preflight_reported"] = reported
        untouched = self.sql(
            self.name,
            """SELECT to_regclass('aso.letter_sign_commands') IS NULL
             AND to_regclass('public._sqlx_migrations') IS NULL;""",
        ).stdout.strip()
        self.check(
            "unsafe_publication_refused_before_first_server_migration",
            refused.returncode != 0 and reported and untouched == "t",
            return_code=refused.returncode,
            publication_preflight_reported=reported,
            schema_untouched=untouched == "t",
        )
        self.sql(
            self.name,
            "DROP PUBLICATION " + gate_fixture.identifier(publication) + ";",
        )
        self.sql(
            self.name,
            "CREATE PUBLICATION "
            + gate_fixture.identifier(publication)
            + " FOR TABLE aso.practices;",
        )
        super().exercise_migrations()
        if self.install_mode == "fresh":
            boundary_order = self.sql(
                self.name,
                """SELECT
                     (SELECT installed_on FROM public._sqlx_migrations WHERE version=2026090607)
                     <= ALL (
                       SELECT installed_on FROM public._sqlx_migrations
                       WHERE version IN (2026090601,2026090602,2026090603)
                     )
                     AND EXISTS (
                       SELECT FROM pg_catalog.pg_event_trigger
                       WHERE evtname='aso_local_command_publication_serialization'
                         AND evtevent='ddl_command_start' AND evtenabled <> 'D'
                     );""",
            ).stdout.strip()
            self.check(
                "publication_serialization_installed_before_local_ledgers",
                boundary_order == "t",
                psql_output=boundary_order if boundary_order in ("t", "f") else "unexpected",
            )
        else:
            self.sql(
                self.name,
                """DROP EVENT TRIGGER aso_local_command_publication_serialization;
                   DROP FUNCTION aso.serialize_local_publication_ddl();
                   DELETE FROM public._sqlx_migrations
                   WHERE version IN (2026090607,2026090608);""",
            )
            repaired, _ = self.migration("applied_0600_through_0606_additive_repair")
            repair_state = self.sql(
                self.name,
                """SELECT
                     (SELECT count(*) FROM public._sqlx_migrations
                      WHERE version IN (2026090607,2026090608) AND success) = 2
                     AND EXISTS (
                       SELECT FROM pg_catalog.pg_event_trigger
                       WHERE evtname='aso_local_command_publication_serialization'
                         AND evtevent='ddl_command_start' AND evtenabled <> 'D'
                     );""",
            ).stdout.strip()
            self.check(
                "applied_0600_through_0606_receives_additive_repairs",
                repaired.returncode == 0
                and repair_state == "t"
                and self.case_snapshot() == self.original_cases,
                return_code=repaired.returncode,
                psql_output=repair_state if repair_state in ("t", "f") else "unexpected",
            )
        local_tables_excluded = self.sql(
            self.name,
            """SELECT NOT EXISTS (
               SELECT FROM pg_catalog.pg_publication_tables
               WHERE pubname=$$"""
            + publication
            + """$$ AND schemaname='aso'
                 AND tablename IN ('gate_commands','letter_sign_commands','evidence_reassessment_commands')
             );""",
        ).stdout.strip()
        self.check(
            "explicit_table_publication_excludes_local_command_ledgers",
            local_tables_excluded == "t",
            psql_output=local_tables_excluded if local_tables_excluded in ("t", "f") else "unexpected",
        )
        blocked_add = self.sql(
            self.name,
            "ALTER PUBLICATION "
            + gate_fixture.identifier(publication)
            + " ADD TABLE aso.letter_sign_commands;",
            False,
        )
        still_excluded = self.sql(
            self.name,
            "SELECT NOT EXISTS (SELECT FROM pg_catalog.pg_publication_tables "
            "WHERE pubname=" + gate_fixture.literal(publication)
            + " AND schemaname='aso' AND tablename='letter_sign_commands');",
        ).stdout.strip()
        self.check(
            "publication_ddl_guard_refuses_local_command_ledger",
            blocked_add.returncode != 0 and still_excluded == "t",
            return_code=blocked_add.returncode,
            local_ledger_excluded=still_excluded == "t",
        )
        self.sql(
            self.name,
            "ALTER TABLE aso.letter_sign_commands "
            "RENAME TO letter_sign_commands_renamed_probe;",
        )
        blocked_renamed = self.sql(
            self.name,
            "ALTER PUBLICATION "
            + gate_fixture.identifier(publication)
            + " ADD TABLE aso.letter_sign_commands_renamed_probe;",
            False,
        )
        renamed_excluded = self.sql(
            self.name,
            "SELECT NOT EXISTS (SELECT FROM pg_catalog.pg_publication_tables "
            "WHERE pubname=" + gate_fixture.literal(publication)
            + " AND tablename='letter_sign_commands_renamed_probe');",
        ).stdout.strip()
        self.sql(
            self.name,
            "ALTER TABLE aso.letter_sign_commands_renamed_probe "
            "RENAME TO letter_sign_commands;",
        )
        self.check(
            "renamed_local_ledger_remains_excluded_by_relation_identity",
            blocked_renamed.returncode != 0 and renamed_excluded == "t",
            return_code=blocked_renamed.returncode,
            renamed_ledger_excluded=renamed_excluded == "t",
        )

        published_schema = "ra03_published_" + uuid.uuid4().hex
        schema_publication = "ra03_schema_" + uuid.uuid4().hex
        self.sql(
            self.name,
            "CREATE SCHEMA " + gate_fixture.identifier(published_schema) + ";",
        )
        self.sql(
            self.name,
            "CREATE PUBLICATION " + gate_fixture.identifier(schema_publication)
            + " FOR TABLES IN SCHEMA " + gate_fixture.identifier(published_schema) + ";",
        )
        blocked_move = self.sql(
            self.name,
            "ALTER TABLE aso.letter_sign_commands SET SCHEMA "
            + gate_fixture.identifier(published_schema) + ";",
            False,
        )
        stayed_excluded = self.sql(
            self.name,
            "SELECT to_regclass('aso.letter_sign_commands') IS NOT NULL;",
        ).stdout.strip()
        self.check(
            "local_ledger_cannot_move_into_published_schema",
            blocked_move.returncode != 0 and stayed_excluded == "t",
            return_code=blocked_move.returncode,
            remained_in_aso=stayed_excluded == "t",
        )
        self.sql(
            self.name,
            "DROP PUBLICATION " + gate_fixture.identifier(schema_publication) + ";",
        )
        self.sql(
            self.name,
            "ALTER TABLE aso.letter_sign_commands SET SCHEMA "
            + gate_fixture.identifier(published_schema) + ";",
        )
        blocked_schema_publication = self.sql(
            self.name,
            "CREATE PUBLICATION " + gate_fixture.identifier(schema_publication)
            + " FOR TABLES IN SCHEMA " + gate_fixture.identifier(published_schema) + ";",
            False,
        )
        schema_publication_absent = self.sql(
            self.name,
            "SELECT NOT EXISTS (SELECT FROM pg_catalog.pg_publication WHERE pubname="
            + gate_fixture.literal(schema_publication) + ");",
        ).stdout.strip()
        self.sql(
            self.name,
            "ALTER TABLE " + gate_fixture.identifier(published_schema)
            + ".letter_sign_commands SET SCHEMA aso;",
        )
        self.check(
            "moved_local_ledger_blocks_schema_publication",
            blocked_schema_publication.returncode != 0 and schema_publication_absent == "t",
            return_code=blocked_schema_publication.returncode,
            publication_absent=schema_publication_absent == "t",
        )

        # Prove the migration entry preflight catches a legacy explicit-table
        # exposure even when the new event trigger is absent on that legacy DB.
        self.sql(self.name, "DROP EVENT TRIGGER aso_local_command_publication_guard;")
        self.sql(
            self.name,
            "ALTER PUBLICATION "
            + gate_fixture.identifier(publication)
            + " ADD TABLE aso.letter_sign_commands;",
        )
        refused_explicit, explicit_entry = self.migration(
            "explicit_local_ledger_publication_preflight_refusal"
        )
        explicit_output = refused_explicit.stdout + refused_explicit.stderr
        explicit_reported = "exclude local command ledgers" in explicit_output
        explicit_entry["explicit_local_ledger_reported"] = explicit_reported
        self.check(
            "explicit_local_ledger_publication_is_refused_on_upgrade",
            refused_explicit.returncode != 0 and explicit_reported,
            return_code=refused_explicit.returncode,
            publication_preflight_reported=explicit_reported,
        )
        self.sql(
            self.name,
            "ALTER PUBLICATION "
            + gate_fixture.identifier(publication)
            + " DROP TABLE aso.letter_sign_commands;",
        )
        self.sql(
            self.name,
            "ALTER TABLE aso.letter_sign_commands SET SCHEMA "
            + gate_fixture.identifier(published_schema) + ";",
        )
        self.sql(
            self.name,
            "CREATE PUBLICATION " + gate_fixture.identifier(schema_publication)
            + " FOR TABLES IN SCHEMA " + gate_fixture.identifier(published_schema) + ";",
        )
        refused_schema, schema_entry = self.migration(
            "schema_local_ledger_publication_preflight_refusal"
        )
        schema_output = refused_schema.stdout + refused_schema.stderr
        schema_reported = "exclude local command ledgers" in schema_output
        schema_entry["schema_local_ledger_reported"] = schema_reported
        self.check(
            "schema_local_ledger_publication_is_refused_on_upgrade",
            refused_schema.returncode != 0 and schema_reported,
            return_code=refused_schema.returncode,
            publication_preflight_reported=schema_reported,
        )
        self.sql(
            self.name,
            "DROP PUBLICATION " + gate_fixture.identifier(schema_publication) + ";",
        )
        self.sql(
            self.name,
            "ALTER TABLE " + gate_fixture.identifier(published_schema)
            + ".letter_sign_commands SET SCHEMA aso;",
        )
        self.sql(
            self.name,
            "CREATE EVENT TRIGGER aso_local_command_publication_guard "
            "ON ddl_command_end WHEN TAG IN ('CREATE PUBLICATION', 'ALTER PUBLICATION') "
            "EXECUTE FUNCTION aso.register_and_reject_local_publication();",
        )
        self.sql(
            self.name,
            "DROP PUBLICATION " + gate_fixture.identifier(publication) + ";",
        )
        self.sql(
            self.name,
            "DROP SCHEMA " + gate_fixture.identifier(published_schema) + ";",
        )
        recorded = self.report["checks"].pop("durable_gate_migration_recorded")
        self.report["checks"]["durable_signing_migration_recorded"] = recorded

    def exercise_transaction(self):
        super().exercise_transaction()
        lifecycle = self.report["checks"].pop(
            "actual_appservices_pg_repository_lifecycle"
        )
        self.report["checks"][
            "actual_verified_signing_appservices_pg_repository_lifecycle"
        ] = lifecycle


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--postgres-user", default="flint")
    parser.add_argument("--postgres-port", type=int)
    parser.add_argument("--command-seconds", type=int, default=600)
    parser.add_argument(
        "--install-mode", choices=("fresh", "upgrade"), default="upgrade"
    )
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    with open(
        Path(tempfile.gettempdir()) / "aso-gate-transaction-fixture.lock", "a"
    ) as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("Signing transaction probe: another fixture is running", file=sys.stderr)
            return 1
        return SigningProbe(args).run()


if __name__ == "__main__":
    sys.exit(main())
