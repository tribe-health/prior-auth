#!/usr/bin/env python3
"""Local PostgreSQL proof for the Web-05 document-status projection."""

import argparse
import importlib.util
import json
from pathlib import Path
import sys
import tempfile


ROOT = Path(__file__).resolve().parents[1]
PROCESSING_PROBE = ROOT / "scripts/test-web05-document-processing-service.py"


def load_processing_probe():
    spec = importlib.util.spec_from_file_location(
        "web05_processing_probe", PROCESSING_PROBE
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("document_processing_probe_unavailable")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


processing = load_processing_probe()
processing.schema.base.SOURCE_FILES = processing.schema.base.SOURCE_FILES + (
    "migrations/server/2026090622_document_status_projection.sql",
    "crates/aso-host/src/projection.rs",
    "docker/frf/shape-catalog.json",
    "web/src/shared/sync/electric-shapes.ts",
    "web/src/shared/sync/pglite-schema.ts",
    "scripts/test-web05-document-status-projection.py",
)


class DocumentStatusProjectionProbe(processing.DocumentProcessingServiceProbe):
    def __init__(self, args):
        super().__init__(args)
        self.report["commands"][0] = (
            "python3 scripts/test-web05-document-status-projection.py "
            f"--install-mode {self.install_mode} --output {self.output}"
        )
        self.report["scope"] = (
            "Web-05 materialized document status lane, exact public columns, "
            "case-derived practice scope, lifecycle refresh, and structural "
            "exclusion of source text and embeddings"
        )
        self.report["unverified"] = [
            "React upload/status UI and an actual browser scenario are later Web-05 tasks."
        ]

    def exercise_transaction(self):
        super().exercise_transaction()
        self.mark("web05_document_status_projection")

        observed = json.loads(self.sql(self.name, f"""
          SELECT jsonb_build_object(
            'migrationRecorded',EXISTS(
              SELECT FROM public._sqlx_migrations
               WHERE version=2026090622 AND success),
            'scopeMatchesCase',status.practice_id=target_case.practice_id,
            'contentSha256Text',status.content_sha256_text,
            'processingStatus',status.processing_status,
            'processingErrorCode',status.processing_error_code,
            'revisionMatchesSource',status.revision=document.revision,
            'forbiddenColumns',(
              SELECT COALESCE(jsonb_agg(column_name ORDER BY column_name),'[]'::jsonb)
                FROM information_schema.columns
               WHERE table_schema='aso' AND table_name='document_statuses'
                 AND column_name IN (
                   'patient_id','author_name','author_npi','storage_uri','data',
                   'text','text_sha256','embedding','vector')),
            'publicColumns',(
              SELECT jsonb_agg(column_name ORDER BY ordinal_position)
                FROM information_schema.columns
               WHERE table_schema='aso' AND table_name='document_statuses'
                 AND column_name <> 'practice_id'))::text
          FROM aso.document_statuses status
          JOIN aso.documents document ON document.id=status.id
          JOIN aso.cases target_case ON target_case.id=status.case_id
          WHERE status.id='{self.document}';
        """).stdout.strip())

        self.check(
            "document_status_projection_is_exact_scoped_and_lifecycle_current",
            observed == {
                "migrationRecorded": True,
                "scopeMatchesCase": True,
                "contentSha256Text": self.hash_hex,
                "processingStatus": "failed",
                "processingErrorCode": "source_integrity_failed",
                "revisionMatchesSource": True,
                "forbiddenColumns": [],
                "publicColumns": [
                    "id", "case_id", "document_type_id", "name",
                    "effective_date", "content_sha256_text", "page_count",
                    "processing_status", "processing_error_code", "updated_at",
                    "revision",
                ],
            },
            observed=observed,
        )

        boundary = json.loads(self.sql(self.name, """
          SELECT jsonb_build_object(
            'statusRls',(SELECT relrowsecurity FROM pg_class
              WHERE oid='aso.document_statuses'::regclass),
            'pageTextPublished',EXISTS(
              SELECT FROM pg_publication_tables
               WHERE schemaname='aso' AND tablename='document_pages'),
            'embeddingRelationPublished',EXISTS(
              SELECT FROM pg_publication_tables
               WHERE schemaname='aso'
                 AND (tablename ILIKE '%embedding%' OR tablename ILIKE '%vector%')),
            'refreshTrigger',EXISTS(
              SELECT FROM pg_trigger
               WHERE tgrelid='aso.documents'::regclass
                 AND tgname='document_status_projection_refresh'
                 AND NOT tgisinternal))::text;
        """).stdout.strip())
        self.check(
            "source_text_and_embeddings_are_structurally_outside_publication",
            boundary == {
                "statusRls": True,
                "pageTextPublished": False,
                "embeddingRelationPublished": False,
                "refreshTrigger": True,
            },
            observed=boundary,
        )


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--postgres-user", default="flint")
    parser.add_argument("--postgres-port", type=int)
    parser.add_argument("--command-seconds", type=int, default=600)
    parser.add_argument("--install-mode", choices=("fresh", "upgrade"), required=True)
    parser.add_argument("--output", required=True)
    return parser.parse_args()


if __name__ == "__main__":
    import fcntl

    lock_path = Path(tempfile.gettempdir()) / "aso-web05-document-status.lock"
    with open(lock_path, "a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("Web-05 status probe: another fixture is running", file=sys.stderr)
            sys.exit(1)
        sys.exit(DocumentStatusProjectionProbe(parse_args()).run())
