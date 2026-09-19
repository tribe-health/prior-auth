# Web-04 task 1.1 — eligibility and ownership

Date: 2026-09-18

Phase: `runtime-architecture › web-case-to-letter`

Change: `web-04-document-upload-core`

Task: `1.1`

Result: **Passed**

## Dependency and canonical position

- `web-03-administering-entity-resolution` is canonically `complete` with its
  duplicate `2.1` task cancelled and its six planned tasks complete. Its
  OpenSpec change is archived at
  `openspec/changes/archive/2026-09-18-web-03-administering-entity-resolution`.
- Web-01 already supplies durable verified case commands and full authorized
  case reads. Web-02 supplies the mounted queue, intake, and detail routes.
  Web-03 supplies the current administering-entity resolution consumed later
  by criteria selection. No unfinished dependency prevents Web-04.
- `openspec validate web-04-document-upload-core --strict` exited zero and
  printed `Change 'web-04-document-upload-core' is valid`.
- KBD started this exact task as ordinal 1 of 6 at revision 1614. Web-04 is the
  active change and later Web-04 tasks remain pending.
- The child scope denies `desktop/**` and `mobile/**`. Browser HTTP is the only
  delivery surface eligible in this change. Reserved Tauri wrappers remain
  deferred until Web-17 browser certification passes.

## Frozen Web-00 contract

The capability is `document_upload`, available to a verified coordinator or
surgeon user. Gate, shell-neutral `AppServices`, and a tenant-scoped PostgreSQL
command function must enforce the operation independently. `document_process`
is a separate narrow internal capability owned by Web-05 and is not granted to
human roles.

The mounted Web-04 browser contract is:

- `POST /api/cases/{caseId}/documents`
- `GET /api/cases/{caseId}/documents/{documentId}`
- `GET /api/cases/{caseId}/document-commands/{commandId}`

The command uses a stable command ID and the current case-input and document-set
revision tokens. A lost response is reconciled beneath the known parent case.
Reusing a command ID with different metadata, bytes, or revision inputs is a
`command_conflict`; a stale expected revision is `stale_revision`.

The fixed upload errors are:

| HTTP | Code | Required effect |
|---:|---|---|
| 401 | `session_required` | Commit nothing. |
| 403 | `action_forbidden` | Commit nothing. |
| 404 | `resource_not_found` | Do not disclose a foreign-practice case. |
| 409 | `command_conflict` | Preserve the first command result only. |
| 409 | `stale_revision` | Leave bytes and metadata uncommitted. |
| 413 | `document_too_large` | Keep the file uncommitted. |
| 415 | `document_type_unsupported` | Accept only a supported PDF or text document. |
| 422 | `document_integrity_failed` | Remove failed staging and publish no ready record. |

The existing source-read boundary fixes the per-document maximum at
`MAX_DOCUMENT_SOURCE_BYTES = 16 * 1024 * 1024`. Upload must use the same bound
unless the frozen contract is deliberately revised before implementation.
Bytes, full extracted page text, upload staging, command ledgers, parser
diagnostics containing source text, and audit payloads outside an approved view
never enter a replica shape. Unknown data defaults to `local` and is refused at
the publication boundary.

The positive fixture families already reserve case-scoped upload command IDs,
document identities, content SHA-256 values, document types, effective dates,
case-input revisions, and document-set revisions. The focused fixture verifier
passed all eleven checks, including three standalone positive families, four
isolated negative controls, 96 disjoint command IDs, continuous revision
ownership, exact claim provenance, deterministic administering-entity states,
and manifest-lock hashes.

## Storage and transaction boundary

The existing `LocalDocumentStore` is read-only and already refuses absolute
paths, parent traversal, empty keys, objects outside its canonical root, empty
objects, and objects above 16 MiB. Web-04 may extend this adapter with bounded
staging and immutable commit behavior; it must preserve those read controls.

The observable atomicity rule is that a ready document record never refers to
missing or unverified bytes, and rejected or rolled-back commands leave no
ready metadata. Because filesystem and PostgreSQL do not share one transaction,
the implementation must stage and hash bytes before the restricted database
commit, publish only an immutable verified storage identity, and clean
unreferenced staging after a failed or replayed command. Task 1.2 owns the
durable schema and command function. Task 1.3 owns the bounded store protocol
and orchestration that proves restart, conflict, and cleanup behavior.

