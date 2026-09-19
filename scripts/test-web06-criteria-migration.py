#!/usr/bin/env python3
"""Focused PostgreSQL proof for the Web-06 canonical criteria cutover."""

import argparse
import datetime
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import uuid


ROOT = Path(__file__).resolve().parents[1]
BASE_PROBE = ROOT / "scripts/test-gate-transaction.py"
EVIDENCE = (
    ROOT
    / ".kbd-orchestrator/phases/runtime-architecture/children/"
    "web-case-to-letter/evidence/web-06-criteria-catalog-core"
)


def load_base_probe():
    spec = importlib.util.spec_from_file_location("web06_gate_probe", BASE_PROBE)
    if spec is None or spec.loader is None:
        raise RuntimeError("gate_probe_unavailable")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


base = load_base_probe()
base.SOURCE_FILES = base.SOURCE_FILES + (
    "migrations/server/2026090624_criteria_catalog.sql",
    "crates/aso-web-server/src/migrations.rs",
    "docs/design/schema/schema-web-case-to-letter.sql",
    "docs/architecture/web-case-to-letter-contract.md",
    "scripts/test-web06-criteria-migration.py",
)


class CriteriaMigrationProbe(base.Probe):
    def __init__(self, args):
        super().__init__(args)
        self.output = Path(args.output)
        self.policy = str(uuid.uuid4())
        self.criterion_a = str(uuid.uuid4())
        self.criterion_b = str(uuid.uuid4())
        self.evidence = str(uuid.uuid4())
        self.report.update({
            "observed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "scope": (
                "Web-06 fresh and populated-upgrade criteria cutover, stable "
                "lineage, deterministic hashes and effective ranges, read-only "
                "legacy compatibility, immutable provenance, overlap refusal, "
                "and exact trusted catalog projection"
            ),
            "commands": [
                "python3 scripts/test-web06-criteria-migration.py "
                f"--install-mode {self.install_mode} --output {self.output}",
                "cargo run -p aso-web-server -- --migrate-server",
            ],
            "unverified": [
                "Criteria import/list/read AppServices and mounted HTTP are Web-06 tasks 1.3 and 1.4.",
                "React criteria selection and actual-browser certification are Web-07 and Web-17.",
                "Tauri and mobile remain deferred until Web-17 passes.",
            ],
        })

    def case_snapshot(self, case_ids=None):
        """Compare legacy case data while excluding additive revision tokens."""
        selected = case_ids if case_ids is not None else (self.case, self.foreign_case)
        excluded = (
            "revision,case_input_revision,status_revision,resolution_revision,"
            "document_set_revision,procedure_code,plan_key"
        ).split(",")
        return self.sql(
            self.name,
            "SELECT jsonb_agg(to_jsonb(c) - ARRAY["
            + ",".join(base.literal(column) for column in excluded)
            + "] ORDER BY id)::text FROM aso.cases c WHERE id IN ("
            + ",".join(base.literal(case_id) for case_id in selected)
            + ");",
        ).stdout.strip()

    def seed_case_fixture(self):
        super().seed_case_fixture()
        self.payer = self.sql(
            self.name,
            f"SELECT payer_id FROM aso.cases WHERE id={base.literal(self.case)};",
        ).stdout.strip()
        self.patient = self.sql(
            self.name,
            f"SELECT patient_id FROM aso.cases WHERE id={base.literal(self.case)};",
        ).stdout.strip()
        if self.install_mode != "upgrade":
            return

        self.mark("seed_populated_legacy_criteria")
        self.sql(self.name, f"""
            SET search_path=aso,public;
            INSERT INTO policies(
              id,policy_type_id,payer_id,name,policy_number,version,
              effective_from,effective_to,source_sha256,retrieved_at,is_published,
              created_at,updated_at)
            SELECT {base.literal(self.policy)},id,{base.literal(self.payer)},
                   'Synthetic lumbar policy','SYN-WEB06','2026.1',
                   DATE '2026-01-01',DATE '2027-01-01',
                   digest(convert_to('synthetic-policy','UTF8'),'sha256'),
                   TIMESTAMPTZ '2026-01-02 10:00:00+00',true,
                   TIMESTAMPTZ '2026-01-02 09:00:00+00',
                   TIMESTAMPTZ '2026-01-03 09:00:00+00'
              FROM policy_types WHERE key='medical-policy';
            INSERT INTO policy_criteria(
              id,policy_id,section,ordinal,label,requirement,data,is_mandatory,
              created_at,updated_at)
            VALUES
              ({base.literal(self.criterion_a)},{base.literal(self.policy)},
               '3.2',1,'Synthetic supervised therapy',
               'Six weeks of supervised therapy are documented.',
               '{{"synthetic":true,"fixture":"web06-a"}}',true,
               TIMESTAMPTZ '2026-01-02 09:10:00+00',
               TIMESTAMPTZ '2026-01-03 09:10:00+00'),
              ({base.literal(self.criterion_b)},{base.literal(self.policy)},
               '3.2',2,'Synthetic imaging',
               'Current imaging documents the requested level.',
               '{{"synthetic":true,"fixture":"web06-b"}}',false,
               TIMESTAMPTZ '2026-01-02 09:20:00+00',NULL);
            INSERT INTO case_evidence(
              id,case_id,policy_criterion_id,state,rationale,assessed_at,
              created_at)
            VALUES (
              {base.literal(self.evidence)},{base.literal(self.case)},
              {base.literal(self.criterion_a)},'met','Synthetic migration evidence',
              TIMESTAMPTZ '2026-02-01 10:00:00+00',
              TIMESTAMPTZ '2026-02-01 10:00:00+00');
        """)
        self.legacy_snapshot = self.sql(self.name, f"""
            SELECT jsonb_agg(to_jsonb(legacy) ORDER BY legacy.id)::text
              FROM aso.policy_criteria legacy
             WHERE legacy.id IN (
               {base.literal(self.criterion_a)},{base.literal(self.criterion_b)});
        """).stdout.strip()

    def expect_sqlstate(self, label, statement, expected_state):
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

    def seed_fresh_canonical_fixture(self):
        self.mark("seed_fresh_canonical_criterion")
        self.sql(self.name, f"""
            SET search_path=aso,public;
            INSERT INTO policies(
              id,policy_type_id,payer_id,name,policy_number,version,
              effective_from,effective_to,source_sha256,retrieved_at,is_published)
            SELECT {base.literal(self.policy)},id,{base.literal(self.payer)},
                   'Synthetic fresh policy','SYN-WEB06-FRESH','2026.1',
                   DATE '2026-01-01',DATE '2027-01-01',
                   digest(convert_to('synthetic-fresh-policy','UTF8'),'sha256'),
                   TIMESTAMPTZ '2026-01-02 10:00:00+00',true
              FROM policy_types WHERE key='medical-policy';
            INSERT INTO criteria(
              id,payer_id,evidence_grade,policy_id,section,ordinal,label,
              requirement,content_sha256,validity,is_mandatory,data)
            VALUES (
              {base.literal(self.criterion_a)},{base.literal(self.payer)},
              'published',{base.literal(self.policy)},'3.2',1,
              'Synthetic fresh criterion','Synthetic fresh requirement.',
              digest(convert_to('Synthetic fresh requirement.','UTF8'),'sha256'),
              daterange(DATE '2026-01-01',DATE '2027-01-01','[)'),true,
              '{{"synthetic":true,"fixture":"web06-fresh"}}');
        """)

    def exercise_transaction(self):
        if self.install_mode == "fresh":
            self.seed_fresh_canonical_fixture()

        self.mark("verify_canonical_cutover")
        expected_count = 2 if self.install_mode == "upgrade" else 1
        relation_state = json.loads(self.sql(self.name, f"""
            SELECT jsonb_build_object(
              'migrationRecorded',EXISTS(
                SELECT FROM public._sqlx_migrations
                WHERE version=2026090624 AND success),
              'compatibilityKind',(SELECT relkind::text FROM pg_class
                WHERE oid='aso.policy_criteria'::regclass),
              'legacyKind',(SELECT relkind::text FROM pg_class
                WHERE oid='aso.policy_criteria_legacy'::regclass),
              'criterionColumn',EXISTS(SELECT FROM information_schema.columns
                WHERE table_schema='aso' AND table_name='case_evidence'
                  AND column_name='criterion_id'),
              'legacyColumn',EXISTS(SELECT FROM information_schema.columns
                WHERE table_schema='aso' AND table_name='case_evidence'
                  AND column_name='policy_criterion_id'),
              'canonicalCount',(SELECT count(*) FROM aso.criteria),
              'catalogCount',(SELECT count(*) FROM aso.criteria_catalog),
              'compatibilityCount',(SELECT count(*) FROM aso.policy_criteria),
              'catalogRls',(SELECT relrowsecurity FROM pg_class
                WHERE oid='aso.criteria_catalog'::regclass),
              'publicCatalogPrivilege',has_table_privilege(
                'public','aso.criteria_catalog','SELECT'))::text;
        """).stdout.strip())
        self.check(
            "canonical_relations_compatibility_and_projection_exist",
            relation_state == {
                "migrationRecorded": True,
                "compatibilityKind": "v",
                "legacyKind": "r",
                "criterionColumn": True,
                "legacyColumn": False,
                "canonicalCount": expected_count,
                "catalogCount": expected_count,
                "compatibilityCount": expected_count,
                "catalogRls": True,
                "publicCatalogPrivilege": False,
            },
            observed=relation_state,
        )

        catalog_columns = self.sql(self.name, """
            SELECT string_agg(column_name,',' ORDER BY ordinal_position)
              FROM information_schema.columns
             WHERE table_schema='aso' AND table_name='criteria_catalog';
        """).stdout.strip().split(",")
        self.check(
            "catalog_projection_has_exact_frozen_columns",
            catalog_columns == [
                "id", "payer_id", "practice_id", "evidence_grade",
                "policy_id", "section", "ordinal", "document_id",
                "source_page_number", "label", "requirement",
                "content_sha256_text", "procedure_family", "is_mandatory",
                "validity", "superseded_by",
            ],
            observed=catalog_columns,
        )

        canonical = json.loads(self.sql(self.name, f"""
            SELECT jsonb_build_object(
              'id',criterion.id,
              'payerId',criterion.payer_id,
              'practiceId',criterion.practice_id,
              'grade',criterion.evidence_grade,
              'policyId',criterion.policy_id,
              'section',criterion.section,
              'ordinal',criterion.ordinal,
              'label',criterion.label,
              'requirement',criterion.requirement,
              'hash',encode(criterion.content_sha256,'hex'),
              'expectedHash',encode(digest(
                convert_to(criterion.requirement,'UTF8'),'sha256'),'hex'),
              'validity',criterion.validity::text,
              'documentId',criterion.document_id,
              'sourcePageNumber',criterion.source_page_number,
              'lastConfirmedAt',criterion.last_confirmed_at,
              'catalogHash',catalog.content_sha256_text)
              FROM aso.criteria criterion
              JOIN aso.criteria_catalog catalog ON catalog.id=criterion.id
             WHERE criterion.id={base.literal(self.criterion_a)};
        """).stdout.strip())
        self.check(
            "stable_lineage_hash_effective_range_and_projection_match",
            canonical["id"] == self.criterion_a
            and canonical["payerId"] == self.payer
            and canonical["practiceId"] is None
            and canonical["grade"] == "published"
            and canonical["policyId"] == self.policy
            and canonical["section"] == "3.2"
            and canonical["ordinal"] == 1
            and canonical["hash"] == canonical["expectedHash"]
            and canonical["catalogHash"] == canonical["hash"]
            and canonical["validity"] == "[2026-01-01,2027-01-01)"
            and canonical["documentId"] is None
            and canonical["sourcePageNumber"] is None,
            observed=canonical,
        )

        if self.install_mode == "upgrade":
            legacy_after = self.sql(self.name, f"""
                SELECT jsonb_agg(to_jsonb(legacy) ORDER BY legacy.id)::text
                  FROM aso.policy_criteria_legacy legacy
                 WHERE legacy.id IN (
                   {base.literal(self.criterion_a)},{base.literal(self.criterion_b)});
            """).stdout.strip()
            evidence_target = self.sql(self.name, f"""
                SELECT criterion_id FROM aso.case_evidence
                 WHERE id={base.literal(self.evidence)};
            """).stdout.strip()
            compatibility_data = json.loads(self.sql(self.name, f"""
                SELECT data::text FROM aso.policy_criteria
                 WHERE id={base.literal(self.criterion_a)};
            """).stdout.strip())
            self.check(
                "populated_upgrade_preserves_legacy_rows_evidence_ids_and_user_data",
                legacy_after == self.legacy_snapshot
                and evidence_target == self.criterion_a
                and compatibility_data == {"synthetic": True, "fixture": "web06-a"},
            )
            self.check(
                "migrated_confirmation_timestamp_is_deterministic",
                canonical["lastConfirmedAt"] == "2026-01-03T09:10:00+00:00",
                observed=canonical["lastConfirmedAt"],
            )

        self.mark("verify_refusal_contracts")
        self.expect_sqlstate(
            "legacy_table_insert_is_refused",
            f"""INSERT INTO aso.policy_criteria_legacy(
              id,policy_id,section,ordinal,label,requirement)
            VALUES ({base.literal(str(uuid.uuid4()))},{base.literal(self.policy)},
                    '9.9',99,'Synthetic forbidden','Synthetic forbidden');""",
            "25006",
        )
        self.expect_sqlstate(
            "compatibility_view_update_is_refused",
            f"""UPDATE aso.policy_criteria SET requirement='Synthetic changed'
                  WHERE id={base.literal(self.criterion_a)};""",
            "25006",
        )
        self.expect_sqlstate(
            "canonical_requirement_mutation_is_refused",
            f"""UPDATE aso.criteria SET requirement='Synthetic changed'
                  WHERE id={base.literal(self.criterion_a)};""",
            "23514",
        )
        self.expect_sqlstate(
            "canonical_hash_mutation_is_refused",
            f"""UPDATE aso.criteria SET content_sha256=decode({'\'00\''} || repeat('00',31),'hex')
                  WHERE id={base.literal(self.criterion_a)};""",
            "23514",
        )
        self.expect_sqlstate(
            "overlapping_effective_version_is_refused",
            f"""INSERT INTO aso.criteria(
              id,payer_id,evidence_grade,policy_id,section,ordinal,label,
              requirement,content_sha256,validity)
            SELECT {base.literal(str(uuid.uuid4()))},payer_id,evidence_grade,
                   policy_id,section,ordinal + 100,label,
                   'Synthetic conflicting version',
                   digest(convert_to('Synthetic conflicting version','UTF8'),'sha256'),
                   daterange(DATE '2026-06-01',DATE '2027-06-01','[)')
              FROM aso.criteria WHERE id={base.literal(self.criterion_a)};""",
            "23P01",
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
    lock_path = Path(tempfile.gettempdir()) / "aso-web06-criteria-migration.lock"
    with open(lock_path, "a") as lock:
        import fcntl

        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("Web-06 criteria migration probe: another fixture is running", file=sys.stderr)
            return 1
        return CriteriaMigrationProbe(args).run()


if __name__ == "__main__":
    sys.exit(main())
