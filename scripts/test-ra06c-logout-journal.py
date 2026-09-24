#!/usr/bin/env python3
"""Tier 1 disposable PostgreSQL proof for the RA06c logout journal adapter."""

import argparse
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import re
import secrets
import sys
import tempfile
import urllib.parse


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "scripts/test-ra06c-authority-migration.py"
SPEC = importlib.util.spec_from_file_location("ra06c_authority_fixture", SOURCE)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("authority_fixture_unavailable")
authority_fixture = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(authority_fixture)

EXECUTOR_ROLE = "aso_session_authority_executor"
authority_fixture.gate_fixture.ROLES = (
    *authority_fixture.gate_fixture.ROLES,
    EXECUTOR_ROLE,
)
authority_fixture.gate_fixture.SOURCE_FILES = (
    "migrations/server/2026090609_durable_session_authority.sql",
    "migrations/server/2026090610_session_logout_executor.sql",
    "docker/bootstrap/25-session-authority.sql",
    "docker/bootstrap/26-session-logout-executor.sql",
    "crates/aso-host/src/logout.rs",
    "crates/aso-host/src/session.rs",
    "crates/aso-host/src/lib.rs",
    "crates/aso-web-server/src/adapters/session.rs",
    "crates/aso-web-server/src/adapters/session/journal.rs",
    "crates/aso-web-server/src/adapters/session/journal_tests.rs",
    "crates/aso-web-server/src/adapters/session/logout.rs",
    "crates/aso-web-server/src/adapters/session/transaction_tests.rs",
    "crates/aso-web-server/src/main.rs",
    "crates/aso-web-server/src/migrations.rs",
    "crates/aso-server-axum/src/session.rs",
    "crates/aso-server-axum/src/routes/gate/tests.rs",
    "docs/architecture/application-runtime-architecture.md",
    "scripts/test-ra06c-authority-migration.py",
    "scripts/test-ra06c-logout-journal.py",
)

OUTPUT = (
    ROOT
    / ".kbd-orchestrator/phases/runtime-architecture/children/"
    "ra06-revocation-contract-repair/evidence/task-4-session-denials.json"
)
TEST = [
    "cargo",
    "test",
    "-p",
    "aso-web-server",
    "adapters::session::journal_tests::logout_journal_lease_lifecycle",
    "--",
    "--ignored",
    "--exact",
    "--nocapture",
]


class LogoutJournalProbe(authority_fixture.AuthorityMigrationProbe):
    def __init__(self, args):
        super().__init__(args)
        self.output = Path(args.output)
        self.report.update(
            scope=(
                "Restricted PgLogoutJournal denial predicate, lease, retry, "
                "confirmation and transactional event lifecycle"
            ),
            commands=[
                "RUSTUP_TOOLCHAIN=1.98.1 python3 scripts/test-ra06c-logout-journal.py",
                "docker compose exec -T db psql -U <configured admin> ...",
                "cargo run -p aso-web-server -- --migrate-server",
                " ".join(TEST),
            ],
            unverified=[
                "Mounted HTTP/Tauri parity is task 2.2.",
                "This fixture exercises the restricted journal without a real Kratos process; the assembled real-Kratos campaign belongs to ra06c-04.",
            ],
            environment_contract={
                "migration": ["ASO_MIGRATION_DATABASE_URL"],
                "test": [
                    "ASO_TEST_LOGOUT_DATABASE_URL",
                    "ASO_TEST_ADMIN_DATABASE_URL",
                ],
                "credentials": (
                    "Disposable passwords supplied only through environment or captured SQL stdin"
                ),
            },
        )

    def exercise_migrations(self):
        super().exercise_migrations()
        installed = self.sql(
            self.name,
            "SELECT count(*)=1 FROM public._sqlx_migrations "
            "WHERE version=2026090610 AND success;",
        ).stdout.strip()
        role = self.sql(
            self.name,
            "SELECT NOT rolcanlogin AND NOT (rolsuper OR rolcreatedb OR rolcreaterole "
            "OR rolreplication OR rolbypassrls) FROM pg_roles "
            "WHERE rolname='aso_session_authority_executor';",
        ).stdout.strip()
        self.check(
            "logout_executor_migration_and_restricted_role_present",
            installed == "t" and role == "t",
        )

    def exercise_transaction(self):
        self.mark("restricted_logout_journal_lifecycle")
        password = secrets.token_urlsafe(36)
        self.sql(
            "postgres",
            "CREATE ROLE "
            + authority_fixture.gate_fixture.identifier(self.login)
            + " LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD "
            + authority_fixture.gate_fixture.literal(password)
            + ";",
        )
        self.created_login = True
        self.sql(
            "postgres",
            "GRANT aso_session_authority_executor TO "
            + authority_fixture.gate_fixture.identifier(self.login)
            + ";",
        )
        parsed = urllib.parse.urlsplit(self.admin_url)
        runtime_url = (
            "postgresql://"
            + self.login
            + ":"
            + urllib.parse.quote(password, safe="")
            + "@"
            + parsed.netloc.rsplit("@", 1)[1]
            + parsed.path
        )
        env = os.environ.copy()
        env.pop("ASO_MIGRATION_DATABASE_URL", None)
        env.update(
            ASO_TEST_LOGOUT_DATABASE_URL=runtime_url,
            ASO_TEST_ADMIN_DATABASE_URL=self.admin_url,
        )
        completed, entry = self.run_process(
            "actual_logout_journal_lease_lifecycle", TEST, env
        )
        combined = completed.stdout + "\n" + completed.stderr
        markers = [
            line.strip()
            for line in combined.splitlines()
            if re.fullmatch(
                r"logout_journal_check: [a-z][a-z0-9_]*", line.strip()
            )
            or "logout_journal_lease_lifecycle ... ok" in line
        ]
        entry["actual_result_output"] = markers
        if completed.returncode:
            entry["failure_output"] = combined.splitlines()[-80:]
        assertions = [
            line for line in markers if line.startswith("logout_journal_check: ")
        ]
        self.check(
            "actual_pg_logout_journal_lifecycle",
            completed.returncode == 0
            and len(assertions) == 9
            and any("logout_journal_lease_lifecycle ... ok" in line for line in markers),
            return_code=completed.returncode,
            assertion_count=len(assertions),
        )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--postgres-user", default="flint")
    parser.add_argument("--postgres-port", type=int)
    parser.add_argument("--command-seconds", type=int, default=600)
    parser.add_argument("--install-mode", choices=("fresh", "upgrade"), default="upgrade")
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    lock_path = Path(tempfile.gettempdir()) / "aso-gate-transaction-fixture.lock"
    with open(lock_path, "a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("Logout journal probe: another fixture is running", file=sys.stderr)
            return 1
        return LogoutJournalProbe(args).run()


if __name__ == "__main__":
    sys.exit(main())
