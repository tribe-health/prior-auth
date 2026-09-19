# Web-04 task 1.4 — mounted browser HTTP

Result: **Passed** at Tier 1.

## Delivered boundary

- Enabled Axum 0.8.8 multipart support without changing the version pinned by
  `versions.toml`.
- Mounted browser `POST /api/cases/{case_id}/documents`, document metadata
  `GET`, and uncertain-command `GET` routes in the production API router.
- Parsed the frozen multipart fields with duplicate, unknown, missing,
  per-field, route-body, declared media type, and file-part media type checks.
- Added a read-only, default-deny document target authorization operation used
  by the independent Gate policy before the upload service performs a write.
- Preserved the frozen typed HTTP errors, no-store response policy, tenant
  refusal, minimized receipts, and exclusion of document bytes and storage
  identity from browser responses.
- Exercised the actual mounted router through verified session resolution,
  `AppServices`, restricted PostgreSQL functions, and the local DocumentStore.

## Files

- `Cargo.toml`, `Cargo.lock`: exact Axum multipart feature and `multer` lock.
- `crates/aso-host/src/ports/mod.rs`, `crates/aso-host/src/document_upload.rs`:
  shell-neutral document target authorization.
- `crates/aso-server-axum/src/lib.rs`, `routes/mod.rs`, `routes/documents.rs`,
  `routes/documents/tests.rs`, `routes/gate.rs`: mounted HTTP routes, parser,
  error mapping, Gate classification, and focused tests.
- `crates/aso-web-server/src/adapters/gate.rs` and
  `adapters/gate/upload_transaction_tests.rs`: restricted target authorization
  and actual mounted local integration lifecycle.
- `scripts/test-web04-document-upload-service.py` and
  `scripts/test-web04-document-upload-http.py`: reusable fresh/upgrade probe and
  receipt capture.
- `docs/architecture/web-case-to-letter-contract.md`: exact mounted browser
  route and multipart contract.

## Observed verification

- Fresh actual HTTP integration receipt: `Passed`; one mounted lifecycle test
  passed and emitted all three required upload/read/Gate, retry/conflict/
  integrity, and anonymous/tenant-refusal markers. Uploaded source content did
  not appear in process output; no temporary objects remained.
- Populated-upgrade actual HTTP integration receipt: `Passed` with the same
  mounted lifecycle markers, preservation checks, PHI-output check, and clean
  temporary-object result.
- The first focused route run was red: 4/5 tests passed. The mock repository did
  not parse PDF bytes, so the test incorrectly assigned parser ownership to the
  HTTP boundary. The test was narrowed to the route-owned declared/file-part
  media-type disagreement. The rerun passed 5/5; the subsequent Gate test made
  the final focused document suite 6/6.
- `cargo fmt --all -- --check`: exit 0.
- `cargo check -p aso-host`: exit 0.
- `cargo check -p aso-server-axum --tests`: exit 0.
- `cargo check -p aso-web-server --tests`: exit 0.
- `cargo clippy -p aso-host -p aso-server-axum -p aso-web-server --no-deps`:
  exit 0. It reported the existing large-`Response` result warning pattern,
  including the new route; no lint error occurred.
- `cargo test -p aso-server-axum routes::documents::tests --no-fail-fast`:
  6 passed, 0 failed.
- `cargo test -p aso-server-axum routes::gate::tests --no-fail-fast`:
  15 passed, 0 failed.
- `openspec validate web-04-document-upload-core --strict`: valid.
- Python compilation and scoped `git diff --check`: exit 0.

## Guard provenance and remaining scope

The multipart limits and type checks implement the explicit Web-04 upload
contract. Session, capability, tenant, independent Gate, minimized response,
and PHI-output guards protect existing trust boundaries. No speculative retry,
fallback, or adjacent behavior was added.

React upload/status UI and document processing remain Web-05. The browser
scenario remains uncertified until Web-17. Tauri and mobile remain deferred and
were not changed by this task.
