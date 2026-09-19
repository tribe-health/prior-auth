#!/usr/bin/env python3
"""Local AppServices, processor, DocumentStore, and PostgreSQL proof for Web-05."""

import argparse
import importlib.util
import json
import os
from pathlib import Path
import secrets
import sys
import tempfile
import urllib.parse
import uuid


ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PROBE = ROOT / "scripts/test-web04-document-upload-schema.py"


def load_schema_probe():
    spec = importlib.util.spec_from_file_location("web05_schema_probe", SCHEMA_PROBE)
    if spec is None or spec.loader is None:
        raise RuntimeError("document_processing_schema_probe_unavailable")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


schema = load_schema_probe()
schema.base.SOURCE_FILES = schema.base.SOURCE_FILES + (
    "migrations/server/2026090621_document_processing.sql",
    "crates/aso-host/src/document_processing.rs",
    "crates/aso-host/src/ports/mod.rs",
    "crates/aso-web-server/src/adapters/document_processor.rs",
    "crates/aso-web-server/src/adapters/document_store.rs",
    "crates/aso-web-server/src/adapters/gate.rs",
    "crates/aso-web-server/src/adapters/gate/processing_transaction_tests.rs",
    "scripts/test-web05-document-processing-service.py",
)


class DocumentProcessingServiceProbe(schema.DocumentUploadSchemaProbe):
    test_command = [
        os.environ.get("RA06_TOOL_CARGO", "cargo"),
        "test",
        "-p",
        "aso-web-server",
        "adapters::gate::processing_transaction_tests::document_processing_service_lifecycle",
        "--",
        "--ignored",
        "--exact",
        "--nocapture",
    ]
    expected_markers = [
        "document_processing_transaction_check: queued_processing_ready_and_exact_retry",
        "document_processing_transaction_check: deterministic_page_text_hashes_and_single_receipt",
        "document_processing_transaction_check: command_conflict_human_and_missing_job_grant_refusal",
        "document_processing_transaction_check: processing_failure_is_bounded_idempotent_and_does_not_advance_set",
    ]

    def __init__(self, args):
        super().__init__(args)
        self.processor_actor = str(uuid.uuid4())
        self.processor_identity = str(uuid.uuid4())
        self.report["commands"][0] = (
            "python3 scripts/test-web05-document-processing-service.py "
            f"--install-mode {self.install_mode} --output {self.output}"
        )
        self.report["scope"] = (
            "Web-05 service-principal job grant, queued/processing/ready/failed "
            "transitions, bounded text extraction, deterministic page hashes, "
            "document-set revision, exact retry, conflict, tenant, and local-data boundary"
        )
        self.report["unverified"] = [
            "Document status publication, React upload/status UI, actual browser, Tauri, and mobile are outside Web-05 task 1.2."
        ]

    def processor_session_sql(self, body, require_success=True):
        statement = f"""
        BEGIN;
        SET LOCAL ROLE aso_case_executor;
        SELECT set_config('aso.kratos_identity_id','{self.processor_identity}',true),
               set_config('aso.actor_id','{self.processor_actor}',true),
               set_config('aso.practice_id','{self.home}',true),
               set_config('aso.principal','service',true),
               set_config('aso.session_expires_at',
                 (clock_timestamp() + interval '10 minutes')::text,true);
        {body}
        COMMIT;
        """
        return self.sql(self.name, statement, require_success)

    def exercise_transaction(self):
        super().exercise_transaction()
        self.mark("web05_document_processing_service")

        self.mark("seed_web05_processor_grant")
        processor_seed = self.sql(self.name, f"""
          INSERT INTO aso.users (
            id, kratos_identity_id, practice_id, email, full_name, display_name, status)
          VALUES (
            '{self.processor_actor}', '{self.processor_identity}', '{self.home}',
            'processor-{self.processor_actor}@example.invalid',
            'Synthetic Document Processor', 'Synthetic Document Processor', 'active');
          INSERT INTO aso.document_processor_grants (
            service_identity_id, actor_id, practice_id, grant_key)
          VALUES (
            '{self.processor_identity}', '{self.processor_actor}', '{self.home}',
            'authorized_document_job_only');
        """, require_success=False)
        self.check(
            "processor_fixture_grant_seeded",
            processor_seed.returncode == 0,
            return_code=processor_seed.returncode,
            database_error=[
                line for line in processor_seed.stderr.splitlines()
                if "ERROR:" in line or "DETAIL:" in line or "CONTEXT:" in line
            ][-8:],
        )

        self.mark("claim_web05_processing_job")
        direct_command = str(uuid.uuid4())
        claimed_call = self.processor_session_sql(f"""
          SELECT aso.claim_document_processing_command(
            '{direct_command}','{self.case}','{self.document}',0)::text;
        """, require_success=False)
        self.check(
            "processor_claim_function_executes",
            claimed_call.returncode == 0,
            return_code=claimed_call.returncode,
            database_error=[
                line for line in claimed_call.stderr.splitlines()
                if "ERROR:" in line or "DETAIL:" in line or "CONTEXT:" in line
            ][-8:],
        )
        claimed = json.loads(claimed_call.stdout.splitlines()[-1])
        processing_state = json.loads(self.sql(self.name, f"""
          SELECT jsonb_build_object(
            'documentStatus',d.processing_status,
            'commandState',pc.state,
            'documentSetRevision',c.document_set_revision)::text
          FROM aso.documents d
          JOIN aso.cases c ON c.id=d.case_id
          JOIN aso.document_processing_commands pc ON pc.document_id=d.id
          WHERE d.id='{self.document}' AND pc.command_id='{direct_command}';
        """).stdout.strip())
        self.check(
            "claim_commits_observable_processing_state",
            claimed["state"] == "claimed"
            and processing_state == {
                "documentStatus": "processing",
                "commandState": "processing",
                "documentSetRevision": 0,
            },
            observed=processing_state,
        )
        self.mark("fail_web05_processing_job")
        failed_call = self.processor_session_sql(f"""
          SELECT aso.fail_document_processing_command(
            '{direct_command}','source_integrity_failed');
        """, require_success=False)
        self.check(
            "processor_failure_function_executes",
            failed_call.returncode == 0,
            return_code=failed_call.returncode,
            database_error=[
                line for line in failed_call.stderr.splitlines()
                if "ERROR:" in line or "DETAIL:" in line or "CONTEXT:" in line
            ][-8:],
        )
        direct_failed = json.loads(self.sql(self.name, f"""
          SELECT jsonb_build_object(
            'documentStatus',d.processing_status,
            'errorCode',d.processing_error_code,
            'commandState',pc.state,
            'pageCount',(SELECT count(*) FROM aso.document_pages p
                         WHERE p.document_id=d.id),
            'documentSetRevision',c.document_set_revision)::text
          FROM aso.documents d
          JOIN aso.cases c ON c.id=d.case_id
          JOIN aso.document_processing_commands pc ON pc.document_id=d.id
          WHERE d.id='{self.document}' AND pc.command_id='{direct_command}';
        """).stdout.strip())
        self.check(
            "processing_failure_is_bounded_and_leaves_ready_set_unchanged",
            direct_failed == {
                "documentStatus": "failed",
                "errorCode": "source_integrity_failed",
                "commandState": "failed",
                "pageCount": 0,
                "documentSetRevision": 0,
            },
            observed=direct_failed,
        )

        denied = self.session_sql(f"""
          DO $denied$
          BEGIN
            PERFORM aso.claim_document_processing_command(
              '{uuid.uuid4()}','{self.case}','{self.document}',0);
            RAISE EXCEPTION 'expected refusal was not observed' USING ERRCODE='P0001';
          EXCEPTION WHEN SQLSTATE '42501' THEN
            NULL;
          END;
          $denied$;
        """, require_success=False)
        self.check(
            "human_session_is_denied_by_processing_function",
            denied.returncode == 0,
            expected_sqlstate="42501",
        )

        boundary = json.loads(self.sql(self.name, """
          SELECT jsonb_build_object(
            'grantsRls',(SELECT relrowsecurity FROM pg_class
              WHERE oid='aso.document_processor_grants'::regclass),
            'pagesRls',(SELECT relrowsecurity FROM pg_class
              WHERE oid='aso.document_pages'::regclass),
            'commandsRls',(SELECT relrowsecurity FROM pg_class
              WHERE oid='aso.document_processing_commands'::regclass),
            'executorPagesRead',has_table_privilege(
              'aso_case_executor','aso.document_pages','SELECT'),
            'executorCommandsRead',has_table_privilege(
              'aso_case_executor','aso.document_processing_commands','SELECT'),
            'publishedLocalTables',EXISTS(
              SELECT FROM pg_publication_tables
               WHERE schemaname='aso' AND tablename IN (
                 'document_processor_grants','document_pages',
                 'document_processing_commands')))::text;
        """).stdout.strip())
        self.check(
            "processing_local_tables_are_rls_and_structurally_unpublished",
            boundary == {
                "grantsRls": True,
                "pagesRls": True,
                "commandsRls": True,
                "executorPagesRead": False,
                "executorCommandsRead": False,
                "publishedLocalTables": False,
            },
            observed=boundary,
        )

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
            "GRANT aso_gate_executor, aso_case_executor TO "
            + schema.base.identifier(self.login) + ";",
        )
        parsed = urllib.parse.urlsplit(self.admin_url)
        runtime_url = (
            "postgresql://" + self.login + ":"
            + urllib.parse.quote(password, safe="")
            + "@" + parsed.netloc.rsplit("@", 1)[1] + parsed.path
        )
        actor = self.contexts["A"]
        with tempfile.TemporaryDirectory(prefix="aso-web05-store-") as store_root:
            process_env = os.environ.copy()
            process_env.pop("ASO_MIGRATION_DATABASE_URL", None)
            process_env.pop("ASO_DATABASE_URL", None)
            process_env.update({
                "ASO_TEST_PROCESSING_DATABASE_URL": runtime_url,
                "ASO_TEST_ADMIN_DATABASE_URL": self.admin_url,
                "ASO_TEST_PROCESSING_STORE_ROOT": store_root,
                "ASO_TEST_PROCESSING_CASE_ID": self.case,
                "ASO_TEST_UPLOAD_CONTEXT": json.dumps({
                    "identity_id": actor["identity_id"],
                    "actor_id": actor["actor_id"],
                    "practice_id": actor["practice_id"],
                }),
                "ASO_TEST_PROCESSOR_CONTEXT": json.dumps({
                    "identity_id": self.processor_identity,
                    "actor_id": self.processor_actor,
                    "practice_id": self.home,
                }),
                "RUSTUP_TOOLCHAIN": "1.97.1",
            })
            completed, entry = self.run_process(
                "actual_document_processing_service_lifecycle",
                self.test_command,
                process_env,
            )
            output = completed.stdout + "\n" + completed.stderr
            markers = [
                line.strip() for line in output.splitlines()
                if line.strip().startswith("document_processing_transaction_check: ")
            ]
            if completed.returncode != 0:
                lines = output.splitlines()
                entry["failure_diagnostics"] = [
                    line.strip()
                    for index, line in enumerate(lines)
                    if "panicked at" in line
                    or (index > 0 and "panicked at" in lines[index - 1])
                    or line.strip().startswith("document_processing_adapter_stage: ")
                    or line.strip().startswith("document_processing_database_error: ")
                ][-8:]
            entry["actual_result_output"] = markers + [
                line.strip() for line in output.splitlines()
                if line.strip().startswith("test result:")
            ][-1:]
            self.check(
                "actual_service_store_database_processing_lifecycle",
                completed.returncode == 0 and markers == self.expected_markers,
                return_code=completed.returncode,
                markers=markers,
            )
            self.check(
                "processing_output_contains_no_source_text",
                "Synthetic page one" not in output
                and "Synthetic page two" not in output
                and "Synthetic valid page" not in output,
            )


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--postgres-user", default="flint")
    parser.add_argument("--postgres-port", type=int)
    parser.add_argument("--command-seconds", type=int, default=600)
    parser.add_argument("--install-mode", choices=("fresh", "upgrade"), required=True)
    parser.add_argument("--output", required=True)
    return parser.parse_args()


if __name__ == "__main__":
    import fcntl

    lock_path = Path(tempfile.gettempdir()) / "aso-web05-document-processing.lock"
    with open(lock_path, "a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("Web-05 processing probe: another fixture is running", file=sys.stderr)
            sys.exit(1)
        sys.exit(DocumentProcessingServiceProbe(parse_args()).run())
