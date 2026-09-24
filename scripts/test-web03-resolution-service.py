#!/usr/bin/env python3
"""Focused actual AppServices/PostgreSQL proof for Web-03 resolution."""

import argparse
import importlib.util
import json
import os
from pathlib import Path
import re
import secrets
import sys
import threading
import time
import urllib.parse
import uuid

import psycopg


ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PROBE = ROOT / "scripts/test-web03-resolution-schema.py"
EVIDENCE = (
    ROOT / ".kbd-orchestrator/phases/runtime-architecture/children/"
    "web-case-to-letter/evidence/web-03-administering-entity-resolution"
)
TEST = [
    os.environ.get("RA06_TOOL_CARGO", "cargo"), "test", "-p", "aso-web-server",
    "adapters::gate::resolution_transaction_tests::administering_entity_resolution_service_lifecycle",
    "--", "--ignored", "--exact", "--nocapture",
]


def load_schema_probe():
    spec = importlib.util.spec_from_file_location("web03_schema_probe", SCHEMA_PROBE)
    if spec is None or spec.loader is None:
        raise RuntimeError("resolution_schema_probe_unavailable")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


schema = load_schema_probe()
schema.base.SOURCE_FILES = schema.base.SOURCE_FILES + (
    "crates/aso-host/src/administering_entity.rs",
    "crates/aso-host/src/ports/mod.rs",
    "crates/aso-web-server/src/adapters/gate/resolution_transaction_tests.rs",
    "crates/aso-server-axum/src/routes/administering_entity.rs",
    "crates/aso-server-axum/src/routes/gate.rs",
    "crates/aso-server-axum/src/lib.rs",
    "web/src/features/administering-entity/api/administering-entity-api.ts",
    "web/src/features/administering-entity/hooks/use-administering-entity-resolution.ts",
    "web/src/features/administering-entity/components/administering-entity-panel.tsx",
    "web/src/features/case-queue/components/case-detail.tsx",
    "scripts/test-web03-resolution-service.py",
)


