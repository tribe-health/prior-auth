#!/usr/bin/env python3
"""Focused PostgreSQL proof for Web-04 durable document upload schema."""

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
    "web-case-to-letter/evidence/web-04-document-upload-core"
)


def load_base_probe():
    spec = importlib.util.spec_from_file_location("web04_gate_probe", BASE_PROBE)
    if spec is None or spec.loader is None:
        raise RuntimeError("gate_probe_unavailable")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


base = load_base_probe()
base.SOURCE_FILES = base.SOURCE_FILES + (
    "migrations/server/2026090617_durable_case_commands.sql",
    "migrations/server/2026090620_document_upload_schema.sql",
    "crates/aso-web-server/src/migrations.rs",
    "docs/design/schema/schema-web-case-to-letter.sql",
    "scripts/test-web04-document-upload-schema.py",
)


class DocumentUploadSchemaProbe(base.Probe):
    def __init__(self, args):
        super().__init__(args)
        self.output = Path(args.output)
        self.document = str(uuid.uuid4())
        self.command = str(uuid.uuid4())
        self.cleanup_document = str(uuid.uuid4())
        self.cleanup_command = str(uuid.uuid4())
        self.hash_hex = "ab" * 32
        self.report.update({
            "observed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "scope": (
                "Web-04 additive processing/staging schema, least-privilege "
                "reserve/commit/read/lookup functions, transaction rollback, "
                "cleanup, idempotency, revision, capability, and tenant refusal"
            ),
            "commands": [
                "python3 scripts/test-web04-document-upload-schema.py "
                f"--install-mode {self.install_mode} --output {self.output}",
                "cargo run -p aso-web-server -- --migrate-server",
            ],
            "unverified": [
                "DocumentStore byte writes, AppServices orchestration, multipart HTTP, React UI, actual browser, Tauri, and mobile are outside Web-04 task 1.2."
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

    def session_sql(self, body, context="A", require_success=True):
        actor = self.contexts[context]
        statement = f"""
        BEGIN;
        SET LOCAL ROLE aso_case_executor;
        SELECT set_config('aso.kratos_identity_id','{actor['identity_id']}',true),
               set_config('aso.actor_id','{actor['actor_id']}',true),
               set_config('aso.practice_id','{actor['practice_id']}',true),
               set_config('aso.principal','user',true),
               set_config('aso.session_expires_at',
                 (clock_timestamp() + interval '10 minutes')::text,true);
        {body}
        COMMIT;
        """
        return self.sql(self.name, statement, require_success)

    def expect_sqlstate(self, label, body, state, context="A"):
        wrapped = f"""
        DO $expected$
        BEGIN
          {body}
          RAISE EXCEPTION 'expected refusal was not observed' USING ERRCODE='P0001';
        EXCEPTION WHEN SQLSTATE '{state}' THEN
          NULL;
        END;
        $expected$;
        """
        result = self.session_sql(wrapped, context=context, require_success=False)
        self.check(label, result.returncode == 0, expected_sqlstate=state)

    def reserve_call(self, command, document, hash_hex=None, byte_size=18):
        hash_hex = hash_hex or self.hash_hex
        return f"""
        SELECT aso.reserve_document_upload_staging(
          '{command}','{document}','{self.case}',1,0,
          'policy-document','Synthetic upload','2026-03-01','text/plain',
          {byte_size},decode('{hash_hex}','hex'),NULL)::text;
        """

    def exercise_transaction(self):
        self.mark("web04_document_upload_schema_and_functions")
        case_state = json.loads(self.sql(self.name, f"""
          SELECT jsonb_build_object(
            'caseInputRevision',case_input_revision,
            'documentSetRevision',document_set_revision)::text
          FROM aso.cases WHERE id='{self.case}';
        """).stdout.strip())
        self.check(
            "migration_adds_initial_document_revision_tokens",
            case_state == {"caseInputRevision": 1, "documentSetRevision": 0},
            observed=case_state,
        )

        staged_text = self.session_sql(
            self.reserve_call(self.command, self.document)
        ).stdout.splitlines()[-1]
        staged = json.loads(staged_text)
        expected_key = (
            f"documents/{self.home}/{self.document}/{self.hash_hex}"
        )
        self.check(
            "authorized_reservation_binds_server_storage_identity",
            staged["state"] == "staged"
            and staged["commandId"] == self.command
            and staged["stagingId"] == self.command
            and staged["documentId"] == self.document
            and staged["storageKey"] == expected_key,
            observed=staged,
        )
        self.check(
            "reservation_retry_is_idempotent",
            self.session_sql(self.reserve_call(self.command, self.document))
            .stdout.splitlines()[-1]
            == staged_text,
        )

        self.expect_sqlstate(
            "same_command_different_hash_is_conflict",
            self.reserve_call(self.command, self.document, hash_hex="cd" * 32),
            "23505",
        )
        self.expect_sqlstate(
            "oversized_upload_is_refused_before_staging",
            self.reserve_call(
                str(uuid.uuid4()), str(uuid.uuid4()), byte_size=16777217
            ),
            "22023",
        )
        self.expect_sqlstate(
            "foreign_practice_case_is_refused",
            self.reserve_call(str(uuid.uuid4()), str(uuid.uuid4())),
            "42501",
            context="foreign",
        )
        self.expect_sqlstate(
            "administrator_without_document_upload_is_refused",
            self.reserve_call(str(uuid.uuid4()), str(uuid.uuid4())),
            "42501",
            context="admin",
        )

        rollback = self.session_sql(f"""
          DO $rollback$
          BEGIN
            PERFORM aso.commit_document_upload_command(
              '{self.command}','{self.command}');
            RAISE EXCEPTION 'synthetic rollback' USING ERRCODE='P0001';
          EXCEPTION WHEN SQLSTATE 'P0001' THEN
            NULL;
          END;
          $rollback$;
        """, require_success=False)
        self.check(
            "rollback_control_executes",
            rollback.returncode == 0,
            database_error=[
                line for line in rollback.stderr.splitlines()
                if "ERROR:" in line or "DETAIL:" in line or "CONTEXT:" in line
            ][-6:],
        )
        rollback_state = json.loads(self.sql(self.name, f"""
          SELECT jsonb_build_object(
            'documentCount',(SELECT count(*) FROM aso.documents
              WHERE id='{self.document}'),
            'commandCount',(SELECT count(*) FROM aso.document_upload_commands
              WHERE command_id='{self.command}'),
            'stagingCount',(SELECT count(*) FROM aso.document_upload_staging
              WHERE command_id='{self.command}'))::text;
        """).stdout.strip())
        self.check(
            "rolled_back_commit_leaves_no_partial_ready_metadata",
            rollback.returncode == 0
            and rollback_state
            == {"documentCount": 0, "commandCount": 0, "stagingCount": 1},
            observed=rollback_state,
        )

        receipt_text = self.session_sql(f"""
          SELECT aso.commit_document_upload_command(
            '{self.command}','{self.command}')::text;
        """).stdout.splitlines()[-1]
        receipt = json.loads(receipt_text)
        stored = json.loads(self.sql(self.name, f"""
          SELECT jsonb_build_object(
            'processingStatus',processing_status,
            'storageKey',storage_uri,
            'contentSha256',encode(content_sha256,'hex'),
            'byteSize',byte_size,
            'mediaType',media_type,
            'pageCount',page_count,
            'documentVersion',document_version,
            'revision',revision)::text
          FROM aso.documents WHERE id='{self.document}';
        """).stdout.strip())
        post_commit = json.loads(self.sql(self.name, f"""
          SELECT jsonb_build_object(
            'stagingCount',(SELECT count(*) FROM aso.document_upload_staging
              WHERE command_id='{self.command}'),
            'commandCount',(SELECT count(*) FROM aso.document_upload_commands
              WHERE command_id='{self.command}'),
            'documentSetRevision',(SELECT document_set_revision FROM aso.cases
              WHERE id='{self.case}'))::text;
        """).stdout.strip())
        self.check(
            "commit_atomically_persists_queued_metadata_and_receipt",
            set(receipt) == {
                "commandId", "action", "caseId", "documentId", "committedAt"
            }
            and receipt["action"] == "upload"
            and receipt["documentId"] == self.document
            and stored == {
                "processingStatus": "queued",
                "storageKey": expected_key,
                "contentSha256": self.hash_hex,
                "byteSize": 18,
                "mediaType": "text/plain",
                "pageCount": None,
                "documentVersion": 1,
                "revision": 1,
            }
            and post_commit
            == {"stagingCount": 0, "commandCount": 1, "documentSetRevision": 0},
            receipt=receipt,
            stored=stored,
            post_commit=post_commit,
        )
        self.check(
            "lost_commit_response_reconciles_exact_receipt",
            self.session_sql(f"""
              SELECT aso.commit_document_upload_command(
                '{self.command}','{self.command}')::text;
            """).stdout.splitlines()[-1]
            == receipt_text
            and self.session_sql(f"""
              SELECT aso.lookup_document_upload_command(
                '{self.case}','{self.command}')::text;
            """).stdout.splitlines()[-1]
            == receipt_text,
        )
        metadata = json.loads(self.session_sql(f"""
          SELECT aso.read_case_document_metadata(
            '{self.case}','{self.document}')::text;
        """).stdout.splitlines()[-1])
        self.check(
            "authorized_metadata_read_excludes_storage_key_and_bytes",
            metadata["id"] == self.document
            and metadata["processingStatus"] == "queued"
            and "storageKey" not in metadata
            and "bytes" not in metadata,
            keys=sorted(metadata),
        )

        cleanup_staged = json.loads(self.session_sql(
            self.reserve_call(self.cleanup_command, self.cleanup_document)
        ).stdout.splitlines()[-1])
        removed_key = self.session_sql(f"""
          SELECT aso.abandon_document_upload_staging(
            '{self.cleanup_command}','{self.cleanup_command}');
        """).stdout.splitlines()[-1]
        cleanup_state = json.loads(self.sql(self.name, f"""
          SELECT jsonb_build_object(
            'stagingCount',(SELECT count(*) FROM aso.document_upload_staging
              WHERE command_id='{self.cleanup_command}'),
            'documentCount',(SELECT count(*) FROM aso.documents
              WHERE id='{self.cleanup_document}'),
            'commandCount',(SELECT count(*) FROM aso.document_upload_commands
              WHERE command_id='{self.cleanup_command}'))::text;
        """).stdout.strip())
        self.check(
            "abandon_returns_exact_storage_key_and_removes_pending_state",
            removed_key == cleanup_staged["storageKey"]
            and cleanup_state
            == {"stagingCount": 0, "documentCount": 0, "commandCount": 0},
            observed=cleanup_state,
        )

        grants = json.loads(self.sql(self.name, """
          SELECT jsonb_build_object(
            'migrationRecorded',EXISTS(
              SELECT FROM public._sqlx_migrations
              WHERE version=2026090620 AND success),
            'stagingRls',(SELECT relrowsecurity FROM pg_class
              WHERE oid='aso.document_upload_staging'::regclass),
            'commandsRls',(SELECT relrowsecurity FROM pg_class
              WHERE oid='aso.document_upload_commands'::regclass),
            'executorDocumentInsert',has_table_privilege(
              'aso_case_executor','aso.documents','INSERT'),
            'executorStagingWrite',has_table_privilege(
              'aso_case_executor','aso.document_upload_staging','INSERT,DELETE'),
            'executorCommandRead',has_table_privilege(
              'aso_case_executor','aso.document_upload_commands','SELECT'),
            'humanProcessorGrants',(SELECT count(*) FROM aso.role_capabilities rc
              JOIN aso.roles r ON r.id=rc.role_id
              WHERE rc.capability_key='document_process'),
            'publishedLocalTables',EXISTS(
              SELECT FROM pg_publication_rel publication
              WHERE publication.prrelid IN (
                'aso.document_upload_staging'::regclass,
                'aso.document_upload_commands'::regclass)))::text;
        """).stdout.strip())
        self.check(
            "least_privilege_local_tables_and_processor_boundary",
            grants == {
                "migrationRecorded": True,
                "stagingRls": True,
                "commandsRls": True,
                "executorDocumentInsert": False,
                "executorStagingWrite": False,
                "executorCommandRead": False,
                "humanProcessorGrants": 0,
                "publishedLocalTables": False,
            },
            observed=grants,
        )

    def run(self):
        return super().run()


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
    lock_path = Path(tempfile.gettempdir()) / "aso-web04-document-upload-schema.lock"
    with open(lock_path, "a") as lock:
        import fcntl

        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("Web-04 upload schema probe: another fixture is running", file=sys.stderr)
            return 1
        return DocumentUploadSchemaProbe(args).run()


if __name__ == "__main__":
    sys.exit(main())
