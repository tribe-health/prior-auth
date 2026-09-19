#!/usr/bin/env python3
"""Focused PostgreSQL proof for Web-03 plan and delegation schema."""

import argparse
import datetime
import importlib.util
import json
from pathlib import Path
import sys
import uuid


ROOT = Path(__file__).resolve().parents[1]
BASE_PROBE = ROOT / "scripts/test-gate-transaction.py"
FIXTURE_PATH = ROOT / "docs/architecture/fixtures/web-case-to-letter/fixture-manifest.json"
EXPECTED_PATH = ROOT / "docs/architecture/fixtures/web-case-to-letter/expected-output-manifest.json"
EVIDENCE = (
    ROOT
    / ".kbd-orchestrator/phases/runtime-architecture/children/"
    "web-case-to-letter/evidence/web-03-administering-entity-resolution"
)


def load_base_probe():
    spec = importlib.util.spec_from_file_location("web03_gate_probe", BASE_PROBE)
    if spec is None or spec.loader is None:
        raise RuntimeError("gate_probe_unavailable")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


base = load_base_probe()
base.SOURCE_FILES = base.SOURCE_FILES + (
    "migrations/server/2026090617_durable_case_commands.sql",
    "migrations/server/2026090618_administering_entity_resolution_schema.sql",
    "migrations/server/2026090619_administering_entity_resolution_commands.sql",
    "crates/aso-web-server/src/migrations.rs",
    "docs/design/schema/schema-web-case-to-letter.sql",
    "docs/architecture/fixtures/web-case-to-letter/fixture-manifest.json",
    "docs/architecture/fixtures/web-case-to-letter/expected-output-manifest.json",
    "docs/architecture/fixtures/web-case-to-letter/manifest-lock.json",
    "docs/architecture/fixtures/web-case-to-letter/verify.py",
    "scripts/test-web03-resolution-schema.py",
)


