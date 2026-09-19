#!/usr/bin/env python3
"""Mounted Axum, AppServices, PostgreSQL, and DocumentStore proof for Web-04."""

import importlib.util
import os
from pathlib import Path
import sys
import tempfile


ROOT = Path(__file__).resolve().parents[1]
SERVICE_PROBE = ROOT / "scripts/test-web04-document-upload-service.py"


def load_service_probe():
    spec = importlib.util.spec_from_file_location("web04_service_probe", SERVICE_PROBE)
    if spec is None or spec.loader is None:
        raise RuntimeError("document_upload_service_probe_unavailable")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


service = load_service_probe()
service.schema.base.SOURCE_FILES = service.schema.base.SOURCE_FILES + (
    "crates/aso-server-axum/src/lib.rs",
    "crates/aso-server-axum/src/routes/mod.rs",
    "crates/aso-server-axum/src/routes/documents.rs",
    "crates/aso-server-axum/src/routes/documents/tests.rs",
    "crates/aso-server-axum/src/routes/gate.rs",
    "scripts/test-web04-document-upload-http.py",
)


class DocumentUploadHttpProbe(service.DocumentUploadServiceProbe):
    test_command = [
        os.environ.get("RA06_TOOL_CARGO", "cargo"),
        "test",
        "-p",
        "aso-web-server",
        "adapters::gate::upload_transaction_tests::document_upload_http_lifecycle",
        "--",
        "--ignored",
        "--exact",
        "--nocapture",
    ]
    expected_markers = [
        "document_upload_transaction_check: mounted_http_upload_read_lookup_and_gate",
        "document_upload_transaction_check: mounted_http_retry_conflict_and_integrity_refusal",
        "document_upload_transaction_check: mounted_http_anonymous_and_foreign_tenant_refusal",
    ]
    process_label = "actual_mounted_document_upload_http_lifecycle"

    def __init__(self, args):
        super().__init__(args)
        self.report["commands"][0] = (
            "python3 scripts/test-web04-document-upload-http.py "
            f"--install-mode {self.install_mode} --output {self.output}"
        )
        self.report["scope"] = (
            "Actual mounted Axum multipart route, verified session, AppServices, "
            "restricted PostgreSQL functions, and local DocumentStore upload, "
            "read, lookup, Gate authorization, retry, conflict, integrity, "
            "anonymous, tenant, temporary-object, and PHI-log behavior"
        )
        self.report["unverified"] = [
            "React upload/status UI, document processing and extraction, actual browser, Tauri, and mobile are outside Web-04 task 1.4."
        ]

    def exercise_transaction(self):
        super().exercise_transaction()
        self.report["checks"]["actual_mounted_http_store_database_lifecycle"] = (
            self.report["checks"].pop("actual_service_store_database_lifecycle")
        )


if __name__ == "__main__":
    import fcntl

    lock_path = Path(tempfile.gettempdir()) / "aso-web04-document-upload-service.lock"
    with open(lock_path, "a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("Web-04 upload HTTP probe: another fixture is running", file=sys.stderr)
            sys.exit(1)
        sys.exit(DocumentUploadHttpProbe(service.parse_args()).run())
