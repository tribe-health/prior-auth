#!/usr/bin/env python3
"""Tier 1 disposable PostgreSQL fixture for evidence reassessment."""

import argparse
import fcntl
import importlib.util
from pathlib import Path
import sys
import tempfile


ROOT = Path(__file__).resolve().parents[1]
HELPER = ROOT / "scripts/test-gate-transaction.py"
SPEC = importlib.util.spec_from_file_location("aso_gate_transaction_fixture", HELPER)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("gate_transaction_fixture_unavailable")
gate_fixture = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(gate_fixture)

OUTPUT = ROOT / ".kbd-orchestrator/phases/runtime-architecture/evidence/ra-03-clinical-command-parity/reassessment-transaction.json"
gate_fixture.MIGRATION_VERSION = 2026090603
gate_fixture.TEST = [
    "cargo", "test", "-p", "aso-web-server",
    "reassessment_gate_transaction_lifecycle", "--", "--ignored", "--nocapture",
]
gate_fixture.SOURCE_FILES = (
    "migrations/server/2026090600_local_publication_boundary.sql",
    "migrations/server/2026090603_durable_reassessment.sql",
    "migrations/server/2026090604_immutable_approved_sources.sql",
    "migrations/server/2026090605_clinical_revision_guards.sql",
    "migrations/server/2026090606_clinical_truncate_guards.sql",
    "migrations/server/2026090607_publication_ddl_serialization.sql",
    "migrations/server/2026090608_approval_qa_serialization.sql",
    "crates/aso-host/src/reassessment.rs",
    "crates/aso-host/src/signing.rs",
    "crates/aso-host/src/ports/mod.rs",
    "crates/aso-server-axum/src/routes/evidence.rs",
    "crates/aso-server-axum/src/routes/letters.rs",
    "crates/aso-server-axum/src/routes/gate.rs",
    "crates/aso-web-server/src/adapters/gate.rs",
    "crates/aso-web-server/src/adapters/gate/reassessment_transaction_tests.rs",
    "crates/aso-web-server/src/main.rs",
    "crates/aso-web-server/src/migrations.rs",
    "desktop/src-tauri/src/lib.rs",
    "docker/flint-gate/config.yaml",
    "web/src/features/evidence-timeline/api/timeline-api.ts",
    "web/src/features/evidence-timeline/hooks/use-evidence-timeline.ts",
    "scripts/test-reassessment-transaction.py",
)


class ReassessmentProbe(gate_fixture.Probe):
    def __init__(self, args):
        super().__init__(args)
        self.report["scope"] = (
            "Actual AppServices and PgGateRepository reassessment command "
            "and persisted reconciliation against disposable PostgreSQL"
        )
        self.report["commands"][0] = (
            "RUSTUP_TOOLCHAIN=1.97.1 python3 scripts/test-reassessment-transaction.py "
            "--install-mode " + self.install_mode
        )
        self.report["commands"][-1] = " ".join(gate_fixture.TEST)
        self.report["unverified"] = [
            "Mounted Gate image, native credentials and physical devices are outside this fixture."
        ]

    def assert_empty_clinical_schema(self, label, migrated=False):
        tables = gate_fixture.CLINICAL_FIXTURE_TABLES
        if migrated:
            tables += (
                "gate_commands",
                "letter_sign_commands",
                "evidence_reassessment_commands",
            )
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
        super().exercise_migrations()
        recorded = self.report["checks"].pop("durable_gate_migration_recorded")
        self.report["checks"]["durable_reassessment_migration_recorded"] = recorded

    def exercise_transaction(self):
        super().exercise_transaction()
        lifecycle = self.report["checks"].pop(
            "actual_appservices_pg_repository_lifecycle"
        )
        self.report["checks"][
            "actual_reassessment_command_and_reconciliation_lifecycle"
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
            print("Reassessment transaction probe: another fixture is running", file=sys.stderr)
            return 1
        return ReassessmentProbe(args).run()


if __name__ == "__main__":
    sys.exit(main())