class ResolutionSchemaProbe(base.Probe):
    def __init__(self, args):
        super().__init__(args)
        self.output = Path(args.output)
        self.fixture = json.loads(FIXTURE_PATH.read_text())["administering_entity_resolution_fixture"]
        expected = json.loads(EXPECTED_PATH.read_text())["administering_entity_resolution_fixture"]
        self.expected = {item["fixture_id"]: item for item in expected["outcomes"]}
        self.report.update({
            "observed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "scope": (
                "Web-03 additive plan/delegation schema, deterministic valid, "
                "missing, ambiguous, conflicting, and expired records, tenant "
                "source integrity, publication exclusion, and direct-write refusal"
            ),
            "commands": [
                "python3 scripts/test-web03-resolution-schema.py "
                f"--install-mode {self.install_mode} --output {self.output}",
                "cargo run -p aso-web-server -- --migrate-server",
            ],
            "unverified": [
                "Resolver AppServices, mounted HTTP, React UI, actual browser, Tauri, and mobile are outside Web-03 task 1.2."
            ],
        })

    def sqlstate_refused(self, label, statement, expected_state):
        wrapped = f"""
        DO $expected$
        BEGIN
          {statement}
          RAISE EXCEPTION 'expected refusal was not observed' USING ERRCODE='P0001';
        EXCEPTION WHEN SQLSTATE '{expected_state}' THEN
          NULL;
        END;
        $expected$;
        """
        result = self.sql(self.name, wrapped, require_success=False)
        self.check(label, result.returncode == 0, expected_sqlstate=expected_state)

    def insert_resolution_fixture(self):
        fixture = self.fixture
        practice = fixture["practice"]
        principal = fixture["principal"]
        payer = fixture["payer"]
        patient = fixture["patient"]
        source = fixture["source_document"]

        self.mark("seed_resolution_practice_principal_payer_patient")
        self.sql(self.name, f"""
            INSERT INTO aso.practices(id,name,key) VALUES (
              {base.literal(practice['id'])}, {base.literal(practice['name'])},
              'synthetic-resolution-practice');
            INSERT INTO aso.users(
              id,kratos_identity_id,practice_id,email,full_name)
            VALUES (
              {base.literal(principal['id'])},
              {base.literal(principal['kratos_identity_id'])},
              {base.literal(practice['id'])},
              {base.literal(principal['email'])},
              {base.literal(principal['display_name'])});
            INSERT INTO aso.user_roles(user_id,role_id,practice_id)
            SELECT {base.literal(principal['id'])},id,{base.literal(practice['id'])}
              FROM aso.roles WHERE key={base.literal(principal['role'])};
            INSERT INTO aso.payers(id,name,key) VALUES (
              {base.literal(payer['id'])}, {base.literal(payer['name'])},
              {base.literal(payer['key'])});
            INSERT INTO aso.patients(
              id,practice_id,family_name,given_name,birth_date)
            VALUES (
              {base.literal(patient['id'])}, {base.literal(practice['id'])},
              {base.literal(patient['family_name'])},
              {base.literal(patient['given_name'])},
              {base.literal(patient['birth_date'])});
        """)

        self.mark("seed_resolution_cases")
        for case in fixture["cases"]:
            self.sql(self.name, f"""
                INSERT INTO aso.cases(
                  id,practice_id,patient_id,surgeon_id,payer_id,case_number,
                  member_id,date_of_service,procedure_code,plan_key)
                VALUES (
                  {base.literal(case['id'])}, {base.literal(practice['id'])},
                  {base.literal(patient['id'])}, {base.literal(principal['id'])},
                  {base.literal(payer['id'])}, {base.literal(case['case_number'])},
                  {base.literal(case['member_id'])},
                  {base.literal(case['date_of_service'])},
                  {base.literal(case['procedure_code'])},
                  {base.literal(case['plan_key'])});
            """)

        self.mark("seed_resolution_source_document")
        source_insert = self.sql(self.name, f"""
            SET search_path=aso,public;
            INSERT INTO aso.documents(
              id,document_type_id,patient_id,name,effective_date,
              document_version,page_count,ingest_method)
            SELECT {base.literal(source['id'])}, id,
                   {base.literal(source['patient_id'])}, {base.literal(source['name'])},
                   {base.literal(source['effective_date'])},
                   {source['document_version']}, {source['page_count']}, 'manual_upload'
              FROM aso.document_types WHERE key={base.literal(source['document_type'])};
        """, require_success=False)
        self.check(
            "resolution_source_document_seeded",
            source_insert.returncode == 0,
            database_error=[
                line for line in source_insert.stderr.splitlines()
                if "ERROR:" in line or "DETAIL:" in line
            ][-3:],
        )

        self.mark("seed_resolution_entities")
        for entity in fixture["administering_entities"]:
            self.sql(self.name, f"""
                INSERT INTO aso.administering_entities(
                  id,practice_id,key,name)
                VALUES (
                  {base.literal(entity['id'])}, {base.literal(practice['id'])},
                  {base.literal(entity['key'])}, {base.literal(entity['name'])});
            """)
        self.mark("seed_resolution_plans")
        for plan in fixture["plans"]:
            valid_to = "NULL" if plan["valid_to"] is None else base.literal(plan["valid_to"])
            self.sql(self.name, f"""
                INSERT INTO aso.payer_plans(
                  id,practice_id,payer_id,plan_key,name,valid_from,valid_to)
                VALUES (
                  {base.literal(plan['id'])}, {base.literal(practice['id'])},
                  {base.literal(payer['id'])}, {base.literal(plan['plan_key'])},
                  {base.literal(plan['name'])}, {base.literal(plan['valid_from'])},
                  {valid_to});
            """)
        self.mark("seed_resolution_member_plan_enrollments")
        plans_by_key = {plan["plan_key"]: plan for plan in fixture["plans"]}
        for case in fixture["cases"]:
            plan = plans_by_key[case["plan_key"]]
            enrollment_id = str(uuid.uuid5(uuid.UUID(plan["id"]), case["member_id"]))
            enrollment_valid_from = case.get("enrollment_valid_from", plan["valid_from"])
            enrollment_valid_to = case.get("enrollment_valid_to", plan["valid_to"])
            valid_to = (
                "NULL" if enrollment_valid_to is None
                else base.literal(enrollment_valid_to)
            )
            self.sql(self.name, f"""
                INSERT INTO aso.payer_plan_enrollments(
                  id,practice_id,payer_plan_id,member_id,source_document_id,
                  valid_from,valid_to)
                VALUES (
                  {base.literal(enrollment_id)}, {base.literal(practice['id'])},
                  {base.literal(plan['id'])}, {base.literal(case['member_id'])},
                  {base.literal(source['id'])}, {base.literal(enrollment_valid_from)},
                  {valid_to});
            """)
        self.mark("seed_resolution_delegation_rules")
        for rule in fixture["delegation_rules"]:
            valid_to = "NULL" if rule["valid_to"] is None else base.literal(rule["valid_to"])
            self.sql(self.name, f"""
                INSERT INTO aso.plan_delegation_rules(
                  id,practice_id,payer_plan_id,procedure_code,
                  administering_entity_id,criteria_set_key,
                  submission_channel_key,appeal_path_key,source_document_id,
                  valid_from,valid_to)
                VALUES (
                  {base.literal(rule['id'])}, {base.literal(practice['id'])},
                  {base.literal(rule['payer_plan_id'])},
                  {base.literal(rule['procedure_code'])},
                  {base.literal(rule['administering_entity_id'])},
                  {base.literal(rule['criteria_set_key'])},
                  {base.literal(rule['submission_channel_key'])},
                  {base.literal(rule['appeal_path_key'])},
                  {base.literal(rule['source_document_id'])},
                  {base.literal(rule['valid_from'])}, {valid_to});
            """)

    def database_candidates(self, case):
        text = self.sql(self.name, f"""
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
              'id',rule.id,
              'administering_entity_id',rule.administering_entity_id,
              'criteria_set_key',rule.criteria_set_key,
              'submission_channel_key',rule.submission_channel_key,
              'appeal_path_key',rule.appeal_path_key,
              'source_document_id',rule.source_document_id,
              'valid_from',GREATEST(plan.valid_from,enrollment.valid_from,rule.valid_from),
              'valid_to',(SELECT min(value) FROM unnest(ARRAY[
                plan.valid_to,enrollment.valid_to,rule.valid_to
              ]) AS value WHERE value IS NOT NULL),
              'expired',
                GREATEST(plan.valid_from,enrollment.valid_from,rule.valid_from)
                  <= clinical_case.date_of_service
                AND (SELECT min(value) FROM unnest(ARRAY[
                  plan.valid_to,enrollment.valid_to,rule.valid_to
                ]) AS value WHERE value IS NOT NULL)
                  <= clinical_case.date_of_service,
              'active',
                plan.valid_from <= clinical_case.date_of_service
                AND (plan.valid_to IS NULL OR clinical_case.date_of_service < plan.valid_to)
                AND enrollment.valid_from <= clinical_case.date_of_service
                AND (enrollment.valid_to IS NULL OR clinical_case.date_of_service < enrollment.valid_to)
                AND rule.valid_from <= clinical_case.date_of_service
                AND (rule.valid_to IS NULL OR clinical_case.date_of_service < rule.valid_to)
            ) ORDER BY rule.id), '[]'::jsonb)::text
              FROM aso.cases clinical_case
              JOIN aso.payer_plans plan
                ON plan.practice_id=clinical_case.practice_id
               AND plan.payer_id=clinical_case.payer_id
               AND plan.plan_key=clinical_case.plan_key
              JOIN aso.payer_plan_enrollments enrollment
                ON enrollment.practice_id=clinical_case.practice_id
               AND enrollment.payer_plan_id=plan.id
               AND enrollment.member_id=clinical_case.member_id
              JOIN aso.plan_delegation_rules rule
                ON rule.practice_id=clinical_case.practice_id
               AND rule.payer_plan_id=plan.id
               AND rule.procedure_code=clinical_case.procedure_code
             WHERE clinical_case.id={base.literal(case['id'])};
        """).stdout.strip()
        return json.loads(text)

    @staticmethod
    def classify(candidates):
        active = [item for item in candidates if item["active"]]
        if len(active) == 1:
            return "resolved", active
        if not active:
            return (
                "expired" if any(item["expired"] for item in candidates) else "missing"
            ), active
        if len({item["administering_entity_id"] for item in active}) > 1:
            return "ambiguous", active
        return "conflicting", active

    def persist_fixture_outcomes(self, observed):
        fixture = self.fixture
        practice_id = fixture["practice"]["id"]
        for case in fixture["cases"]:
            outcome = self.expected[case["fixture_id"]]
            if outcome["state"] == "resolved":
                self.sql(self.name, f"""
                    INSERT INTO aso.administering_entity_resolutions(
                      case_id,practice_id,entity_id,criteria_set_key,
                      submission_channel_key,appeal_path_key,source_document_id,
                      entity_revision,plan_revision,enrollment_revision,
                      rule_revision,source_document_version,
                      valid_from,valid_to,state,revision,case_input_revision,
                      matched_rule_id)
                    VALUES (
                      {base.literal(case['id'])}, {base.literal(practice_id)},
                      {base.literal(outcome['entity_id'])},
                      {base.literal(outcome['criteria_set_key'])},
                      {base.literal(outcome['submission_channel_key'])},
                      {base.literal(outcome['appeal_path_key'])},
                      {base.literal(outcome['source_document_id'])},
                      1, 1, 1, 1, 1,
                      {base.literal(outcome['valid_from'])}, NULL, 'resolved', 1, 1,
                      {base.literal(outcome['matched_rule_id'])});
                """)
            else:
                self.sql(self.name, f"""
                    INSERT INTO aso.administering_entity_resolutions(
                      case_id,practice_id,state,revision,case_input_revision)
                    VALUES (
                      {base.literal(case['id'])}, {base.literal(practice_id)},
                      {base.literal(outcome['state'])}, 1, 1);
                """)
        persisted = json.loads(self.sql(self.name, f"""
            SELECT jsonb_object_agg(clinical_case.case_number,resolution.state)::text
              FROM aso.administering_entity_resolutions resolution
              JOIN aso.cases clinical_case ON clinical_case.id=resolution.case_id
             WHERE resolution.practice_id={base.literal(practice_id)};
        """).stdout.strip())
        self.check(
            "durable_resolution_rows_preserve_all_named_states",
            persisted == {
                case["case_number"]: self.expected[case["fixture_id"]]["state"]
                for case in fixture["cases"]
            },
            observed=persisted,
        )

    def exercise_transaction(self):
        self.mark("seed_and_classify_web03_resolution_fixture")
        self.insert_resolution_fixture()
        observed = {}
        for case in self.fixture["cases"]:
            candidates = self.database_candidates(case)
            state, active = self.classify(candidates)
            expected = self.expected[case["fixture_id"]]
            actual = {
                "state": state,
                "candidate_count": len(active),
                "historical_candidate_count": len(candidates),
                "downstream_blocked": state != "resolved",
            }
            self.check(
                f"fixture_{case['fixture_id']}_classifies_deterministically",
                actual == {
                    key: expected[key] for key in actual
                },
                observed=actual,
            )
            if state == "resolved":
                candidate = active[0]
                exact = {
                    "matched_rule_id": candidate["id"],
                    "entity_id": candidate["administering_entity_id"],
                    "criteria_set_key": candidate["criteria_set_key"],
                    "submission_channel_key": candidate["submission_channel_key"],
                    "appeal_path_key": candidate["appeal_path_key"],
                    "source_document_id": candidate["source_document_id"],
                    "valid_from": candidate["valid_from"],
                    "valid_to": candidate["valid_to"],
                }
                self.check(
                    "valid_fixture_has_one_exact_resolution",
                    all(expected[key] == value for key, value in exact.items()),
                    observed=exact,
                )
            observed[case["fixture_id"]] = actual

        self.persist_fixture_outcomes(observed)
        self.exercise_integrity_refusals()

    def exercise_integrity_refusals(self):
        self.mark("verify_resolution_schema_integrity_refusals")
        fixture = self.fixture
        practice_id = fixture["practice"]["id"]
        valid_case = next(item for item in fixture["cases"] if item["fixture_id"] == "valid")
        foreign_patient = self.sql(
            self.name,
            f"SELECT patient_id FROM aso.cases WHERE id={base.literal(self.foreign_case)};",
        ).stdout.strip()
        foreign_source = "50000000-0000-4000-8000-000000000399"
        self.sql(self.name, f"""
            SET search_path=aso,public;
            INSERT INTO aso.documents(
              id,document_type_id,patient_id,name,effective_date,page_count)
            SELECT {base.literal(foreign_source)},id,{base.literal(foreign_patient)},
                   'Synthetic foreign delegation source','2026-01-01',1
              FROM aso.document_types WHERE key='policy-document';
        """)
        self.sqlstate_refused(
            "foreign_practice_rule_source_is_refused",
            f"""INSERT INTO aso.plan_delegation_rules(
              id,practice_id,payer_plan_id,procedure_code,
              administering_entity_id,criteria_set_key,
              submission_channel_key,appeal_path_key,source_document_id,
              valid_from)
            VALUES (
              '23000000-0000-4000-8000-000000000399',
              {base.literal(practice_id)},
              '22000000-0000-4000-8000-000000000301','SYN-LUMBAR-001',
              '21000000-0000-4000-8000-000000000301',
              'synthetic-foreign-criteria','manual_synthetic',
              'synthetic-foreign-appeal',{base.literal(foreign_source)},
              '2026-01-01');""",
            "23514",
        )
        self.sqlstate_refused(
            "resolved_state_requires_complete_output",
            f"""INSERT INTO aso.administering_entity_resolutions(
              case_id,practice_id,state,revision,case_input_revision)
            VALUES ({base.literal(valid_case['id'])},{base.literal(practice_id)},
                    'resolved',2,1)
            ON CONFLICT (case_id) DO UPDATE SET
              state='resolved',entity_id=NULL,criteria_set_key=NULL,
              submission_channel_key=NULL,appeal_path_key=NULL,
              source_document_id=NULL,valid_from=NULL,valid_to=NULL,
              matched_rule_id=NULL,revision=2;""",
            "23514",
        )
        permissions = json.loads(self.sql(self.name, """
            SELECT jsonb_build_object(
              'entityRls',(SELECT relrowsecurity FROM pg_class
                WHERE oid='aso.administering_entities'::regclass),
              'planRls',(SELECT relrowsecurity FROM pg_class
                WHERE oid='aso.payer_plans'::regclass),
              'ruleRls',(SELECT relrowsecurity FROM pg_class
                WHERE oid='aso.plan_delegation_rules'::regclass),
              'resolutionRls',(SELECT relrowsecurity FROM pg_class
                WHERE oid='aso.administering_entity_resolutions'::regclass),
              'executorRuleRead',has_table_privilege(
                'aso_case_executor','aso.plan_delegation_rules','SELECT'),
              'executorRuleWrite',has_table_privilege(
                'aso_case_executor','aso.plan_delegation_rules','INSERT,UPDATE,DELETE'),
              'executorResolutionWrite',has_table_privilege(
                'aso_case_executor','aso.administering_entity_resolutions','INSERT,UPDATE,DELETE'),
              'publishedLocalInputs',EXISTS(
                SELECT FROM pg_publication_rel publication
                WHERE publication.prrelid IN (
                  'aso.administering_entities'::regclass,
                  'aso.payer_plans'::regclass,
                  'aso.plan_delegation_rules'::regclass)),
              'migrationRecorded',EXISTS(
                SELECT FROM public._sqlx_migrations
                WHERE version=2026090618 AND success))::text;
        """).stdout.strip())
        self.check(
            "rls_direct_write_publication_and_migration_contract",
            permissions == {
                "entityRls": True,
                "planRls": True,
                "ruleRls": True,
                "resolutionRls": True,
                "executorRuleRead": False,
                "executorRuleWrite": False,
                "executorResolutionWrite": False,
                "publishedLocalInputs": False,
                "migrationRecorded": True,
            },
            observed=permissions,
        )


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--postgres-user", default="flint")
    parser.add_argument("--postgres-port", type=int)
    parser.add_argument("--command-seconds", type=int, default=600)
    parser.add_argument("--install-mode", choices=("fresh", "upgrade"), required=True)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def main():
    args = parse_args()
    lock_path = Path("/tmp/aso-web03-resolution-schema.lock")
    with open(lock_path, "a") as lock:
        import fcntl

        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("Web-03 resolution schema probe: another fixture is running", file=sys.stderr)
            return 1
        return ResolutionSchemaProbe(args).run()


if __name__ == "__main__":
    sys.exit(main())
