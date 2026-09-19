# Web-04 task 1.2 — document upload schema and commit boundary

Date: 2026-09-18

Phase: `runtime-architecture › web-case-to-letter`

Change: `web-04-document-upload-core`

Task: `1.2`

Result: **Passed**

## Delivered boundary

Server migration `2026090620_document_upload_schema.sql` adds:

- `document_upload` for authorized staff and surgeons, plus the internal-only
  `document_process` capability with no human-role grant;
- a monotonic `cases.document_set_revision` token and the `queued`,
  `processing`, `ready`, and `failed` document lifecycle;
- bounded PDF and plain-text metadata with a 16 MiB maximum, SHA-256 storage
  identity, processing status, revision, and commit timestamp;
- tenant-, identity-, actor-, command-, case-, and revision-bound staging;
- immutable, local command receipts excluded from replication;
- least-privilege reserve, commit, abandon, metadata-read, and command-lookup
  functions owned by the non-login `aso_case_owner` role; and
- atomic commit of queued metadata, command receipt, audit event, and staging
  cleanup.

The storage key is server-generated from practice, document, and digest. The
runtime executor has no direct staging write, command-table read, or document
insert privilege. Upload commit leaves `document_set_revision` unchanged;
Web-05 advances it only when a processed document becomes ready.

The migration is registered in the Rust server migration source and the
fresh-schema design document mirrors the durable tables, constraints, local
privacy classification, function signatures, and direct-access restrictions.

## Observed verification

The focused PostgreSQL probe passed against both a fresh database and a
populated upgrade database. The final receipts are
`task-2-fresh-schema.json` and `task-2-upgrade-schema.json`. They prove:

- migration rerun and checksum refusal/restoration;
- initial case and document-set revision tokens;
- server-generated storage identity and exact idempotent reservation;
- command-payload conflict, oversize, foreign-tenant, and missing-capability
  refusal;
- transaction rollback with no partial document or command receipt;
- atomic queued-document commit and staging cleanup;
- lost-response reconciliation through the immutable receipt;
- metadata reads that omit storage key and bytes;
- explicit abandon cleanup; and
- RLS, unpublished local tables, no human processor grant, and no direct
  executor table writes.

Both final receipts report `result: Passed`; their disposable databases and
fixture-created roles were removed.

The focused commands completed with exit code zero:

```text
RUSTUP_TOOLCHAIN=1.97.1 cargo fmt --all -- --check
RUSTUP_TOOLCHAIN=1.97.1 cargo check -p aso-web-server
RUSTUP_TOOLCHAIN=1.97.1 cargo clippy -p aso-web-server --no-deps
python3 -m py_compile scripts/test-web04-document-upload-schema.py
openspec validate web-04-document-upload-core --strict
git diff --check -- migrations/server/2026090620_document_upload_schema.sql crates/aso-web-server/src/migrations.rs scripts/test-web04-document-upload-schema.py docs/design/schema/schema-web-case-to-letter.sql
```

Observed Rust output ended with:

```text
Finished `dev` profile [unoptimized + debuginfo] target(s) in 36.08s
```

OpenSpec printed:

```text
Change 'web-04-document-upload-core' is valid
```

## Red-green corrections

The retained failed receipts record three defects found by the real database
path:

1. `task-2-fresh-schema-failed-permission.json` showed that the non-login owner
   lacked `UPDATE` on staging, which PostgreSQL requires for `SELECT FOR
   UPDATE`. The owner received that exact table privilege; the runtime executor
   still has no direct write.
2. `task-2-fresh-schema-failed-validator-permission.json` showed that the
   existing typed-payload trigger could not call its JSON-schema helper under
   the definer role. The owner received execute access to the two exact
   validator functions.
3. `task-2-upgrade-schema-failed-additive-token.json` showed that the inherited
   legacy comparison treated the intentional additive
   `document_set_revision` column as data mutation. The Web-04 probe excludes
   additive revision tokens from that byte-for-byte comparison and verifies the
   new token separately.

The uncomfortable constraint is that PostgreSQL trigger execution can cross
more privilege boundaries than the outer command function makes visible. A
future document trigger can therefore break the definer path even when direct
table privileges remain correct. The final probe executes the actual insert
under the restricted runtime role so this boundary stays observable.

## Limits

This task proves the schema and durable command functions only. DocumentStore
byte writes, file inspection, page extraction, shell-neutral AppServices
orchestration, multipart browser HTTP, React upload UI, and actual-browser
certification remain tasks 1.3, 1.4, Web-05, and Web-17. No Tauri or mobile
source changed.

Every added guard maps to an observed failure or an existing trust boundary:
size and media checks bound untrusted uploads; tenant and capability checks
protect clinical records; revision checks reject stale case inputs; immutable
receipts protect idempotency; and publication plus privilege checks keep bytes
and local staging state outside the authorized replica.
