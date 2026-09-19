# Web-05 task 1.2 — document processor lifecycle

Date: 2026-09-18
Result: **Passed**

## Delivered boundary

The shell-neutral host exposes an exact service-principal document-processing
command and lookup. The PostgreSQL adapter claims queued documents, reads and
verifies the server-owned source bytes, invokes a replaceable bounded processor,
and atomically commits page-addressable text, SHA-256 hashes, status, page count,
document-set revision, command result, and audit event. Failed extraction commits
one bounded error code without advancing the ready document set. Exact retries
return the original result; a reused command ID with a different payload is a
command conflict.

Extracted text, processing grants, and processing command rows are local PHI or
local authority data. They have RLS enabled, are unavailable to the executor by
direct table access, and are structurally absent from PostgreSQL publications.

## Files changed

- `migrations/server/2026090621_document_processing.sql` adds the local processing
  ledger, page store, narrow service grant, and least-privilege functions.
- `crates/aso-host/src/document_processing.rs`, `crates/aso-host/src/ports/mod.rs`,
  and `crates/aso-host/src/lib.rs` add the host-neutral command, result, errors,
  processor port, and `AppServices` checks.
- `crates/aso-web-server/src/adapters/document_processor.rs` implements bounded
  plain-text and PDF extraction.
- `crates/aso-web-server/src/adapters/gate.rs` owns claim, source verification,
  extraction, failure, completion, and exact retry behavior.
- `crates/aso-web-server/src/migrations.rs` registers the additive migration.
- `crates/aso-server-axum/src/session.rs` and
  `crates/aso-server-axum/src/routes/documents.rs` define the service-only route
  boundary and frozen browser error mapping.
- `crates/aso-web-server/src/adapters/gate/processing_transaction_tests.rs` and
  `scripts/test-web05-document-processing-service.py` provide the real restricted
  role, object-store, processor, and database lifecycle proof.

## Observed verification

Fresh installation:

```text
python3 scripts/test-web05-document-processing-service.py --install-mode fresh \
  --output .../task-2-fresh-service-pass2.json
Result: Passed
actual service lifecycle: 1 passed; 0 failed
```

Populated upgrade:

```text
python3 scripts/test-web05-document-processing-service.py --install-mode upgrade \
  --output .../task-2-upgrade-service-pass.json
Result: Passed
actual service lifecycle: 1 passed; 0 failed
```

Both retained receipts contain these four markers:

```text
queued_processing_ready_and_exact_retry
deterministic_page_text_hashes_and_single_receipt
command_conflict_human_and_missing_job_grant_refusal
processing_failure_is_bounded_idempotent_and_does_not_advance_set
```

Both also report `processing_output_contains_no_source_text: Passed`. The fresh
receipt is `task-2-fresh-service-pass2.json`; the upgrade receipt is
`task-2-upgrade-service-pass.json`.

Focused checks after the final repair:

```text
cargo test -p aso-web-server adapters::document_processor::tests -- --nocapture
2 passed; 0 failed

cargo check -p aso-host -p aso-web-server -p aso-server-axum
Finished dev profile; exit 0

python3 -m py_compile scripts/test-web05-document-processing-service.py
exit 0

cargo fmt --all -- --check
exit 0

openspec validate web-05-document-processing-ui --strict
Change 'web-05-document-processing-ui' is valid

python3 docs/architecture/fixtures/web-case-to-letter/verify.py
Passed: all eleven frozen fixture checks
```

## Observed defects and repairs

The retained failed receipts show the work that changed the result:

- The owner initially lacked the narrow read needed to verify the service actor.
  The migration now grants only the required tables.
- The failure audit initially used an outcome outside the established audit
  vocabulary. It now records `error`.
- The hardened function search path could not resolve pgcrypto `digest`. The
  migration now calls the verified `public.digest(bytea,text)` function.
- A broad `unique_violation` handler caught the deliberate command-conflict
  SQLSTATE and remapped it to a revision conflict. The handler now surrounds only
  command insertion, preserving exact retry identity.

## Remaining work and uncomfortable limitation

The production Kratos adapter classifies Kratos sessions as human users. It does
not mint the service principal required by the processing route. The processor
and restricted store/database path are real and passing, but a production
server-owned dispatcher is not mounted yet. Web-05 task 1.4 and the final Web-05
caller review must connect queued uploads to this port without granting a human
the service job capability.

Document-status projection/materialization remains task 1.3. The responsive
upload/status UI, reload behavior, and production dispatch remain task 1.4.
Focused sabotage/review remains task 2.1, and actual-browser certification
remains Web-17. No Tauri or mobile implementation or verification ran.
