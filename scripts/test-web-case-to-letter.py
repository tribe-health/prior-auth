#!/usr/bin/env python3
"""Tier 2: disposable AppServices case-to-approved-letter integration proof."""

import argparse
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import uuid


ROOT = Path(__file__).resolve().parents[1]
SERVICE_PROBE = ROOT / "scripts/test-web06-criteria-service.py"
OUTPUT = ROOT / ".kbd-orchestrator/phases/runtime-architecture/evidence/web-case-to-letter/integration.json"
TEST = [
    os.environ.get("RA06_TOOL_CARGO", "cargo"),
    "test",
    "-p",
    "aso-web-server",
    "adapters::gate::workflow_transaction_tests::case_to_approved_letter_lifecycle",
    "--",
    "--ignored",
    "--exact",
    "--nocapture",
]


def load_service_probe():
    spec = importlib.util.spec_from_file_location("web06_criteria_service", SERVICE_PROBE)
    if spec is None or spec.loader is None:
        raise RuntimeError("criteria_service_probe_unavailable")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


service = load_service_probe()


class CaseToLetterProbe(service.CriteriaServiceProbe):
    def __init__(self, args):
        super().__init__(args)
        self.skip_criteria_service_lifecycle = True
        self.output = Path(args.output)
        self.report["verification_tier"] = 2
        self.report["scope"] = (
            "Disposable restricted-login AppServices integration from source-backed "
            "three-state evidence through four-part surgeon gate, cited draft, human "
            "review, and clinical approval"
        )
        self.report["commands"].append(" ".join(TEST))
        self.report["unverified"] = [
            "The actual browser interaction is verified separately by the routed web scenario.",
            "Tauri and mobile remain deferred until the web scenario is certified.",
        ]

    def seed_workflow(self):
        self.mark("seed_case_to_letter_workflow")
        criterion_id = str(uuid.uuid4())
        source_text = "Six weeks of supervised therapy are documented."
        source_ready = self.sql(
            self.name,
            f"""
            SET search_path=aso,public;
            WITH selected_policy AS (
              SELECT id FROM aso.policies
              WHERE payer_id={service.migration.base.literal(self.payer)}
              ORDER BY effective_from DESC,id LIMIT 1
            )
            UPDATE aso.policies policy
               SET source_document_id={service.migration.base.literal(self.source_documents['published'])}
              FROM selected_policy WHERE policy.id=selected_policy.id;
            INSERT INTO aso.criteria(
              id,payer_id,evidence_grade,policy_id,section,document_id,label,
              requirement,ordinal,source_page_number,content_sha256,validity,
              last_confirmed_at,is_mandatory,data)
            SELECT {service.migration.base.literal(criterion_id)},
              {service.migration.base.literal(self.payer)},'published',policy.id,
              '4.1',{service.migration.base.literal(self.source_documents['published'])},
              'Operative-level imaging',
              {service.migration.base.literal(source_text)},2,1,
              digest(convert_to({service.migration.base.literal(source_text)},'UTF8'),'sha256'),
              daterange(DATE '2026-01-01',DATE '2027-01-01','[)'),
              clock_timestamp(),true,'{{}}'::jsonb
            FROM aso.policies policy
            WHERE policy.payer_id={service.migration.base.literal(self.payer)}
            ORDER BY policy.effective_from DESC,policy.id LIMIT 1;
            """,
            require_success=False,
        )
        self.check(
            "source_backed_catalog_criterion_seeded",
            source_ready.returncode == 0,
            database_error=[
                line.strip()
                for line in source_ready.stderr.splitlines()
                if "ERROR:" in line or "DETAIL:" in line
            ][-8:],
        )
        selected = self.sql(
            self.name,
            f"""
            SELECT catalog.id::text || '|' || catalog.policy_id::text
            FROM aso.criteria_catalog catalog
            WHERE catalog.payer_id={service.migration.base.literal(self.payer)}
              AND catalog.document_id={service.migration.base.literal(self.source_documents['published'])}
              AND catalog.policy_id IS NOT NULL
            ORDER BY catalog.ordinal, catalog.id LIMIT 1;
            """,
        ).stdout.strip()
        self.check("source_backed_catalog_criterion_available", bool(selected))
        criterion_id, policy_id = selected.split("|", 1)
        selection_id = str(uuid.uuid4())
        seeded = self.sql(
            self.name,
            f"""
            SET search_path=aso,public;
            UPDATE aso.cases SET resolution_revision=1,criteria_selection_revision=1
             WHERE id={service.migration.base.literal(self.case)};
            INSERT INTO aso.case_criteria_selections(
              case_id,practice_id,resolution_revision,criteria_catalog_revision,
              criteria_snapshot_id,policy_id,selected_criterion_ids,selected_by,
              selected_at,state,revision)
            SELECT {service.migration.base.literal(self.case)},
              {service.migration.base.literal(self.home)},1,state.revision_token,
              {service.migration.base.literal(selection_id)},
              {service.migration.base.literal(policy_id)},
              ARRAY[{service.migration.base.literal(criterion_id)}::uuid],
              {service.migration.base.literal(self.contexts['A']['actor_id'])},
              clock_timestamp(),'current',1
            FROM aso.criteria_catalog_state state WHERE state.singleton;
            SET session_replication_role=replica;
            INSERT INTO aso.gate_affirmations(case_id,kind,affirmed_by,affirmed_at)
            SELECT {service.migration.base.literal(self.case)},kind,
              {service.migration.base.literal(self.contexts['A']['actor_id'])},
              clock_timestamp()
            FROM unnest(ARRAY['policy','section','pathway','plan']) kind;
            UPDATE aso.cases SET gate_affirmed_at=clock_timestamp(),
              gate_affirmed_by={service.migration.base.literal(self.contexts['A']['actor_id'])}
            WHERE id={service.migration.base.literal(self.case)};
            SET session_replication_role=origin;
            """,
            require_success=False,
        )
        self.check(
            "current_criteria_snapshot_seeded",
            seeded.returncode == 0,
            database_error=[
                line.strip()
                for line in seeded.stderr.splitlines()
                if "ERROR:" in line or "DETAIL:" in line
            ][-8:],
        )
        self.criterion_id = criterion_id

    def exercise_transaction(self):
        super().exercise_transaction()
        self.seed_workflow()
        process_env = os.environ.copy()
        process_env.pop("ASO_DATABASE_URL", None)
        process_env.pop("ASO_MIGRATION_DATABASE_URL", None)
        process_env.update(
            {
                "ASO_TEST_WORKFLOW_DATABASE_URL": self.runtime_url,
                "ASO_TEST_WORKFLOW_IDENTITY_ID": self.contexts["A"]["identity_id"],
                "ASO_TEST_WORKFLOW_ACTOR_ID": self.contexts["A"]["actor_id"],
                "ASO_TEST_WORKFLOW_PRACTICE_ID": self.home,
                "ASO_TEST_WORKFLOW_CASE_ID": self.case,
                "ASO_TEST_WORKFLOW_CRITERION_ID": self.criterion_id,
                "ASO_TEST_WORKFLOW_DOCUMENT_ID": self.source_documents["published"],
                "ASO_TEST_WORKFLOW_QUOTE": "Six weeks of supervised therapy are documented.",
                "RUSTUP_TOOLCHAIN": "1.97.1",
            }
        )
        completed, entry = self.run_process(
            "actual_case_to_approved_letter_lifecycle", TEST, process_env
        )
        output = completed.stdout + "\n" + completed.stderr
        markers = [
            line.strip()
            for line in output.splitlines()
            if re.fullmatch(
                r"workflow_transaction_check: [a-z][a-z0-9_]*", line.strip()
            )
        ]
        expected = [
            "workflow_transaction_check: source_backed_three_state_evidence_committed",
            "workflow_transaction_check: four_part_clinical_gate_verified",
            "workflow_transaction_check: deterministic_cited_draft_generated",
            "workflow_transaction_check: human_review_and_clinical_approval_committed",
        ]
        entry["actual_result_output"] = markers
        if completed.returncode != 0:
            entry["failure_output"] = output.splitlines()[-100:]
        self.check(
            "actual_appservices_case_to_letter_lifecycle",
            completed.returncode == 0 and markers == expected,
            return_code=completed.returncode,
            markers=markers,
        )


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--postgres-user", default="flint")
    parser.add_argument("--postgres-port", type=int)
    parser.add_argument("--command-seconds", type=int, default=900)
    parser.add_argument("--install-mode", choices=("fresh",), default="fresh")
    parser.add_argument("--output", default=str(OUTPUT))
    return parser.parse_args()


if __name__ == "__main__":
    lock_path = Path(tempfile.gettempdir()) / "aso-web-case-to-letter.lock"
    with open(lock_path, "a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("Web case-to-letter probe is already running", file=sys.stderr)
            sys.exit(1)
        sys.exit(CaseToLetterProbe(parse_args()).run())