## Decision gates

| Gate | Eligibility result | Binding consequence |
|---|---|---|
| G-PIN | Satisfied | Axum 0.8.8, Tokio, SHA-256, SQLx, and existing workspace dependencies cover the change. Task 1.4 may enable Axum's pinned `multipart` feature; no package-version or `versions.toml` change is planned. |
| G-SYNC | Not required for Web-04 publication | The blocked PGlite materializer does not prevent server-side upload. Web-04 publishes no bytes, page text, staging state, or new replica row. Web-05 owns the reviewed document-status projection. |
| G-DATA | Satisfied for server-authoritative storage only | Document bytes and staging stay inside the practice boundary and outside browser replication. Durable metadata remains tenant scoped in Postgres. |
| G-REV | Satisfied | Every upload and read uses the current verified session, selected practice, target authorization, and command-time capability check. Revoked or stale authority cannot be recovered from a receipt. |
| G-NATIVE | Not applicable | Tauri commands, native SQLite, Flutter, and device work are outside scope and remain deferred through Web-17. |

The no-query-cache rule remains binding. This core change adds no React domain
state. Web-05 will consume committed document status through the entity graph
and keep only transient upload interaction state in a scoped Zustand store.

## Assigned ownership for remaining Web-04 tasks

Task 1.2 owns the additive durable schema and least-privilege transaction:

- collision-checked migration `migrations/server/2026090620_document_upload_schema.sql`
- `crates/aso-web-server/src/migrations.rs`
- the Web-04 sections of `docs/design/schema/schema-web-case-to-letter.sql`
  and focused executable checks
- the existing Web-00 fixture manifests and verifier only where the schema
  needs a directly loadable Web-04 representation
- focused fresh-install and populated-upgrade probes

Task 1.3 owns the shell-neutral upload model/service and bounded storage
orchestration:

- a feature module under `crates/aso-host/src/` plus the existing `lib.rs` and
  `ports/mod.rs` composition points
- `crates/aso-web-server/src/adapters/document_store.rs`
- the PostgreSQL adapter and production composition under
  `crates/aso-web-server/src/adapters/` and `main.rs`
- focused hash, type, size, page, idempotency, restart, conflict, and cleanup
  tests against synthetic content only

Task 1.4 owns the browser HTTP boundary:

- a document route module and focused tests under
  `crates/aso-server-axum/src/routes/`
- the existing workspace/Axum manifests only as needed to enable the pinned
  Axum `multipart` feature
- the existing Axum route composition and production body-limit configuration
- multipart parsing, exact frozen error mapping, tenant refusal, command
  lookup, metadata read, and log-capture proof that source content is absent

Web-04 does not own a React upload surface. Web-05 mounts upload and processing
status UI after the durable HTTP contract exists. The shared worktree contains
accumulated edits in central host, adapter, route, schema, and composition
files; every task must preserve them and keep a single writer per Rust target.

## Limits at this boundary

No product source, schema, fixture, dependency, pin, Tauri, or mobile file
changed in task 1.1. The web application still cannot upload a document through
the mounted browser route, and the full case-to-letter scenario remains
unavailable. Tasks 1.2 through 1.4 must implement the durable upload boundary;
Web-05 through Web-17 must still process documents, load criteria, assemble
evidence, generate both letter families, and certify the actual browser flow.

The uncomfortable fact is that the existing read-only document store can open
authorized source bytes but cannot accept or atomically commit a new upload.
Eligibility evidence does not make document ingestion functional.

## Observed verification

`openspec validate web-04-document-upload-core --strict` exited zero:

```text
Change 'web-04-document-upload-core' is valid
```

`python3 docs/architecture/fixtures/web-case-to-letter/verify.py` exited zero
and printed eleven `Passed:` lines. KBD started task 1 of 6 at revision 1614.

No implementation test or broad integration command ran. This is an
eligibility task. Focused implementation verification begins with task 1.2;
full local-stack and actual-browser certification remains reserved for Web-17.