class ResolutionServiceProbe(schema.ResolutionSchemaProbe):
    def __init__(self, args):
        super().__init__(args)
        self.report["commands"][0] = (
            "python3 scripts/test-web03-resolution-service.py "
            f"--install-mode {self.install_mode} --output {self.output}"
        )

    def actor_context_sql(self):
        principal = self.fixture["principal"]
        practice = self.fixture["practice"]
        return f"""
            SELECT set_config('aso.kratos_identity_id',
                     {schema.base.literal(principal['kratos_identity_id'])},true),
                   set_config('aso.actor_id',
                     {schema.base.literal(principal['id'])},true),
                   set_config('aso.practice_id',
                     {schema.base.literal(practice['id'])},true),
                   set_config('aso.principal','user',true),
                   set_config('aso.session_expires_at','2099-01-01T00:00:00Z',true)
        """

    def wait_until_blocked(self, backend_pid):
        deadline = time.monotonic() + 5
        with psycopg.connect(self.admin_url, autocommit=True) as observer:
            while time.monotonic() < deadline:
                with observer.cursor() as cursor:
                    cursor.execute(
                        "SELECT cardinality(pg_blocking_pids(%s)) > 0",
                        (backend_pid,),
                    )
                    if cursor.fetchone()[0]:
                        return True
                time.sleep(0.05)
        return False

    def exercise_resolution_input_races(
        self, valid_case, valid_rule, valid_case_fixture,
    ):
        original_path = valid_rule["appeal_path_key"]
        first_path = "synthetic-race-after-resolution"
        second_path = "synthetic-race-before-resolution"
        errors = []

        def reset_fixture():
            with psycopg.connect(self.admin_url, autocommit=True) as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        "UPDATE aso.cases SET member_id=%s WHERE id=%s",
                        (valid_case_fixture["member_id"], valid_case),
                    )
                    cursor.execute(
                        "UPDATE aso.plan_delegation_rules "
                        "SET appeal_path_key=%s WHERE id=%s",
                        (original_path, valid_rule["id"]),
                    )
                    cursor.execute(
                        "DELETE FROM aso.administering_entity_resolutions "
                        "WHERE case_id=%s",
                        (valid_case,),
                    )

        reset_fixture()
        gate_key = 903031
        with psycopg.connect(self.admin_url, autocommit=True) as setup:
            with setup.cursor() as cursor:
                cursor.execute(f"""
                    CREATE FUNCTION aso.test_block_resolution_insert()
                    RETURNS trigger LANGUAGE plpgsql AS $test$
                    BEGIN
                      PERFORM pg_advisory_xact_lock({gate_key});
                      RETURN NEW;
                    END;
                    $test$;
                    CREATE TRIGGER test_block_resolution_insert
                      BEFORE INSERT ON aso.administering_entity_resolutions
                      FOR EACH ROW EXECUTE FUNCTION aso.test_block_resolution_insert();
                """)
        first_result = {}
        with (
            psycopg.connect(self.admin_url, autocommit=True) as controller,
            psycopg.connect(self.admin_url) as resolver,
            psycopg.connect(self.admin_url) as mutator,
        ):
            with controller.cursor() as cursor:
                cursor.execute("SELECT pg_advisory_lock(%s)", (gate_key,))
            with resolver.cursor() as cursor:
                cursor.execute("SELECT pg_backend_pid()")
                first_resolver_pid = cursor.fetchone()[0]
            with mutator.cursor() as cursor:
                cursor.execute("SELECT pg_backend_pid()")
                mutator_pid = cursor.fetchone()[0]

            def resolve_before_mutation():
                try:
                    with resolver.cursor() as cursor:
                        cursor.execute("SET LOCAL statement_timeout='10s'")
                        cursor.execute(self.actor_context_sql())
                        cursor.execute(
                            "SELECT aso.resolve_administering_entity_command(%s,%s,"
                            "(SELECT case_input_revision FROM aso.cases WHERE id=%s))",
                            (str(uuid.uuid4()), valid_case, valid_case),
                        )
                        first_result.update(cursor.fetchone()[0])
                    resolver.commit()
                except Exception as error:  # retained only as a safe type name
                    errors.append(type(error).__name__)

            def mutate_after_resolution():
                try:
                    with mutator.cursor() as cursor:
                        cursor.execute("SET LOCAL statement_timeout='10s'")
                        cursor.execute(
                            "UPDATE aso.plan_delegation_rules "
                            "SET appeal_path_key=%s WHERE id=%s",
                            (first_path, valid_rule["id"]),
                        )
                    mutator.commit()
                except Exception as error:  # retained only as a safe type name
                    errors.append(type(error).__name__)

            resolver_thread = threading.Thread(target=resolve_before_mutation)
            resolver_thread.start()
            resolver_reached_insert = self.wait_until_blocked(first_resolver_pid)
            mutation_thread = threading.Thread(target=mutate_after_resolution)
            mutation_thread.start()
            mutation_waited = self.wait_until_blocked(mutator_pid)
            with controller.cursor() as cursor:
                cursor.execute("SELECT pg_advisory_unlock(%s)", (gate_key,))
            resolver_thread.join(timeout=10)
            mutation_thread.join(timeout=10)
            if resolver_thread.is_alive():
                errors.append("first_resolver_thread_timeout")
            if mutation_thread.is_alive():
                errors.append("mutation_thread_timeout")

        with psycopg.connect(self.admin_url, autocommit=True) as setup:
            with setup.cursor() as cursor:
                cursor.execute("""
                    DROP TRIGGER test_block_resolution_insert
                      ON aso.administering_entity_resolutions;
                    DROP FUNCTION aso.test_block_resolution_insert();
                """)

        with psycopg.connect(self.admin_url, autocommit=True) as observer:
            with observer.cursor() as cursor:
                cursor.execute(
                    "SELECT NOT EXISTS(SELECT FROM "
                    "aso.administering_entity_resolutions WHERE case_id=%s)",
                    (valid_case,),
                )
                invalidated_after_first = cursor.fetchone()[0]

        reset_fixture()
        with (
            psycopg.connect(self.admin_url) as mutator,
            psycopg.connect(self.admin_url) as resolver,
        ):
            with mutator.cursor() as cursor:
                cursor.execute("SET LOCAL statement_timeout='10s'")
                cursor.execute(
                    "UPDATE aso.plan_delegation_rules "
                    "SET appeal_path_key=%s WHERE id=%s",
                    (second_path, valid_rule["id"]),
                )
            with resolver.cursor() as cursor:
                cursor.execute("SELECT pg_backend_pid()")
                resolver_pid = cursor.fetchone()[0]
            second_result = {}

            def resolve_after_mutation():
                try:
                    with resolver.cursor() as cursor:
                        cursor.execute("SET LOCAL statement_timeout='10s'")
                        cursor.execute(self.actor_context_sql())
                        cursor.execute(
                            "SELECT aso.resolve_administering_entity_command(%s,%s,"
                            "(SELECT case_input_revision FROM aso.cases WHERE id=%s))",
                            (str(uuid.uuid4()), valid_case, valid_case),
                        )
                        second_result.update(cursor.fetchone()[0])
                    resolver.commit()
                except Exception as error:  # retained only as a safe type name
                    errors.append(type(error).__name__)

            resolver_thread = threading.Thread(target=resolve_after_mutation)
            resolver_thread.start()
            resolver_waited = self.wait_until_blocked(resolver_pid)
            mutator.commit()
            resolver_thread.join(timeout=10)
            if resolver_thread.is_alive():
                errors.append("resolver_thread_timeout")

        with psycopg.connect(self.admin_url, autocommit=True) as observer:
            with observer.cursor() as cursor:
                cursor.execute(
                    "SELECT appeal_path_key FROM "
                    "aso.administering_entity_resolutions WHERE case_id=%s",
                    (valid_case,),
                )
                row = cursor.fetchone()
                persisted_second_path = row[0] if row else None

        self.check(
            "authoritative_input_races_serialize_through_case_lock",
            resolver_reached_insert
            and mutation_waited
            and resolver_waited
            and not errors
            and first_result["state"] == "resolved"
            and invalidated_after_first
            and second_result.get("state") == "resolved"
            and second_result.get("appealPathKey") == second_path
            and persisted_second_path == second_path,
            resolution_first_waited=mutation_waited,
            resolution_first_reached_insert=resolver_reached_insert,
            mutation_first_waited=resolver_waited,
            resolution_first_invalidated=invalidated_after_first,
            mutation_first_path=persisted_second_path,
            safe_error_types=errors,
        )
        reset_fixture()

    def exercise_transaction(self):
        self.mark("seed_resolution_service_fixture")
        self.insert_resolution_fixture()

        if self.args.race_only:
            fixture = self.fixture
            valid_case_fixture = next(
                item for item in fixture["cases"] if item["fixture_id"] == "valid"
            )
            valid_rule = fixture["delegation_rules"][0]
            self.exercise_resolution_input_races(
                valid_case_fixture["id"], valid_rule, valid_case_fixture,
            )
            self.report["scope"] = (
                "Actual PostgreSQL resolution-first and mutation-first "
                "authoritative-input concurrency control"
            )
            self.report["unverified"] = [
                "This race-only control does not replace the retained mounted AppServices, HTTP, browser, fresh-install, or populated-upgrade evidence."
            ]
            return

        password = secrets.token_urlsafe(36)
        self.sql(
            "postgres",
            "CREATE ROLE " + schema.base.identifier(self.login)
            + " LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION "
            + "NOBYPASSRLS PASSWORD " + schema.base.literal(password) + ";",
        )
        self.created_login = True
        self.sql(
            "postgres",
            "GRANT aso_session_reader, aso_gate_executor, aso_case_executor TO "
            + schema.base.identifier(self.login) + ";",
        )
        role_ok = self.sql(self.name, f"""
            SELECT rolcanlogin
              AND NOT (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication)
              AND pg_has_role(oid,'aso_gate_executor','USAGE')
              AND pg_has_role(oid,'aso_case_executor','USAGE')
              AND NOT pg_has_role(oid,'aso_case_owner','MEMBER')
              AND NOT EXISTS(SELECT FROM pg_namespace WHERE nspowner=oid)
              AND NOT EXISTS(SELECT FROM pg_class WHERE relowner=oid)
              FROM pg_roles WHERE rolname={schema.base.literal(self.login)};
        """).stdout.strip()
        self.check("resolution_runtime_login_is_restricted_executor", role_ok == "t")

        expired_label = self.sql(self.name, """
            SELECT label
              FROM aso.administering_entity_resolution_states
             WHERE key='expired';
        """).stdout.strip()
        self.check(
            "expired_resolution_state_label_is_neutral",
            expired_label == "Coverage path expired",
            observed_label=expired_label,
        )

        parsed = urllib.parse.urlsplit(self.admin_url)
        runtime_url = (
            "postgresql://" + self.login + ":" + urllib.parse.quote(password, safe="")
            + "@" + parsed.netloc.rsplit("@", 1)[1] + parsed.path
        )
        fixture = self.fixture
        cases = {item["fixture_id"]: item["id"] for item in fixture["cases"]}
        env = os.environ.copy()
        env.pop("ASO_MIGRATION_DATABASE_URL", None)
        env.pop("ASO_DATABASE_URL", None)
        env.update({
            "ASO_TEST_RESOLUTION_DATABASE_URL": runtime_url,
            "ASO_TEST_RESOLUTION_CONTEXT": json.dumps({
                "identity_id": fixture["principal"]["kratos_identity_id"],
                "actor_id": fixture["principal"]["id"],
                "practice_id": fixture["practice"]["id"],
            }),
            "ASO_TEST_RESOLUTION_CASES": json.dumps(cases),
            "RUSTUP_TOOLCHAIN": "1.98.1",
        })
        completed, entry = self.run_process("actual_resolution_service_lifecycle", TEST, env)
        output = completed.stdout + "\n" + completed.stderr
        safe_lines = [
            line.strip() for line in output.splitlines()
            if re.fullmatch(r"resolution_transaction_check: [a-z][a-z0-9_]*", line.strip())
            or re.fullmatch(
                r"test [a-zA-Z0-9_:]*administering_entity_resolution_service_lifecycle \.\.\. (ok|FAILED)",
                line.strip(),
            )
            or re.fullmatch(
                r"test result: (ok|FAILED)\. \d+ passed; \d+ failed; \d+ ignored; "
                r"\d+ measured; \d+ filtered out; finished in [0-9.]+s",
                line.strip(),
            )
        ]
        entry["actual_result_output"] = safe_lines
        if completed.returncode != 0:
            entry["failure_type"] = "resolution_service_test_failed"
            entry["safe_failure_output"] = [
                line.strip() for line in output.splitlines()
                if "resolution failed:" in line
                or "assertion `left == right` failed" in line
                or re.fullmatch(r"left: (Resolved|Missing|Ambiguous|Conflicting|Expired|[0-9]+)", line.strip())
                or re.fullmatch(r"right: (Resolved|Missing|Ambiguous|Conflicting|Expired|[0-9]+)", line.strip())
            ][-12:]
            diagnostic_case = cases["valid"]
            diagnostic_revision = self.sql(
                self.name,
                "SELECT case_input_revision FROM aso.cases WHERE id="
                + schema.base.literal(diagnostic_case) + ";",
            ).stdout.strip()
            diagnostic = self.sql(self.name, f"""
                \\set VERBOSITY verbose
                BEGIN;
                SELECT set_config('aso.kratos_identity_id',
                         {schema.base.literal(fixture['principal']['kratos_identity_id'])},true),
                       set_config('aso.actor_id',
                         {schema.base.literal(fixture['principal']['id'])},true),
                       set_config('aso.practice_id',
                         {schema.base.literal(fixture['practice']['id'])},true),
                       set_config('aso.principal','user',true),
                       set_config('aso.session_expires_at','2099-01-01T00:00:00Z',true);
                SELECT aso.resolve_administering_entity_command(
                  {schema.base.literal(str(uuid.uuid4()))},
                  {schema.base.literal(diagnostic_case)},
                  {int(diagnostic_revision)});
                ROLLBACK;
            """, require_success=False)
            entry["database_error"] = [
                line.strip() for line in diagnostic.stderr.splitlines()
                if line.startswith("ERROR:") or line.startswith("CONTEXT:")
            ][-6:]
        assertions = [line for line in safe_lines if line.startswith("resolution_transaction_check: ")]
        self.check(
            "actual_appservices_pg_resolution_lifecycle",
            completed.returncode == 0
            and any("administering_entity_resolution_service_lifecycle ... ok" in line for line in safe_lines)
            and len(assertions) == 4,
            return_code=completed.returncode,
            assertion_count=len(assertions),
        )

        valid_case = cases["valid"]
        valid_case_fixture = next(
            item for item in fixture["cases"] if item["fixture_id"] == "valid"
        )
        valid_rule = fixture["delegation_rules"][0]
        valid_entity = fixture["administering_entities"][0]
        source_document = fixture["source_document"]
        invalidation_checks = []
        invalidation_checks.append(self.sql(self.name, f"""
            BEGIN;
            SET LOCAL search_path=aso,public;
            SELECT set_config('aso.kratos_identity_id',
                     {schema.base.literal(fixture['principal']['kratos_identity_id'])},true),
                   set_config('aso.actor_id',
                     {schema.base.literal(fixture['principal']['id'])},true),
                   set_config('aso.practice_id',
                     {schema.base.literal(fixture['practice']['id'])},true),
                   set_config('aso.principal','user',true),
                   set_config('aso.session_expires_at','2099-01-01T00:00:00Z',true);
            UPDATE aso.cases
               SET member_id={schema.base.literal(valid_case_fixture['member_id'])}
             WHERE id={schema.base.literal(valid_case)};
            DO $check$
            DECLARE prior_revision bigint;
            DECLARE initial_result jsonb;
            DECLARE inactive_result jsonb;
            BEGIN
              initial_result := aso.resolve_administering_entity_command(
                {schema.base.literal(str(uuid.uuid4()))},
                {schema.base.literal(valid_case)},
                (SELECT case_input_revision FROM aso.cases
                  WHERE id={schema.base.literal(valid_case)}));
              IF initial_result->>'state' <> 'resolved' THEN
                RAISE EXCEPTION 'entity fixture was not resolved before deactivation';
              END IF;
              SELECT resolution_revision INTO STRICT prior_revision
                FROM aso.cases WHERE id={schema.base.literal(valid_case)};
              UPDATE aso.administering_entities SET active=false
               WHERE id={schema.base.literal(valid_entity['id'])};
              IF EXISTS (
                SELECT FROM aso.administering_entity_resolutions
                 WHERE case_id={schema.base.literal(valid_case)}
              ) OR (SELECT resolution_revision FROM aso.cases
                     WHERE id={schema.base.literal(valid_case)}) <> prior_revision + 1 THEN
                RAISE EXCEPTION 'entity change did not invalidate resolution';
              END IF;
              inactive_result := aso.resolve_administering_entity_command(
                {schema.base.literal(str(uuid.uuid4()))},
                {schema.base.literal(valid_case)},
                (SELECT case_input_revision FROM aso.cases
                  WHERE id={schema.base.literal(valid_case)}));
              IF inactive_result->>'state' <> 'missing' THEN
                RAISE EXCEPTION 'inactive entity was misclassified as %',
                  inactive_result->>'state';
              END IF;
            END;
            $check$;
            ROLLBACK;
        """, require_success=False))
        invalidation_checks.append(self.sql(self.name, f"""
            BEGIN;
            DO $check$
            DECLARE prior_revision bigint;
            BEGIN
              SELECT resolution_revision INTO STRICT prior_revision
                FROM aso.cases WHERE id={schema.base.literal(valid_case)};
              UPDATE aso.plan_delegation_rules
                 SET appeal_path_key='synthetic-revised-appeal'
               WHERE id={schema.base.literal(valid_rule['id'])};
              IF EXISTS (
                SELECT FROM aso.administering_entity_resolutions
                 WHERE case_id={schema.base.literal(valid_case)}
              ) OR (SELECT resolution_revision FROM aso.cases
                     WHERE id={schema.base.literal(valid_case)}) <> prior_revision + 1 THEN
                RAISE EXCEPTION 'delegation change did not invalidate resolution';
              END IF;
            END;
            $check$;
            ROLLBACK;
        """, require_success=False))
        invalidation_checks.append(self.sql(self.name, f"""
            BEGIN;
            DO $check$
            DECLARE prior_revision bigint;
            BEGIN
              SELECT resolution_revision INTO STRICT prior_revision
                FROM aso.cases WHERE id={schema.base.literal(valid_case)};
              INSERT INTO aso.plan_delegation_rules(
                id,practice_id,payer_plan_id,procedure_code,
                administering_entity_id,criteria_set_key,
                submission_channel_key,appeal_path_key,source_document_id,
                valid_from,valid_to)
              VALUES (
                '23000000-0000-4000-8000-000000000399',
                {schema.base.literal(fixture['practice']['id'])},
                {schema.base.literal(valid_rule['payer_plan_id'])},
                {schema.base.literal(valid_rule['procedure_code'])},
                {schema.base.literal(valid_rule['administering_entity_id'])},
                'synthetic-conflict-added', 'manual_synthetic',
                'synthetic-conflict-appeal',
                {schema.base.literal(valid_rule['source_document_id'])},
                {schema.base.literal(valid_rule['valid_from'])}, NULL);
              IF EXISTS (
                SELECT FROM aso.administering_entity_resolutions
                 WHERE case_id={schema.base.literal(valid_case)}
              ) OR (SELECT resolution_revision FROM aso.cases
                     WHERE id={schema.base.literal(valid_case)}) <> prior_revision + 1 THEN
                RAISE EXCEPTION 'conflicting rule insert did not invalidate resolution';
              END IF;
            END;
            $check$;
            ROLLBACK;
        """, require_success=False))
        invalidation_checks.append(self.sql(self.name, f"""
            BEGIN;
            SET LOCAL search_path=aso,public;
            SELECT set_config('aso.kratos_identity_id',
                     {schema.base.literal(fixture['principal']['kratos_identity_id'])},true),
                   set_config('aso.actor_id',
                     {schema.base.literal(fixture['principal']['id'])},true),
                   set_config('aso.practice_id',
                     {schema.base.literal(fixture['practice']['id'])},true),
                   set_config('aso.principal','user',true),
                   set_config('aso.session_expires_at','2099-01-01T00:00:00Z',true);
            UPDATE aso.cases
               SET member_id={schema.base.literal(valid_case_fixture['member_id'])}
             WHERE id={schema.base.literal(valid_case)};
            SELECT aso.resolve_administering_entity_command(
              {schema.base.literal(str(uuid.uuid4()))},
              {schema.base.literal(valid_case)},
              (SELECT case_input_revision FROM aso.cases
                WHERE id={schema.base.literal(valid_case)}));
            DO $check$
            DECLARE prior_revision bigint;
            BEGIN
              SELECT resolution_revision INTO STRICT prior_revision
                FROM aso.cases WHERE id={schema.base.literal(valid_case)};
              UPDATE aso.documents
                 SET document_version=document_version + 1
               WHERE id={schema.base.literal(source_document['id'])};
              IF EXISTS (
                SELECT FROM aso.administering_entity_resolutions
                 WHERE case_id={schema.base.literal(valid_case)}
              ) OR (SELECT resolution_revision FROM aso.cases
                     WHERE id={schema.base.literal(valid_case)}) <> prior_revision + 1 THEN
                RAISE EXCEPTION 'source document version change did not invalidate resolution';
              END IF;
            END;
            $check$;
            ROLLBACK;
        """, require_success=False))
        self.check(
            "authoritative_resolver_changes_invalidate_current_resolution",
            all(result.returncode == 0 for result in invalidation_checks),
            scenarios=[
                "entity_deactivation", "path_edit", "conflicting_rule_insert",
                "source_document_version",
            ],
            return_codes=[result.returncode for result in invalidation_checks],
            database_errors=[
                line.strip()
                for result in invalidation_checks
                for line in result.stderr.splitlines()
                if line.startswith("ERROR:") or line.startswith("CONTEXT:")
            ],
        )

        valid_plan = next(
            plan for plan in fixture["plans"]
            if plan["id"] == valid_rule["payer_plan_id"]
        )
        future_checks = []
        future_mutations = (
            (
                "plan",
                "UPDATE aso.payer_plans SET valid_from=date '2027-01-01' "
                f"WHERE id={schema.base.literal(valid_plan['id'])}",
            ),
            (
                "enrollment",
                "UPDATE aso.payer_plan_enrollments "
                "SET valid_from=date '2027-01-01', valid_to=NULL "
                f"WHERE payer_plan_id={schema.base.literal(valid_plan['id'])} "
                f"AND member_id={schema.base.literal(valid_case_fixture['member_id'])}",
            ),
            (
                "rule",
                "UPDATE aso.plan_delegation_rules SET valid_from=date '2027-01-01' "
                f"WHERE id={schema.base.literal(valid_rule['id'])}",
            ),
        )
        for label, mutation in future_mutations:
            future_checks.append(self.sql(self.name, f"""
                BEGIN;
                SET LOCAL search_path=aso,public;
                {self.actor_context_sql()};
                UPDATE aso.cases
                   SET member_id={schema.base.literal(valid_case_fixture['member_id'])}
                 WHERE id={schema.base.literal(valid_case)};
                {mutation};
                DO $check$
                DECLARE observed jsonb;
                BEGIN
                  observed := aso.resolve_administering_entity_command(
                    {schema.base.literal(str(uuid.uuid4()))},
                    {schema.base.literal(valid_case)},
                    (SELECT case_input_revision FROM aso.cases
                      WHERE id={schema.base.literal(valid_case)}));
                  IF observed->>'state' <> 'missing' THEN
                    RAISE EXCEPTION 'future {label} was misclassified as %',
                      observed->>'state';
                  END IF;
                END;
                $check$;
                ROLLBACK;
            """, require_success=False))
        self.check(
            "future_effective_paths_are_missing_not_expired",
            all(result.returncode == 0 for result in future_checks),
            scenarios=["future_plan", "future_enrollment", "future_rule"],
            return_codes=[result.returncode for result in future_checks],
            database_errors=[
                line.strip()
                for result in future_checks
                for line in result.stderr.splitlines()
                if line.startswith("ERROR:") or line.startswith("CONTEXT:")
            ],
        )

        disjoint_history = self.sql(self.name, f"""
            BEGIN;
            SET LOCAL search_path=aso,public;
            {self.actor_context_sql()};
            UPDATE aso.cases
               SET member_id={schema.base.literal(valid_case_fixture['member_id'])}
             WHERE id={schema.base.literal(valid_case)};
            UPDATE aso.payer_plans
               SET valid_from=date '2026-01-01', valid_to=date '2026-02-01'
             WHERE id={schema.base.literal(valid_plan['id'])};
            UPDATE aso.payer_plan_enrollments
               SET valid_from=date '2026-03-01', valid_to=date '2026-04-01'
             WHERE payer_plan_id={schema.base.literal(valid_plan['id'])}
               AND member_id={schema.base.literal(valid_case_fixture['member_id'])};
            UPDATE aso.plan_delegation_rules
               SET valid_from=date '2026-01-01', valid_to=date '2026-12-31'
             WHERE id={schema.base.literal(valid_rule['id'])};
            DO $check$
            DECLARE observed jsonb;
            BEGIN
              observed := aso.resolve_administering_entity_command(
                {schema.base.literal(str(uuid.uuid4()))},
                {schema.base.literal(valid_case)},
                (SELECT case_input_revision FROM aso.cases
                  WHERE id={schema.base.literal(valid_case)}));
              IF observed->>'state' <> 'missing' THEN
                RAISE EXCEPTION 'disjoint historical windows were misclassified as %',
                  observed->>'state';
              END IF;
            END;
            $check$;
            ROLLBACK;
        """, require_success=False)
        self.check(
            "disjoint_historical_windows_are_missing_not_expired",
            disjoint_history.returncode == 0,
            return_code=disjoint_history.returncode,
            database_errors=[
                line.strip() for line in disjoint_history.stderr.splitlines()
                if line.startswith("ERROR:") or line.startswith("CONTEXT:")
            ],
        )

        expired_component_checks = []
        expired_mutations = (
            (
                "plan",
                "UPDATE aso.payer_plans "
                "SET valid_from=date '2026-01-01', valid_to=date '2026-04-01' "
                f"WHERE id={schema.base.literal(valid_plan['id'])}",
            ),
            (
                "enrollment",
                "UPDATE aso.payer_plan_enrollments "
                "SET valid_from=date '2026-01-01', valid_to=date '2026-04-01' "
                f"WHERE payer_plan_id={schema.base.literal(valid_plan['id'])} "
                f"AND member_id={schema.base.literal(valid_case_fixture['member_id'])}",
            ),
        )
        for label, mutation in expired_mutations:
            expired_component_checks.append(self.sql(self.name, f"""
                BEGIN;
                SET LOCAL search_path=aso,public;
                {self.actor_context_sql()};
                UPDATE aso.cases
                   SET member_id={schema.base.literal(valid_case_fixture['member_id'])}
                 WHERE id={schema.base.literal(valid_case)};
                UPDATE aso.payer_plans
                   SET valid_from=date '2026-01-01', valid_to=NULL
                 WHERE id={schema.base.literal(valid_plan['id'])};
                UPDATE aso.payer_plan_enrollments
                   SET valid_from=date '2026-01-01', valid_to=NULL
                 WHERE payer_plan_id={schema.base.literal(valid_plan['id'])}
                   AND member_id={schema.base.literal(valid_case_fixture['member_id'])};
                UPDATE aso.plan_delegation_rules
                   SET valid_from=date '2026-01-01', valid_to=NULL
                 WHERE id={schema.base.literal(valid_rule['id'])};
                {mutation};
                DO $check$
                DECLARE observed jsonb;
                BEGIN
                  observed := aso.resolve_administering_entity_command(
                    {schema.base.literal(str(uuid.uuid4()))},
                    {schema.base.literal(valid_case)},
                    (SELECT case_input_revision FROM aso.cases
                      WHERE id={schema.base.literal(valid_case)}));
                  IF observed->>'state' <> 'expired' THEN
                    RAISE EXCEPTION 'ended {label} was misclassified as %',
                      observed->>'state';
                  END IF;
                END;
                $check$;
                ROLLBACK;
            """, require_success=False))
        self.check(
            "ended_plan_or_enrollment_is_expired_coverage_path",
            all(result.returncode == 0 for result in expired_component_checks),
            scenarios=["plan_ended_first", "enrollment_ended_first"],
            return_codes=[result.returncode for result in expired_component_checks],
            database_errors=[
                line.strip()
                for result in expired_component_checks
                for line in result.stderr.splitlines()
                if line.startswith("ERROR:") or line.startswith("CONTEXT:")
            ],
        )

        principal = fixture["principal"]
        retry_target = self.sql(self.name, f"""
            SELECT command_id::text || '|' || case_id::text || '|' ||
                   (payload->>'expectedCaseInputRevision')
              FROM aso.administering_entity_resolution_commands
             WHERE kratos_identity_id={schema.base.literal(principal['kratos_identity_id'])}
             ORDER BY committed_at, command_id
             LIMIT 1;
        """).stdout.strip().split("|")
        if len(retry_target) != 3:
            raise AssertionError("resolution_retry_fixture_missing")
        command_id, case_id, expected_revision = retry_target
        unauthorized_retry = self.sql(self.name, f"""
            \\set VERBOSITY verbose
            BEGIN;
            ALTER TABLE aso.cases
              DISABLE TRIGGER cases_clinical_practice_immutable;
            DELETE FROM aso.administering_entity_resolutions
             WHERE case_id={schema.base.literal(case_id)};
            UPDATE aso.cases SET practice_id={schema.base.literal(self.foreign)}
             WHERE id={schema.base.literal(case_id)};
            SELECT set_config('aso.kratos_identity_id',
                     {schema.base.literal(principal['kratos_identity_id'])},true),
                   set_config('aso.actor_id',
                     {schema.base.literal(principal['id'])},true),
                   set_config('aso.practice_id',
                     {schema.base.literal(fixture['practice']['id'])},true),
                   set_config('aso.principal','user',true),
                   set_config('aso.session_expires_at','2099-01-01T00:00:00Z',true);
            SELECT aso.resolve_administering_entity_command(
              {schema.base.literal(command_id)}, {schema.base.literal(case_id)},
              {int(expected_revision)});
            ROLLBACK;
        """, require_success=False)
        observed_sqlstates = re.findall(
            r"ERROR:\s+([0-9A-Z]{5}):", unauthorized_retry.stderr,
        )
        self.check(
            "idempotent_retry_reauthorizes_case_target",
            unauthorized_retry.returncode != 0 and "42501" in observed_sqlstates,
            expected_sqlstate="42501",
            return_code=unauthorized_retry.returncode,
            observed_sqlstates=observed_sqlstates,
            database_errors=[
                line.strip() for line in unauthorized_retry.stderr.splitlines()
                if line.startswith("ERROR:") or line.startswith("CONTEXT:")
            ][-4:],
        )

        durable = json.loads(self.sql(self.name, """
            SELECT jsonb_build_object(
              'receipts',(SELECT count(*) FROM aso.administering_entity_resolution_commands),
              'resolutions',(SELECT count(*) FROM aso.administering_entity_resolutions),
              'audits',(SELECT count(*) FROM aso.audit_events
                WHERE action='administering_entity.resolve'),
              'localPublished',EXISTS(
                SELECT FROM pg_publication_rel
                WHERE prrelid='aso.administering_entity_resolution_commands'::regclass),
              'executorDirectWrite',has_table_privilege(
                'aso_case_executor','aso.administering_entity_resolutions','INSERT,UPDATE,DELETE'),
              'ownerMaintainsInputs',
                has_table_privilege('aso_case_owner','aso.administering_entities','MAINTAIN')
                AND has_table_privilege('aso_case_owner','aso.payer_plans','MAINTAIN')
                AND has_table_privilege('aso_case_owner','aso.payer_plan_enrollments','MAINTAIN')
                AND has_table_privilege('aso_case_owner','aso.plan_delegation_rules','MAINTAIN')
                AND has_table_privilege('aso_case_owner','aso.documents','MAINTAIN'),
              'executorMaintainsInputs',
                has_table_privilege('aso_case_executor','aso.administering_entities','MAINTAIN')
                OR has_table_privilege('aso_case_executor','aso.payer_plans','MAINTAIN')
                OR has_table_privilege('aso_case_executor','aso.payer_plan_enrollments','MAINTAIN')
                OR has_table_privilege('aso_case_executor','aso.plan_delegation_rules','MAINTAIN')
                OR has_table_privilege('aso_case_executor','aso.documents','MAINTAIN'),
              'migrationRecorded',EXISTS(
                SELECT FROM public._sqlx_migrations
                WHERE version=2026090619 AND success))::text;
        """).stdout.strip())
        self.check(
            "durable_receipts_audits_and_least_privilege_boundary",
            durable == {
                "receipts": 6,
                "resolutions": 5,
                "audits": 6,
                "localPublished": False,
                "executorDirectWrite": False,
                "ownerMaintainsInputs": True,
                "executorMaintainsInputs": False,
                "migrationRecorded": True,
            },
            observed=durable,
        )
        self.exercise_resolution_input_races(
            valid_case, valid_rule, valid_case_fixture,
        )
        self.report["scope"] = (
            "Actual mounted Axum HTTP, shell-neutral AppServices resolver, and restricted "
            "PostgreSQL adapter, including all named states, idempotency, reload, exact "
            "lookup, tenant refusal, invalidation, and durable audit"
        )
        self.report["unverified"] = [
            "The responsive React panel has focused component and scoped-Zustand tests; the complete actual-browser scenario remains Web-17.",
            "Tauri and mobile remain deferred until Web-17 passes.",
        ]


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--postgres-user", default="flint")
    parser.add_argument("--postgres-port", type=int)
    parser.add_argument("--command-seconds", type=int, default=600)
    parser.add_argument("--install-mode", choices=("fresh", "upgrade"), required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--race-only", action="store_true")
    return parser.parse_args()


def main():
    args = parse_args()
    lock_path = Path("/tmp/aso-web03-resolution-service.lock")
    with open(lock_path, "a") as lock:
        import fcntl
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("Web-03 resolution service probe: another fixture is running", file=sys.stderr)
            return 1
        return ResolutionServiceProbe(args).run()


if __name__ == "__main__":
    sys.exit(main())
