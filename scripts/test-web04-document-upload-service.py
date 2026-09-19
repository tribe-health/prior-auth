#!/usr/bin/env python3
"""Focused AppServices, DocumentStore, and PostgreSQL proof for Web-04."""

import argparse
import importlib.util
import json
import os
from pathlib import Path
import secrets
import sys
import tempfile
import urllib.parse


ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PROBE = ROOT / "scripts/test-web04-document-upload-schema.py"
TEST = [
    os.environ.get("RA06_TOOL_CARGO", "cargo"),
    "test",
    "-p",
    "aso-web-server",
    "adapters::gate::upload_transaction_tests::document_upload_service_lifecycle",
    "--",
    "--ignored",
    "--exact",
    "--nocapture",
]
EXPECTED_MARKERS = [
    "document_upload_transaction_check: durable_bytes_and_queued_metadata_commit",
    "document_upload_transaction_check: restart_retry_and_command_lookup_reconcile",
    "document_upload_transaction_check: authoritative_media_type_reopens_extensionless_object",
    "document_upload_transaction_check: post_write_failure_cleans_object_and_staging_for_retry",
    "document_upload_transaction_check: startup_reconciles_expired_staging_and_object",
    "document_upload_transaction_check: conflict_size_page_type_and_digest_refusals",
    "document_upload_transaction_check: tenant_capability_and_session_refusals",
]


def load_schema_probe():
    spec = importlib.util.spec_from_file_location("web04_schema_probe", SCHEMA_PROBE)
    if spec is None or spec.loader is None:
        raise RuntimeError("document_upload_schema_probe_unavailable")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


schema = load_schema_probe()
schema.base.SOURCE_FILES = schema.base.SOURCE_FILES + (
    "Cargo.toml",
    "Cargo.lock",
    "versions.toml",
    "crates/aso-host/src/document_upload.rs",
    "crates/aso-host/src/ports/mod.rs",
    "crates/aso-web-server/Cargo.toml",
    "crates/aso-web-server/src/adapters/document_store.rs",
    "crates/aso-web-server/src/adapters/gate.rs",
    "crates/aso-web-server/src/adapters/gate/upload_transaction_tests.rs",
    "scripts/test-web04-document-upload-service.py",
)


class DocumentUploadServiceProbe(schema.DocumentUploadSchemaProbe):
    test_command = TEST
    expected_markers = EXPECTED_MARKERS
    process_label = "actual_document_upload_service_lifecycle"

    def __init__(self, args):
        super().__init__(args)
        self.report["commands"][0] = (
            "python3 scripts/test-web04-document-upload-service.py "
            f"--install-mode {self.install_mode} --output {self.output}"
        )
        self.report["scope"] = (
            "Actual AppServices, restricted PostgreSQL functions, and local "
            "DocumentStore upload, restart, idempotency, conflict, byte/page "
            "bounds, type, digest, tenant, capability, and session behavior"
        )
        self.report["unverified"] = [
            "Multipart HTTP, React upload/status UI, document extraction, actual browser, Tauri, and mobile are outside Web-04 task 1.3."
        ]

    def exercise_transaction(self):
        super().exercise_transaction()

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
        role_ok = self.sql(self.name, f"""
            SELECT rolcanlogin
              AND NOT (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication)
              AND pg_has_role(oid,'aso_case_executor','USAGE')
              AND pg_has_role(oid,'aso_gate_executor','USAGE')
              AND NOT pg_has_role(oid,'aso_case_owner','MEMBER')
              AND NOT pg_has_role(oid,'aso_gate_owner','MEMBER')
              AND NOT EXISTS(SELECT FROM pg_namespace WHERE nspowner=oid)
              AND NOT EXISTS(SELECT FROM pg_class WHERE relowner=oid)
              FROM pg_roles WHERE rolname={schema.base.literal(self.login)};
        """).stdout.strip()
        self.check("upload_runtime_login_is_restricted_executor", role_ok == "t")

        parsed = urllib.parse.urlsplit(self.admin_url)
        runtime_url = (
            "postgresql://" + self.login + ":"
            + urllib.parse.quote(password, safe="")
            + "@" + parsed.netloc.rsplit("@", 1)[1] + parsed.path
        )
        actor = self.contexts["A"]
        with tempfile.TemporaryDirectory(prefix="aso-web04-store-") as store_root:
            process_env = os.environ.copy()
            process_env.pop("ASO_MIGRATION_DATABASE_URL", None)
            process_env.pop("ASO_DATABASE_URL", None)
            process_env.update({
                "ASO_TEST_UPLOAD_DATABASE_URL": runtime_url,
                "ASO_TEST_ADMIN_DATABASE_URL": self.admin_url,
                "ASO_TEST_UPLOAD_STORE_ROOT": store_root,
                "ASO_TEST_UPLOAD_CASE_ID": self.case,
                "ASO_TEST_UPLOAD_FOREIGN_CASE_ID": self.foreign_case,
                "ASO_TEST_UPLOAD_CONTEXT": json.dumps({
                    "identity_id": actor["identity_id"],
                    "actor_id": actor["actor_id"],
                    "practice_id": actor["practice_id"],
                }),
                "RUSTUP_TOOLCHAIN": "1.97.1",
            })
            completed, entry = self.run_process(
                self.process_label, self.test_command, process_env
            )
            output = completed.stdout + "\n" + completed.stderr
            markers = [
                line.strip() for line in output.splitlines()
                if line.strip().startswith("document_upload_transaction_check: ")
            ]
            if completed.returncode != 0:
                lines = output.splitlines()
                entry["failure_diagnostics"] = [
                    line.strip()
                    for index, line in enumerate(lines)
                    if "panicked at" in line
                    or (index > 0 and "panicked at" in lines[index - 1])
                ]
            entry["actual_result_output"] = markers + [
                line.strip() for line in output.splitlines()
                if line.strip().startswith("test result:")
            ][-1:]
            self.check(
                "actual_service_store_database_lifecycle",
                completed.returncode == 0 and markers == self.expected_markers,
                return_code=completed.returncode,
                markers=markers,
            )
            self.check(
                "service_output_contains_no_uploaded_content",
                "Synthetic upload page one" not in output
                and "Synthetic foreign upload" not in output
                and "declared bytes" not in output,
            )
            temporary_files = [
                str(path.relative_to(store_root))
                for path in Path(store_root).rglob(".upload-*")
            ]
            self.check(
                "store_leaves_no_temporary_objects",
                not temporary_files,
                temporary_files=temporary_files,
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

    lock_path = Path(tempfile.gettempdir()) / "aso-web04-document-upload-service.lock"
    with open(lock_path, "a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("Web-04 upload service probe: another fixture is running", file=sys.stderr)
            sys.exit(1)
        sys.exit(DocumentUploadServiceProbe(parse_args()).run())
