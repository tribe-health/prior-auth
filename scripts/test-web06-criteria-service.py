#!/usr/bin/env python3
"""Focused AppServices/PostgreSQL proof for the Web-06 criteria catalog."""

import argparse
import importlib.util
import json
import os
from pathlib import Path
import re
import secrets
import sys
import tempfile
import urllib.parse
import uuid


ROOT = Path(__file__).resolve().parents[1]
MIGRATION_PROBE = ROOT / "scripts/test-web06-criteria-migration.py"
EVIDENCE = (
    ROOT
    / ".kbd-orchestrator/phases/runtime-architecture/children/"
    "web-case-to-letter/evidence/web-06-criteria-catalog-core"
)
TEST = [
    os.environ.get("RA06_TOOL_CARGO", "cargo"),
    "test",
    "-p",
    "aso-web-server",
    "adapters::gate::criteria_transaction_tests::criteria_catalog_service_lifecycle",
    "--",
    "--ignored",
    "--exact",
    "--nocapture",
]


def load_migration_probe():
    spec = importlib.util.spec_from_file_location(
        "web06_criteria_migration_probe", MIGRATION_PROBE
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("criteria_migration_probe_unavailable")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


migration = load_migration_probe()
migration.base.SOURCE_FILES = migration.base.SOURCE_FILES + (
    "migrations/server/2026090625_criteria_catalog_commands.sql",
    "migrations/server/2026090626_criteria_catalog_repair.sql",
    "crates/aso-host/src/criteria_catalog.rs",
    "crates/aso-host/src/ports/mod.rs",
    "crates/aso-server-axum/src/lib.rs",
    "crates/aso-server-axum/src/routes/criteria.rs",
    "crates/aso-server-axum/src/routes/mod.rs",
    "crates/aso-web-server/src/adapters/gate.rs",
    "crates/aso-web-server/src/adapters/gate/criteria_transaction_tests.rs",
    "crates/aso-web-server/src/main.rs",
    "scripts/test-web06-criteria-service.py",
)


class CriteriaServiceProbe(migration.CriteriaMigrationProbe):
    expected_markers = [
        "criteria_transaction_check: published_import_exact_retry_and_conflict",
        "criteria_transaction_check: published_visibility_and_obtained_tenant_scope",
        "criteria_transaction_check: grade_tenant_namespaces_and_foreign_supersession_refusal",
        "criteria_transaction_check: source_effective_date_is_bound_to_policy",
        "criteria_transaction_check: stale_grade_laundering_and_foreign_source_refusal",
        "criteria_transaction_check: immutable_correction_by_supersession",
        "criteria_transaction_check: mounted_http_service_parity",
        "criteria_transaction_check: mounted_http_tenant_scope_and_conflicting_retry",
        "criteria_transaction_check: mounted_http_overlap_and_grade_non_promotion",
        "criteria_transaction_check: audited_imports_and_immutable_command_ledger",
    ]

    def __init__(self, args):
        super().__init__(args)
        self.output = Path(args.output)
        self.source_documents = {
            key: str(uuid.uuid4())
            for key in ("published", "obtained", "correction", "foreign")
        }
        self.report["commands"][0] = (
            "python3 scripts/test-web06-criteria-service.py "
            f"--install-mode {self.install_mode} --output {self.output}"
        )
        self.report["commands"].append(" ".join(TEST))
        self.report["scope"] = (
            "Web-06 production AppServices and restricted PostgreSQL criteria "
            "repository: published/obtained provenance, tenant reads, exact "
            "retry, stale/conflicting commands, grade refusal, foreign-source "
            "refusal, immutable correction-by-supersession, mounted browser HTTP "
            "parity, overlap refusal, audit, and ledger"
        )
        self.report["unverified"] = [
            "Criteria selection UI and actual-browser certification are Web-07 and Web-17.",
            "Tauri and mobile remain deferred until Web-17 passes.",
        ]

    def seed_source_documents(self):
        foreign_patient = self.sql(
            self.name,
            "SELECT patient_id FROM aso.cases WHERE id="
            + migration.base.literal(self.foreign_case)
            + ";",
        ).stdout.strip()
        texts = {
            "published": "Six weeks of supervised therapy are documented.",
            "obtained": "Payer portal confirmation requires standing radiographs.",
            "correction": (
                "Twelve weeks of supervised therapy are documented. "
                "The stale command must not commit."
            ),
            "foreign": "The stale command must not commit.",
        }
        effective_dates = {
            "published": "2026-01-01",
            "obtained": "2026-01-01",
            "correction": "2026-07-01",
            "foreign": "2026-01-01",
        }
        for key, document_id in self.source_documents.items():
            patient_id = foreign_patient if key == "foreign" else self.patient
            case_id = self.foreign_case if key == "foreign" else self.case
            text = texts[key]
            inserted = self.sql(
                self.name,
                f"""
                SET search_path=aso,public;
                INSERT INTO aso.documents (
                  id,document_type_id,patient_id,case_id,name,effective_date,
                  storage_uri,content_sha256,document_version,page_count,
                  retrieved_at,ingest_method,media_type,byte_size,
                  processing_status,revision,committed_at)
                SELECT
                  {migration.base.literal(document_id)},id,
                  {migration.base.literal(patient_id)},
                  {migration.base.literal(case_id)},
                  {migration.base.literal('Synthetic ' + key + ' policy source')},
                  DATE {migration.base.literal(effective_dates[key])},
                  {migration.base.literal('synthetic/policy/' + document_id)},
                  digest(convert_to({migration.base.literal(text)},'UTF8'),'sha256'),
                  1,1,TIMESTAMPTZ '2026-03-01 12:00:00+00','api',
                  'text/plain',octet_length({migration.base.literal(text)}),
                  'ready',1,TIMESTAMPTZ '2026-03-01 12:00:00+00'
                FROM aso.document_types WHERE key='policy-document';
                INSERT INTO aso.document_pages (
                  document_id,page_number,text,text_sha256)
                VALUES (
                  {migration.base.literal(document_id)},1,
                  {migration.base.literal(text)},
                  digest(convert_to({migration.base.literal(text)},'UTF8'),'sha256'));
                """,
                require_success=False,
            )
            self.check(
                f"processed_{key}_policy_source_seeded",
                inserted.returncode == 0,
                database_error=[
                    line.strip()
                    for line in inserted.stderr.splitlines()
                    if "ERROR:" in line or "DETAIL:" in line or "CONTEXT:" in line
                ][-8:],
            )
        self.check(
            "processed_policy_source_documents_seeded",
            self.sql(
                self.name,
                "SELECT count(*) FROM aso.documents WHERE id IN ("
                + ",".join(
                    migration.base.literal(value)
                    for value in self.source_documents.values()
                )
                + ") AND processing_status='ready' AND page_count=1;",
            ).stdout.strip()
            == "4",
        )

    def exercise_transaction(self):
        super().exercise_transaction()
        self.mark("web06_criteria_service")
        self.seed_source_documents()

        password = secrets.token_urlsafe(36)
        self.sql(
            "postgres",
            "CREATE ROLE "
            + migration.base.identifier(self.login)
            + " LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION "
            + "NOBYPASSRLS PASSWORD "
            + migration.base.literal(password)
            + ";",
        )
        self.created_login = True
        self.sql(
            "postgres",
            "GRANT aso_gate_executor, aso_case_executor TO "
            + migration.base.identifier(self.login)
            + ";",
        )
        role_ok = self.sql(
            self.name,
            f"""
            SELECT rolcanlogin
              AND NOT (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole
                       OR rolreplication)
              AND pg_has_role(oid,'aso_gate_executor','USAGE')
              AND pg_has_role(oid,'aso_case_executor','USAGE')
              AND NOT pg_has_role(oid,'aso_case_owner','MEMBER')
              AND NOT has_table_privilege(
                oid,'aso.criteria_catalog_commands','SELECT')
              AND NOT has_table_privilege(oid,'aso.criteria','INSERT')
              FROM pg_roles WHERE rolname={migration.base.literal(self.login)};
            """,
        ).stdout.strip()
        self.check("criteria_runtime_login_is_restricted_executor", role_ok == "t")

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
        self.runtime_url = runtime_url
        if getattr(self, "skip_criteria_service_lifecycle", False):
            return
        process_env = os.environ.copy()
        process_env.pop("ASO_MIGRATION_DATABASE_URL", None)
        process_env.pop("ASO_DATABASE_URL", None)
        process_env.update(
            {
                "ASO_TEST_CRITERIA_DATABASE_URL": runtime_url,
                "ASO_TEST_CRITERIA_ADMIN_DATABASE_URL": self.admin_url,
                "ASO_TEST_CRITERIA_FIXTURE": json.dumps(
                    {
                        "admin": {
                            "identityId": self.contexts["admin"]["identity_id"],
                            "actorId": self.contexts["admin"]["actor_id"],
                            "practiceId": self.home,
                        },
                        "reader": {
                            "identityId": self.contexts["A"]["identity_id"],
                            "actorId": self.contexts["A"]["actor_id"],
                            "practiceId": self.home,
                        },
                        "foreignReader": {
                            "identityId": self.contexts["foreign"]["identity_id"],
                            "actorId": self.contexts["foreign"]["actor_id"],
                            "practiceId": self.foreign,
                        },
                        "payerId": self.payer,
                        "publishedDocumentId": self.source_documents["published"],
                        "obtainedDocumentId": self.source_documents["obtained"],
                        "correctionDocumentId": self.source_documents["correction"],
                        "foreignDocumentId": self.source_documents["foreign"],
                    }
                ),
                "RUSTUP_TOOLCHAIN": "1.98.1",
            }
        )
        completed, entry = self.run_process(
            "actual_criteria_catalog_service_lifecycle", TEST, process_env
        )
        output = completed.stdout + "\n" + completed.stderr
        markers = [
            line.strip()
            for line in output.splitlines()
            if re.fullmatch(
                r"criteria_transaction_check: [a-z][a-z0-9_]*", line.strip()
            )
        ]
        totals = [
            line.strip()
            for line in output.splitlines()
            if line.strip().startswith("test result:")
        ][-1:]
        entry["actual_result_output"] = markers + totals
        if completed.returncode != 0:
            entry["failure_output"] = output.splitlines()[-80:]
        self.check(
            "actual_appservices_pg_criteria_repository_lifecycle",
            completed.returncode == 0 and markers == self.expected_markers,
            return_code=completed.returncode,
            markers=markers,
        )


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--postgres-user", default="flint")
    parser.add_argument("--postgres-port", type=int)
    parser.add_argument("--command-seconds", type=int, default=600)
    parser.add_argument(
        "--install-mode", choices=("fresh", "upgrade"), required=True
    )
    parser.add_argument("--output", required=True)
    return parser.parse_args()


if __name__ == "__main__":
    import fcntl

    lock_path = Path(tempfile.gettempdir()) / "aso-web06-criteria-service.lock"
    with open(lock_path, "a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("Web-06 criteria service probe is already running", file=sys.stderr)
            sys.exit(1)
        sys.exit(CriteriaServiceProbe(parse_args()).run())
