#!/usr/bin/env python3
"""Tier 1 disposable PostgreSQL proof for RA06c durable authority migration."""

import argparse
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import tempfile
import time
import urllib.parse
import uuid


ROOT = Path(__file__).resolve().parents[1]
DOCKER_TOOL = os.environ.get("RA06_TOOL_DOCKER", "docker")
CARGO_TOOL = os.environ.get("RA06_TOOL_CARGO", "cargo")
GATE_ROOT = Path(os.environ.get("RA06_GATE_SOURCE_ROOT", ROOT.parents[2] / "prometheus/flint-gate"))
HELPER = ROOT / "scripts/test-gate-transaction.py"
SPEC = importlib.util.spec_from_file_location("aso_gate_transaction_fixture", HELPER)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("gate_transaction_fixture_unavailable")
gate_fixture = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(gate_fixture)

MIGRATION_VERSION = 2026090609
OUTPUT = (
    ROOT
    / ".kbd-orchestrator/phases/runtime-architecture/children/"
    "ra06-revocation-contract-repair/evidence/task-2-authority-migration.json"
)
gate_fixture.MIGRATION_VERSION = MIGRATION_VERSION
gate_fixture.SOURCE_FILES = (
    "migrations/server/2026090609_durable_session_authority.sql",
    "docker/bootstrap/25-session-authority.sql",
    "crates/aso-web-server/src/migrations.rs",
    "migrations/server/2026090611_gate_authority_event_reader.sql",
    "docker/bootstrap/27-gate-authority-event-reader.sql",
    "migrations/server/2026090612_gate_authority_function_boundary.sql",
    "docker/bootstrap/28-gate-authority-function-boundary.sql",
    "scripts/test-gate-transaction.py",
    "scripts/test-ra06c-authority-migration.py",
)

GATE_CONSUMER_TEST = [
    CARGO_TOOL,
    "test",
    "--manifest-path",
    str(GATE_ROOT / "Cargo.toml"),
    "-p",
    "flint-gate-core",
    "--all-features",
    "authority::postgres::tests::authority_reader_and_cursor_lifecycle",
    "--",
    "--ignored",
    "--exact",
    "--nocapture",
]

LEGACY_AUTHORITY_SQL = """
CREATE TABLE aso.authorization_revision (
  singleton boolean PRIMARY KEY CHECK (singleton),
  incarnation uuid NOT NULL DEFAULT gen_random_uuid(),
  revision bigint NOT NULL CHECK (revision > 0)
);
INSERT INTO aso.authorization_revision (singleton, revision) VALUES (true, 7);
CREATE FUNCTION aso.bump_authorization_revision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  UPDATE aso.authorization_revision SET revision=revision+1 WHERE singleton=true;
  IF NOT FOUND THEN RAISE EXCEPTION 'authorization revision is missing'; END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER users_authorization_revision
  AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON aso.users
  FOR EACH STATEMENT EXECUTE FUNCTION aso.bump_authorization_revision();
CREATE TRIGGER user_roles_authorization_revision
  AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON aso.user_roles
  FOR EACH STATEMENT EXECUTE FUNCTION aso.bump_authorization_revision();
CREATE TRIGGER role_capabilities_authorization_revision
  AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON aso.role_capabilities
  FOR EACH STATEMENT EXECUTE FUNCTION aso.bump_authorization_revision();
CREATE TRIGGER capabilities_authorization_revision
  AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON aso.capabilities
  FOR EACH STATEMENT EXECUTE FUNCTION aso.bump_authorization_revision();
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='aso_session_reader') THEN
    CREATE ROLE aso_session_reader NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOREPLICATION NOBYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA aso TO aso_session_reader;
GRANT SELECT ON aso.users, aso.user_roles, aso.role_capabilities,
  aso.capabilities, aso.user_capabilities, aso.authorization_revision
  TO aso_session_reader;
"""


