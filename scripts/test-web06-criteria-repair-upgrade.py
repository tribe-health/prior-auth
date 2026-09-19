#!/usr/bin/env python3
"""Prove migration 26 upgrades a populated catalog with frozen 24/25 recorded."""

import argparse
import fcntl
import hashlib
import importlib.util
from pathlib import Path
import sys
import tempfile


ROOT = Path(__file__).resolve().parents[1]
SERVICE_PROBE = ROOT / "scripts/test-web06-criteria-service.py"


def load_service_probe():
    spec = importlib.util.spec_from_file_location(
        "web06_criteria_service_probe", SERVICE_PROBE
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("criteria_service_probe_unavailable")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


service = load_service_probe()
base = service.migration.base
base.SOURCE_FILES = base.SOURCE_FILES + (
    "scripts/test-web06-criteria-repair-upgrade.py",
)


class CriteriaRepairUpgradeProbe(service.CriteriaServiceProbe):
    def __init__(self, args):
        super().__init__(args)
        self.report["install_mode"] = "frozen-web06-upgrade"
        self.report["commands"][0] = (
            "python3 scripts/test-web06-criteria-repair-upgrade.py "
            f"--output {self.output}"
        )
        self.report["scope"] = (
            "Forward-only Web-06 repair from a populated database with immutable "
            "migrations 2026090624 and 2026090625 already recorded, followed by "
            "the complete criteria AppServices and mounted HTTP lifecycle"
        )

    def exercise_migrations(self):
        self.mark("install_frozen_web06_history")
        self.sql(
            self.name,
            """
            CREATE TABLE public._sqlx_migrations (
              version bigint PRIMARY KEY,
              description text NOT NULL,
              installed_on timestamptz NOT NULL DEFAULT now(),
              success boolean NOT NULL,
              checksum bytea NOT NULL,
              execution_time bigint NOT NULL
            );
            """,
        )
        historical = [
            path
            for path in sorted((ROOT / "migrations/server").glob("*.sql"))
            if int(path.name.split("_", 1)[0]) <= 2026090625
        ]
        for path in historical:
            version_text, description = path.stem.split("_", 1)
            statement = path.read_text()
            if int(version_text) >= 2026090624:
                statement = "BEGIN;\n" + statement + "\nCOMMIT;\n"
            installed = self.with_role_tracking(
                lambda statement=statement: self.sql(
                    self.name, statement, require_success=False
                )
            )
            self.check(
                f"historical_migration_{version_text}",
                installed.returncode == 0,
                database_error=[
                    line.strip()
                    for line in installed.stderr.splitlines()
                    if "ERROR:" in line or "DETAIL:" in line or "CONTEXT:" in line
                ][-8:],
            )
            checksum = hashlib.sha384(path.read_bytes()).hexdigest()
            self.sql(
                self.name,
                "INSERT INTO public._sqlx_migrations("
                "version,description,success,checksum,execution_time) VALUES ("
                f"{int(version_text)},{base.literal(description.replace('_', ' '))},"
                f"true,decode({base.literal(checksum)},'hex'),0);",
            )

        frozen_24 = hashlib.sha384(
            (
                ROOT
                / ".refiner/artifacts/web-06-criteria-catalog-core/dist/"
                "migrations/server/2026090624_criteria_catalog.sql"
            ).read_bytes()
        ).hexdigest()
        frozen_25 = hashlib.sha384(
            (
                ROOT
                / ".refiner/artifacts/web-06-criteria-catalog-core/dist/"
                "migrations/server/2026090625_criteria_catalog_commands.sql"
            ).read_bytes()
        ).hexdigest()
        recorded = self.sql(
            self.name,
            "SELECT string_agg(version::text || ':' || encode(checksum,'hex'),',' "
            "ORDER BY version) FROM public._sqlx_migrations "
            "WHERE version IN (2026090624,2026090625);",
        ).stdout.strip()
        self.check(
            "frozen_web06_migrations_recorded_byte_for_byte",
            recorded
            == f"2026090624:{frozen_24},2026090625:{frozen_25}",
            recorded=recorded,
        )
        self.check(
            "frozen_catalog_is_populated_before_repair",
            self.sql(
                self.name, "SELECT count(*) FROM aso.criteria;"
            ).stdout.strip()
            == "2",
        )
        before = self.sql(
            self.name,
            "SELECT version::text || ':' || encode(checksum,'hex') "
            "FROM public._sqlx_migrations ORDER BY version;",
        ).stdout.strip()

        completed, _ = self.migration("apply_forward_criteria_catalog_repair")
        self.check(
            "forward_repair_migration_applies",
            completed.returncode == 0,
            return_code=completed.returncode,
        )
        preserved = self.sql(
            self.name,
            "SELECT version::text || ':' || encode(checksum,'hex') "
            "FROM public._sqlx_migrations WHERE version <= 2026090625 "
            "ORDER BY version;",
        ).stdout.strip()
        self.check("historical_migration_ledger_is_unchanged", preserved == before)
        repaired = self.sql(
            self.name,
            """
            SELECT jsonb_build_object(
              'repairRecorded',EXISTS(
                SELECT FROM public._sqlx_migrations
                 WHERE version=2026090626 AND success),
              'scopeConstraint',EXISTS(
                SELECT FROM pg_constraint
                 WHERE conrelid='aso.criteria'::regclass
                   AND conname='criteria_controlling_scope_matches_grade'),
              'overlapDefinition',(SELECT pg_get_constraintdef(oid)
                FROM pg_constraint
               WHERE conrelid='aso.criteria'::regclass
                 AND conname='criteria_no_overlapping_validity'),
              'tokenDefinition',(SELECT pg_get_constraintdef(oid)
                FROM pg_constraint
               WHERE conrelid='aso.criteria_catalog_state'::regclass
                 AND conname='criteria_catalog_state_revision_token_check'),
              'catalogCount',(SELECT count(*) FROM aso.criteria))::text;
            """,
        ).stdout.strip()
        import json

        repaired = json.loads(repaired)
        self.check(
            "repair_constraints_are_active_on_existing_catalog",
            repaired["repairRecorded"]
            and repaired["scopeConstraint"]
            and "evidence_grade WITH =" in repaired["overlapDefinition"]
            and "COALESCE(practice_id" in repaired["overlapDefinition"]
            and "revision_token =" in repaired["tokenDefinition"]
            and repaired["catalogCount"] == 2,
            observed=repaired,
        )

        rerun, _ = self.migration("unchanged_forward_repair_rerun")
        self.check(
            "unchanged_forward_repair_rerun",
            rerun.returncode == 0,
            return_code=rerun.returncode,
        )


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--postgres-user", default="flint")
    parser.add_argument("--postgres-port", type=int)
    parser.add_argument("--command-seconds", type=int, default=900)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    args.install_mode = "upgrade"
    return args


if __name__ == "__main__":
    lock_path = Path(tempfile.gettempdir()) / "aso-web06-criteria-service.lock"
    with open(lock_path, "a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("Web-06 criteria service probe is already running", file=sys.stderr)
            sys.exit(1)
        sys.exit(CriteriaRepairUpgradeProbe(parse_args()).run())
