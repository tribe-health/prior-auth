# Web-04 task 1.3 — bounded ingestion service and document store

Date: 2026-09-18

Phase: `runtime-architecture › web-case-to-letter`

Change: `web-04-document-upload-core`

Task: `1.3`

Result: **Passed**

## Delivered boundary

- Added shell-neutral document upload commands, metadata, receipts, error
  types, and `AppServices` operations. Verified user context and
  `document_upload` are required for mutation; metadata read separately
  requires `case:read`.
- Added default-deny `EvidenceRepository` upload/read/lookup ports and the
  restricted PostgreSQL implementation.
- Extended `LocalDocumentStore` with content-addressed verified writes and
  digest-guarded deletion. Writes use a mode-0600 temporary file, fsync the
  object and parent, publish without overwriting, verify the final digest, and
  remove temporary objects.
- Bounded uploads at 16 MiB and 500 pages. Accepted types are parseable,
  unencrypted PDF and nonempty UTF-8 plain text without NUL bytes. The exact
  caller digest is verified before repository access.
- Reconciled uncertain database commits by command lookup before cleanup.
  Exact restart retries return the durable receipt and verify or restore the
  same object. Known refusals abandon staging and delete only matching bytes.
- Pinned `lopdf` 0.45.0 in the workspace and `versions.toml` for bounded PDF
  structure inspection.
- Recorded these limits and transaction rules in the frozen browser
  architecture contract. Multipart HTTP remains task 1.4; upload/status React
  UI remains Web-05.

## Observed verification

The final fresh and populated-upgrade receipts are
`task-3-fresh-service.json` and `task-3-upgrade-service.json`. Both report
`result: Passed` and contain final source hashes. Each executed the actual
`AppServices → restricted PostgreSQL → LocalDocumentStore` path and proved:

- durable bytes plus queued metadata, followed by process restart;
- exact idempotent retry and durable command lookup;
- changed-payload command conflict;
- byte and page bounds, MIME/container mismatch, and digest refusal;
- foreign-practice, missing-capability, and expired-session refusal;
- migration rerun, checksum tamper refusal/restoration, and populated upgrade;
- no direct executor table write, no human processor grant, and no publication
  of local staging or command tables;
- cleanup of disposable databases, logins, and temporary upload objects; and
- absence of the synthetic uploaded text from captured output.

Focused store tests ended with:

```text
test result: ok. 4 passed; 0 failed; 0 ignored; 0 measured; 24 filtered out
```

Focused PDF inspection tests ended with:

```text
test result: ok. 2 passed; 0 failed; 0 ignored; 0 measured; 26 filtered out
```

The final closeout commands exited zero:

```text
RUSTUP_TOOLCHAIN=1.97.1 cargo fmt --all -- --check
RUSTUP_TOOLCHAIN=1.97.1 cargo check -p aso-host
RUSTUP_TOOLCHAIN=1.97.1 cargo check -p aso-web-server --tests
RUSTUP_TOOLCHAIN=1.97.1 cargo clippy -p aso-host -p aso-web-server --no-deps
openspec validate web-04-document-upload-core --strict
python3 -m py_compile scripts/test-web04-document-upload-service.py
git diff --check -- <Web-04 task 1.3 files>
```

OpenSpec printed:

```text
Change 'web-04-document-upload-core' is valid
```

## Red-green corrections

Retained receipt `task-3-fresh-service-failed-harness-args.json` records a
probe-only missing CLI argument discovered before product execution. Retained
receipt `task-3-fresh-service-failed-product-path.json` records the actual
service failure: the restricted login lacked the gate executor role required
by the shared repository constructor, and the database MIME value did not
match the enum wire name. The restricted fixture now receives both executor
roles while remaining owner-free, and MIME enums serialize as their canonical
media types. The final fresh and upgrade runs passed.

The first parallel store-test closeout failed 2 of 4 tests because timestamped
temporary roots collided under concurrent Tokio startup. Replacing the fixture
suffix with a UUID produced the observed 4-of-4 green result. This changes test
isolation only; product storage keys and behavior are unchanged.

## Guard provenance and limits

Every product guard traces to the untrusted upload boundary or an observed
failure: byte/page/type/parser/digest checks bound hostile input; canonical
paths and immutable content identity protect local storage; tenant, capability,
principal, and session checks protect clinical records; revision and receipt
checks preserve idempotency; uncertain-commit lookup prevents deletion after a
successful commit; PHI-free capture prevents source text from entering logs.
The UUID fixture guard traces to the observed parallel-test collision.

No unrelated product behavior was added. Multipart HTTP, React upload and
processing status, extraction/page maps, replica publication, the complete
case-to-letter flow, and actual-browser certification remain unverified and
assigned to task 1.4 and Web-05 through Web-17. No Tauri or mobile source
changed. The web application is therefore not yet ready for the complete
scenario.