class AuthorityMigrationProbe(gate_fixture.Probe):
    def __init__(self, args):
        super().__init__(args)
        self.output = Path(args.output)
        self.name = "synthetic_ra06c_authority_" + uuid.uuid4().hex
        self.login = self.name + "_login"
        self.owner_role = self.name + "_owner"
        self.gate_database = self.name + "_gate"
        self.reader_login = self.name + "_authority_reader"
        self.created_gate_database = False
        self.created_reader_login = False
        self.report.update(
            scope=(
                "Fresh bootstrap and additive upgrade migration for ASO session "
                "denials and transactional authority events, plus the mounted Gate "
                "snapshot, replay, durable cursor and process-local readiness lifecycle"
            ),
            commands=[
                "RUSTUP_TOOLCHAIN=1.98.1 python3 scripts/test-ra06c-authority-migration.py "
                "--install-mode " + self.install_mode,
                "docker compose port db 5432",
                "docker compose exec -T db printenv POSTGRES_PASSWORD (captured only)",
                "docker compose exec -T db psql -U <configured admin> -X -A -t -q "
                "-v ON_ERROR_STOP=1 -d <disposable database> (SQL on stdin)",
                "cargo run -p aso-web-server -- --migrate-server",
                "cargo test --manifest-path <flint-gate>/Cargo.toml -p "
                "flint-gate-core --all-features "
                "authority::postgres::tests::authority_reader_and_cursor_lifecycle "
                "-- --ignored --exact --nocapture",
            ],
            environment_contract={
                "migration": ["ASO_MIGRATION_DATABASE_URL"],
                "test": [
                    "RA06C02_ASO_READER_DATABASE_URL",
                    "RA06C02_ASO_OWNER_DATABASE_URL",
                    "RA06C02_GATE_DATABASE_URL",
                    "CARGO_TARGET_DIR",
                ],
                "credentials": (
                    "Disposable passwords supplied only through environment or captured SQL stdin"
                ),
            },
            unverified=[
                "Redis atomic publication, request enforcement, two-Gate failure modes, "
                "HTTP/Tauri, UI and physical devices remain later tasks."
            ],
        )
        self.report["companion_source_sha256"] = {
            str(path.relative_to(GATE_ROOT)): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in (
                GATE_ROOT / "Cargo.lock",
                GATE_ROOT / "config.example.yaml",
                GATE_ROOT / "crates/flint-gate-core/migrations/0004_aso_authority_cursors.sql",
                GATE_ROOT / "crates/flint-gate-core/migrations/0005_config_revision.sql",
                GATE_ROOT / "crates/flint-gate-core/src/lib.rs",
                GATE_ROOT / "crates/flint-gate-core/src/authority/mod.rs",
                GATE_ROOT / "crates/flint-gate-core/src/authority/postgres.rs",
                GATE_ROOT / "crates/flint-gate-core/src/authority/consumer.rs",
                GATE_ROOT / "crates/flint-gate-core/src/cache/mod.rs",
                GATE_ROOT / "crates/flint-gate-core/src/config/types.rs",
                GATE_ROOT / "crates/flint-gate-core/src/db/mod.rs",
                GATE_ROOT / "crates/flint-gate/src/main.rs",
            )
        }

    def create_database(self):
        self.mark("disposable_database_and_" + self.install_mode + "_fixture")
        self.preexisting_roles = self.roles_present()
        port = self.args.postgres_port
        if port is None:
            published = subprocess.run(
                [DOCKER_TOOL, "compose", "port", "db", "5432"],
                cwd=ROOT,
                capture_output=True,
                text=True,
                timeout=20,
            )
            self.check(
                "postgres_port_discovery",
                published.returncode == 0,
                return_code=published.returncode,
            )
            port = int(published.stdout.strip().splitlines()[0].rsplit(":", 1)[1])
        if not 0 < port < 65536:
            raise ValueError("invalid_database_port")
        password_result = subprocess.run(
            [DOCKER_TOOL, "compose", "exec", "-T", "db", "printenv", "POSTGRES_PASSWORD"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=20,
        )
        self.check(
            "configured_admin_password_available",
            password_result.returncode == 0 and bool(password_result.stdout.strip()),
            return_code=password_result.returncode,
        )
        admin_password = password_result.stdout.strip()
        self.admin_url = (
            "postgresql://"
            + urllib.parse.quote(self.args.postgres_user, safe="")
            + ":"
            + urllib.parse.quote(admin_password, safe="")
            + f"@localhost:{port}/"
            + self.name
        )
        self.sql("postgres", "CREATE DATABASE " + gate_fixture.identifier(self.name) + ";")
        self.created_database = True
        self.sql(self.name, (ROOT / "docs/design/schema/schema.sql").read_text())
        bootstrap = (
            (
                (ROOT / "docker/bootstrap/25-session-authority.sql").read_text()
                + "\n"
                + (ROOT / "docker/bootstrap/27-gate-authority-event-reader.sql").read_text()
            )
            if self.install_mode == "fresh"
            else LEGACY_AUTHORITY_SQL
        )
        self.with_role_tracking(lambda: self.sql(self.name, bootstrap))

        if self.install_mode == "fresh":
            state = self.sql(
                self.name,
                """SELECT to_regclass('aso.session_denials') IS NOT NULL
                     AND to_regclass('aso.authority_outbox') IS NOT NULL
                     AND (SELECT count(*)=1 FROM aso.authority_deployment)
                     AND (SELECT count(*)=0 FROM aso.authority_outbox);""",
            ).stdout.strip()
            self.check("fresh_bootstrap_installs_empty_durable_authority_state", state == "t")
        else:
            self.legacy_authority = self.sql(
                self.name,
                "SELECT incarnation::text || ':' || revision::text "
                "FROM aso.authorization_revision WHERE singleton=true;",
            ).stdout.strip()
            absent = self.sql(
                self.name,
                "SELECT to_regclass('aso.session_denials') IS NULL "
                "AND to_regclass('aso.authority_outbox') IS NULL;",
            ).stdout.strip()
            self.check("upgrade_fixture_starts_at_legacy_authority_schema", absent == "t")

    def exercise_migrations(self):
        migrated, _ = self.migration("initial_server_migration")
        self.check(
            "initial_server_migration",
            migrated.returncode == 0,
            return_code=migrated.returncode,
        )
        shape = self.sql(
            self.name,
            """SELECT
                 (SELECT count(*)=1 FROM aso.authority_deployment)
                 AND (SELECT count(*)=1 FROM aso.authorization_revision)
                 AND to_regclass('aso.session_denials') IS NOT NULL
                 AND to_regclass('aso.authority_outbox') IS NOT NULL
                 AND (SELECT count(*)=4 FROM aso.local_replication_exclusions e
                      JOIN pg_class c ON c.oid=e.relation_oid
                      JOIN pg_namespace n ON n.oid=c.relnamespace
                      WHERE n.nspname='aso' AND c.relname IN
                        ('authority_deployment','authorization_revision',
                         'session_denials','authority_outbox'))
                 AND (SELECT count(*)=1 FROM public._sqlx_migrations
                      WHERE version=2026090609 AND success);""",
        ).stdout.strip()
        self.check("durable_authority_schema_and_migration_ledger_present", shape == "t")
        reader_shape = self.sql(
            self.name,
            """SELECT count(*)=1
                 AND bool_and(NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb
                   AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls)
                 AND pg_has_role('aso_authority_event_reader',
                                 'aso_authority_event_reader', 'USAGE')
                 AND has_schema_privilege('aso_authority_event_reader', 'aso', 'USAGE')
                 AND NOT has_schema_privilege('aso_authority_event_reader', 'aso', 'CREATE')
                 AND has_table_privilege('aso_authority_event_reader',
                                         'aso.authority_deployment', 'SELECT')
                 AND has_table_privilege('aso_authority_event_reader',
                                         'aso.authorization_revision', 'SELECT')
                 AND has_table_privilege('aso_authority_event_reader',
                                         'aso.session_denials', 'SELECT')
                 AND has_table_privilege('aso_authority_event_reader',
                                         'aso.authority_outbox', 'SELECT')
                 AND NOT has_table_privilege('aso_authority_event_reader',
                                             'aso.users', 'SELECT')
                 AND NOT EXISTS (
                   SELECT FROM pg_class sequence
                   JOIN pg_namespace namespace ON namespace.oid=sequence.relnamespace
                   WHERE namespace.nspname='aso' AND sequence.relkind='S'
                     AND (
                       has_sequence_privilege('aso_authority_event_reader',
                                              sequence.oid, 'SELECT')
                       OR has_sequence_privilege('aso_authority_event_reader',
                                                 sequence.oid, 'USAGE')
                       OR has_sequence_privilege('aso_authority_event_reader',
                                                 sequence.oid, 'UPDATE')
                     )
                 )
                 AND NOT EXISTS (
                   SELECT FROM pg_proc routine
                   JOIN pg_namespace namespace ON namespace.oid=routine.pronamespace
                   WHERE namespace.nspname='aso'
                     AND has_function_privilege('aso_authority_event_reader',
                                                routine.oid, 'EXECUTE')
                 )
                 AND (SELECT count(*)=1 FROM public._sqlx_migrations
                       WHERE version=2026090611 AND success)
                 AND (SELECT count(*)=1 FROM public._sqlx_migrations
                       WHERE version=2026090612 AND success)
               FROM pg_roles WHERE rolname='aso_authority_event_reader';""",
        ).stdout.strip()
        self.check("gate_authority_reader_has_exact_read_only_surface", reader_shape == "t")
        different_owner_default = self.sql(
            self.name,
            """BEGIN;
               GRANT CREATE ON SCHEMA aso TO aso_gate_owner;
               SET LOCAL ROLE aso_gate_owner;
               CREATE FUNCTION aso.ra06c_default_privilege_probe() RETURNS integer
                 LANGUAGE sql IMMUTABLE AS 'SELECT 1';
               RESET ROLE;
               REVOKE CREATE ON SCHEMA aso FROM aso_gate_owner;
               COMMIT;
               SELECT NOT has_function_privilege(
                 'aso_authority_event_reader',
                 'aso.ra06c_default_privilege_probe()',
                 'EXECUTE');
               DROP FUNCTION aso.ra06c_default_privilege_probe();""",
        ).stdout.strip()
        self.check(
            "different_owner_function_defaults_refuse_reader_execution",
            different_owner_default == "t",
            actual_output=different_owner_default,
        )
        self.report["authority_identity"] = json.loads(
            self.sql(
                self.name,
                "SELECT jsonb_build_object("
                "'deployment_id', deployment.deployment_id, "
                "'authority_incarnation', revision.incarnation)::text "
                "FROM aso.authority_deployment deployment "
                "CROSS JOIN aso.authorization_revision revision "
                "WHERE deployment.singleton=true AND revision.singleton=true;",
            ).stdout.strip()
        )
        if self.install_mode == "upgrade":
            upgraded = self.sql(
                self.name,
                "SELECT incarnation::text || ':' || revision::text "
                "FROM aso.authorization_revision WHERE singleton=true;",
            ).stdout.strip()
            self.check("upgrade_preserves_authority_incarnation_and_revision", upgraded == self.legacy_authority)

        before_ledger = self.sql(
            self.name,
            "SELECT encode(checksum,'hex') FROM public._sqlx_migrations "
            "WHERE version=2026090609 AND success;",
        ).stdout.strip()
        rerun, _ = self.migration("unchanged_server_migration_rerun")
        after_ledger = self.sql(
            self.name,
            "SELECT encode(checksum,'hex') FROM public._sqlx_migrations "
            "WHERE version=2026090609 AND success;",
        ).stdout.strip()
        self.check(
            "unchanged_migration_rerun_preserves_checksum",
            rerun.returncode == 0
            and bool(re.fullmatch(r"[0-9a-f]+", before_ledger))
            and after_ledger == before_ledger,
            return_code=rerun.returncode,
        )

    def authority_snapshot(self):
        raw = self.sql(
            self.name,
            """SELECT jsonb_build_object(
                   'revision', (SELECT revision FROM aso.authorization_revision WHERE singleton),
                   'events', (SELECT count(*) FROM aso.authority_outbox),
                   'max_sequence', COALESCE((SELECT max(sequence) FROM aso.authority_outbox),0)
                 )::text;""",
        ).stdout.strip()
        return json.loads(raw)

    def psql_command(self, statement):
        return [
            DOCKER_TOOL,
            "compose",
            "exec",
            "-T",
            "db",
            "psql",
            "-U",
            self.args.postgres_user,
            "-X",
            "-A",
            "-t",
            "-q",
            "-v",
            "ON_ERROR_STOP=1",
            "-d",
            self.name,
            "-c",
            statement,
        ]

    def exercise_transaction(self):
        self.mark("transactional_authority_and_retention_proofs")
        before = self.authority_snapshot()
        in_transaction = self.sql(
            self.name,
            """BEGIN;
               UPDATE aso.capabilities SET description=description WHERE false;
               SELECT jsonb_build_object(
                 'revision', (SELECT revision FROM aso.authorization_revision WHERE singleton),
                 'events', (SELECT count(*) FROM aso.authority_outbox)
               )::text;
               ROLLBACK;""",
        ).stdout.strip().splitlines()
        transient = json.loads(in_transaction[-1])
        after_rollback = self.authority_snapshot()
        self.check(
            "authority_rollback_emits_no_event_and_advances_no_revision",
            transient["revision"] == before["revision"] + 1
            and transient["events"] == before["events"] + 1
            and after_rollback == before,
        )

        self.sql(self.name, "UPDATE aso.capabilities SET description=description WHERE false;")
        after_commit = self.authority_snapshot()
        committed_tuple = self.sql(
            self.name,
            """SELECT count(*)=1 FROM aso.authority_outbox event
               JOIN aso.authority_deployment deployment USING (deployment_id)
               JOIN aso.authorization_revision revision
                 ON revision.incarnation=event.authority_incarnation
                AND revision.revision=event.authorization_revision
               WHERE event.event_type='membership_revision'
                 AND event.sequence=(SELECT max(sequence) FROM aso.authority_outbox);""",
        ).stdout.strip()
        self.check(
            "authority_commit_advances_one_revision_and_one_deployment_qualified_event",
            after_commit["revision"] == before["revision"] + 1
            and after_commit["events"] == before["events"] + 1
            and committed_tuple == "t",
        )

        issuer = "https://kratos.synthetic.invalid/"
        session = "synthetic-session-" + uuid.uuid4().hex
        self.sql(
            self.name,
            """INSERT INTO aso.session_denials (
                 deployment_id, kratos_issuer, kratos_session_id,
                 session_expires_at, skew_allowance, retain_until, next_attempt_at
               ) SELECT deployment_id,"""
            + gate_fixture.literal(issuer)
            + ","
            + gate_fixture.literal(session)
            + """, statement_timestamp()+interval '1 hour', interval '1 second',
                 statement_timestamp()+interval '1 hour 1 second', clock_timestamp()
               FROM aso.authority_deployment WHERE singleton=true;""",
        )
        denial_event = self.sql(
            self.name,
            "SELECT count(*)=1 FROM aso.authority_outbox WHERE event_type='session_denied' "
            "AND kratos_issuer="
            + gate_fixture.literal(issuer)
            + " AND kratos_session_id="
            + gate_fixture.literal(session)
            + ";",
        ).stdout.strip()
        self.check("session_denial_insert_appends_one_replayable_event", denial_event == "t")

        null_issuer = self.sql(
            self.name,
            """INSERT INTO aso.authority_outbox (
                 event_type, deployment_id, authority_incarnation,
                 authorization_revision, kratos_issuer, kratos_session_id
               ) SELECT 'session_denied', deployment_id, incarnation, revision,
                        NULL, 'synthetic-null-issuer'
                   FROM aso.authority_deployment
             CROSS JOIN aso.authorization_revision
                  WHERE authority_deployment.singleton=true
                    AND authorization_revision.singleton=true;""",
            False,
        )
        null_session = self.sql(
            self.name,
            """INSERT INTO aso.authority_outbox (
                 event_type, deployment_id, authority_incarnation,
                 authorization_revision, kratos_issuer, kratos_session_id
               ) SELECT 'session_denied', deployment_id, incarnation, revision,
                        'https://kratos.synthetic.invalid/', NULL
                   FROM aso.authority_deployment
             CROSS JOIN aso.authorization_revision
                  WHERE authority_deployment.singleton=true
                    AND authorization_revision.singleton=true;""",
            False,
        )
        null_event_absent = self.sql(
            self.name,
            "SELECT NOT EXISTS (SELECT FROM aso.authority_outbox "
            "WHERE event_type='session_denied' "
            "AND (kratos_issuer IS NULL OR kratos_session_id IS NULL));",
        ).stdout.strip()
        self.check(
            "session_denial_event_requires_complete_issuer_session_tuple",
            null_issuer.returncode != 0
            and null_session.returncode != 0
            and null_event_absent == "t",
            null_issuer_return_code=null_issuer.returncode,
            null_session_return_code=null_session.returncode,
        )

        first_ordered_session = "synthetic-session-order-first-" + uuid.uuid4().hex
        second_ordered_session = "synthetic-session-order-second-" + uuid.uuid4().hex
        locker_app = "ra06c_order_locker_" + uuid.uuid4().hex
        locker = subprocess.Popen(
            self.psql_command(
                "SET application_name="
                + gate_fixture.literal(locker_app)
                + "; BEGIN; "
                "SELECT incarnation, revision FROM aso.authorization_revision "
                "WHERE singleton=true FOR UPDATE; SELECT pg_sleep(2); "
                "INSERT INTO aso.session_denials (deployment_id, kratos_issuer, "
                "kratos_session_id, session_expires_at, skew_allowance, retain_until, "
                "next_attempt_at) SELECT deployment_id, "
                + gate_fixture.literal(issuer)
                + ","
                + gate_fixture.literal(first_ordered_session)
                + ", statement_timestamp()+interval '1 hour', interval '1 second', "
                "statement_timestamp()+interval '1 hour 1 second', clock_timestamp() "
                "FROM aso.authority_deployment WHERE singleton=true; COMMIT;"
            ),
            cwd=ROOT,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        lock_observed = False
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            lock_observed = (
                self.sql(
                    self.name,
                    "SELECT EXISTS (SELECT FROM pg_stat_activity WHERE application_name="
                    + gate_fixture.literal(locker_app)
                    + " AND wait_event='PgSleep');",
                ).stdout.strip()
                == "t"
            )
            if lock_observed:
                break
            time.sleep(0.05)
        contender = subprocess.Popen(
            self.psql_command(
                "INSERT INTO aso.session_denials (deployment_id, kratos_issuer, "
                "kratos_session_id, session_expires_at, skew_allowance, retain_until, "
                "next_attempt_at) SELECT deployment_id, "
                + gate_fixture.literal(issuer)
                + ","
                + gate_fixture.literal(second_ordered_session)
                + ", statement_timestamp()+interval '1 hour', interval '1 second', "
                "statement_timestamp()+interval '1 hour 1 second', clock_timestamp() "
                "FROM aso.authority_deployment WHERE singleton=true;"
            ),
            cwd=ROOT,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        time.sleep(0.25)
        contender_waited = contender.poll() is None
        locker_stdout, locker_stderr = locker.communicate(timeout=10)
        contender_stdout, contender_stderr = contender.communicate(timeout=10)
        ordered = self.sql(
            self.name,
            "SELECT (SELECT sequence FROM aso.authority_outbox WHERE kratos_session_id="
            + gate_fixture.literal(first_ordered_session)
            + ") < (SELECT sequence FROM aso.authority_outbox WHERE kratos_session_id="
            + gate_fixture.literal(second_ordered_session)
            + ") AND (SELECT count(*)=2 FROM aso.authority_outbox "
            "WHERE kratos_session_id IN ("
            + gate_fixture.literal(first_ordered_session)
            + ","
            + gate_fixture.literal(second_ordered_session)
            + "));",
        ).stdout.strip()
        self.check(
            "authority_outbox_sequence_follows_commit_order",
            lock_observed
            and contender_waited
            and locker.returncode == 0
            and contender.returncode == 0
            and ordered == "t",
            lock_observed=lock_observed,
            contender_waited=contender_waited,
            locker_return_code=locker.returncode,
            contender_return_code=contender.returncode,
            locker_output_bytes=len(locker_stdout) + len(locker_stderr),
            contender_output_bytes=len(contender_stdout) + len(contender_stderr),
        )

        rolled_session = "synthetic-session-rollback-" + uuid.uuid4().hex
        before_denial_rollback = self.authority_snapshot()
        self.sql(
            self.name,
            """BEGIN;
               INSERT INTO aso.session_denials (
                 deployment_id, kratos_issuer, kratos_session_id,
                 session_expires_at, skew_allowance, retain_until, next_attempt_at
               ) SELECT deployment_id,"""
            + gate_fixture.literal(issuer)
            + ","
            + gate_fixture.literal(rolled_session)
            + """, statement_timestamp()+interval '1 hour', interval '1 second',
                 statement_timestamp()+interval '1 hour 1 second', clock_timestamp()
               FROM aso.authority_deployment WHERE singleton=true;
               ROLLBACK;""",
        )
        after_denial_rollback = self.authority_snapshot()
        absent = self.sql(
            self.name,
            "SELECT NOT EXISTS (SELECT FROM aso.session_denials WHERE kratos_session_id="
            + gate_fixture.literal(rolled_session)
            + ") AND NOT EXISTS (SELECT FROM aso.authority_outbox WHERE kratos_session_id="
            + gate_fixture.literal(rolled_session)
            + ");",
        ).stdout.strip()
        self.check(
            "session_denial_rollback_leaves_no_journal_or_event_row",
            after_denial_rollback == before_denial_rollback and absent == "t",
        )

        foreign_session = "synthetic-session-foreign-deployment-" + uuid.uuid4().hex
        foreign_deployment = self.sql(
            self.name,
            "INSERT INTO aso.session_denials ("
            "deployment_id, kratos_issuer, kratos_session_id, session_expires_at, "
            "skew_allowance, retain_until, next_attempt_at) VALUES ("
            "gen_random_uuid(),"
            + gate_fixture.literal(issuer)
            + ","
            + gate_fixture.literal(foreign_session)
            + ", statement_timestamp()+interval '1 hour', interval '1 second', "
            "statement_timestamp()+interval '1 hour 1 second', clock_timestamp());",
            False,
        )
        foreign_absent = self.sql(
            self.name,
            "SELECT NOT EXISTS (SELECT FROM aso.session_denials WHERE kratos_session_id="
            + gate_fixture.literal(foreign_session)
            + ") AND NOT EXISTS (SELECT FROM aso.authority_outbox WHERE kratos_session_id="
            + gate_fixture.literal(foreign_session)
            + ");",
        ).stdout.strip()
        self.check(
            "foreign_deployment_cannot_create_denial_or_authority_event",
            foreign_deployment.returncode != 0 and foreign_absent == "t",
            return_code=foreign_deployment.returncode,
        )

        delete = self.sql(
            self.name,
            "DELETE FROM aso.session_denials WHERE kratos_issuer="
            + gate_fixture.literal(issuer)
            + " AND kratos_session_id="
            + gate_fixture.literal(session)
            + ";",
            False,
        )
        retained = self.sql(
            self.name,
            "SELECT count(*)=1 AND bool_and(retain_until=session_expires_at+skew_allowance) "
            "FROM aso.session_denials WHERE kratos_session_id="
            + gate_fixture.literal(session)
            + ";",
        ).stdout.strip()
        self.check(
            "unexpired_denial_cannot_be_deleted_before_expiry_plus_skew",
            delete.returncode != 0 and retained == "t",
            return_code=delete.returncode,
        )

        expired_session = "synthetic-session-expired-" + uuid.uuid4().hex
        self.sql(
            self.name,
            """INSERT INTO aso.session_denials (
                 deployment_id, kratos_issuer, kratos_session_id,
                 session_expires_at, skew_allowance, retain_until, next_attempt_at
               ) SELECT deployment_id,"""
            + gate_fixture.literal(issuer)
            + ","
            + gate_fixture.literal(expired_session)
            + """, statement_timestamp()-interval '2 seconds', interval '1 second',
                 statement_timestamp()-interval '1 second', clock_timestamp()
               FROM aso.authority_deployment WHERE singleton=true;""",
        )
        expired_delete = self.sql(
            self.name,
            "DELETE FROM aso.session_denials WHERE kratos_session_id="
            + gate_fixture.literal(expired_session)
            + ";",
        )
        expired_state = self.sql(
            self.name,
            "SELECT NOT EXISTS (SELECT FROM aso.session_denials WHERE kratos_session_id="
            + gate_fixture.literal(expired_session)
            + ") AND (SELECT count(*)=1 FROM aso.authority_outbox "
            "WHERE event_type='session_denied' AND kratos_session_id="
            + gate_fixture.literal(expired_session)
            + ");",
        ).stdout.strip()
        self.check(
            "expired_denial_deletes_after_retention_and_preserves_event",
            expired_delete.returncode == 0 and expired_state == "t",
            return_code=expired_delete.returncode,
        )

        publication = "ra06c_local_" + uuid.uuid4().hex
        publish = self.sql(
            self.name,
            "CREATE PUBLICATION "
            + gate_fixture.identifier(publication)
            + " FOR TABLE aso.session_denials;",
            False,
        )
        absent_publication = self.sql(
            self.name,
            "SELECT NOT EXISTS (SELECT FROM pg_publication WHERE pubname="
            + gate_fixture.literal(publication)
            + ");",
        ).stdout.strip()
        self.check(
            "session_denial_journal_is_structurally_refused_from_publication",
            publish.returncode != 0 and absent_publication == "t",
            return_code=publish.returncode,
        )

        self.exercise_gate_consumer()

    def exercise_gate_consumer(self):
        self.mark("mounted_gate_authority_consumer")
        password = secrets.token_urlsafe(36)
        self.sql(
            "postgres",
            "CREATE ROLE "
            + gate_fixture.identifier(self.reader_login)
            + " LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE "
            "NOREPLICATION NOBYPASSRLS PASSWORD "
            + gate_fixture.literal(password)
            + ";",
        )
        self.created_reader_login = True
        self.sql(
            "postgres",
            "GRANT aso_authority_event_reader TO "
            + gate_fixture.identifier(self.reader_login)
            + ";",
        )
        self.sql(
            "postgres",
            "CREATE DATABASE " + gate_fixture.identifier(self.gate_database) + ";",
        )
        self.created_gate_database = True
        parsed = urllib.parse.urlsplit(self.admin_url)
        address = parsed.netloc.rsplit("@", 1)[1]
        reader_url = (
            "postgresql://"
            + urllib.parse.quote(self.reader_login, safe="")
            + ":"
            + urllib.parse.quote(password, safe="")
            + "@"
            + address
            + "/"
            + self.name
        )
        gate_url = (
            "postgresql://"
            + urllib.parse.quote(self.args.postgres_user, safe="")
            + ":"
            + urllib.parse.quote(parsed.password or "", safe="")
            + "@"
            + address
            + "/"
            + self.gate_database
        )
        env = os.environ.copy()
        env.update(
            {
                "RA06C02_ASO_READER_DATABASE_URL": reader_url,
                "RA06C02_ASO_OWNER_DATABASE_URL": self.admin_url,
                "RA06C02_GATE_DATABASE_URL": gate_url,
                "CARGO_TARGET_DIR": "/tmp/ra06c02-gate-target",
            }
        )
        completed, entry = self.run_process(
            "actual_gate_authority_consumer_lifecycle", GATE_CONSUMER_TEST, env
        )
        output = completed.stdout + "\n" + completed.stderr
        assertions = [
            line.strip()
            for line in output.splitlines()
            if re.fullmatch(
                r"authority_consumer_check: [a-z][a-z0-9_]*", line.strip()
            )
        ]
        entry["actual_result_output"] = assertions + [
            line.strip()
            for line in output.splitlines()
            if re.fullmatch(
                r"test authority::postgres::tests::authority_reader_and_cursor_lifecycle "
                r"\.\.\. (ok|FAILED)",
                line.strip(),
            )
        ]
        if completed.returncode != 0:
            entry["failure_output"] = output.splitlines()[-80:]
        self.check(
            "actual_gate_authority_consumer_lifecycle",
            completed.returncode == 0 and len(assertions) == 4,
            return_code=completed.returncode,
            assertion_count=len(assertions),
        )

    def cleanup(self):
        cleanup = self.report["cleanup"]
        if self.created_gate_database:
            result = self.sql(
                "postgres",
                "DROP DATABASE " + gate_fixture.identifier(self.gate_database) + ";",
                False,
            )
            cleanup["disposable_gate_database_deleted"] = {
                "result": "Passed" if result.returncode == 0 else "Failed",
                "return_code": result.returncode,
            }
        if self.created_reader_login:
            result = self.sql(
                "postgres",
                "DROP ROLE " + gate_fixture.identifier(self.reader_login) + ";",
                False,
            )
            cleanup["disposable_authority_reader_login_deleted"] = {
                "result": "Passed" if result.returncode == 0 else "Failed",
                "return_code": result.returncode,
            }
        super().cleanup()


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
            print("Authority migration probe: another fixture is running", file=sys.stderr)
            return 1
        return AuthorityMigrationProbe(args).run()


if __name__ == "__main__":
    sys.exit(main())
