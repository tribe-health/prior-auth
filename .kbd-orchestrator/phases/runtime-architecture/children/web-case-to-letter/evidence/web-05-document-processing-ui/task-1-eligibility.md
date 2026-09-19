# Web-05 task 1.1 — eligibility and ownership

Date: 2026-09-18

Phase: `runtime-architecture › web-case-to-letter`

Change: `web-05-document-processing-ui`

Task: `1.1`

Result: **Passed**

## Dependency and canonical position

- `web-04-document-upload-core` is complete and archived at
  `openspec/changes/archive/2026-09-18-web-04-document-upload-core`. Its
  canonical specification is `openspec/specs/document-upload-core/spec.md`.
  The mounted Axum upload, metadata-read, and uncertain-command lookup routes
  have passed their focused local integration checks.
- The child progress projection records five of eighteen changes complete,
  `web-05-document-processing-ui` in progress, and task 1 of 6 active with no
  blocker. The generated task ledger also marks this exact task
  `IN_PROGRESS`.
- The root waypoint projection still reports the child as ready with no active
  change and an obsolete next command even though `position.json`, the child
  progress projection, the task ledger, and the before-task hook identify
  Web-05 task 1. This generated summary mismatch is retained as an
  orchestrator defect; it does not change the ordered child plan or authorize
  work outside Web-05.
- `openspec validate web-05-document-processing-ui --strict` exited zero and
  printed `Change 'web-05-document-processing-ui' is valid`.
- The Web-00 fixture verifier exited zero with eleven `Passed:` checks,
  including the positive and negative fixture families, disjoint command
  identities, revision ownership, exact claim provenance, synthetic-only
  labels, and locked manifest hashes.
- The child scope keeps Tauri and mobile deferred. Browser HTTP and the React
  web application are the only delivery surfaces eligible in this change.

## Frozen Web-00 contract

The human upload capability is `document_upload`. `document_process` is a
separate internal capability that remains unassigned to every human role. The
frozen fixture principal is `Synthetic Document Processor`, with principal
type `service` and job grant `authorized_document_job_only`. The React UI may
upload a document and observe processing state; it must never receive or invoke
the processor capability as the signed-in human.

The processing command boundary is:

- `POST /api/cases/{caseId}/documents/{documentId}/process`
- `GET /api/cases/{caseId}/documents/{documentId}/commands/{commandId}`
- shell-neutral methods `process_case_document` and
  `lookup_document_process_command`

The processing service owns deterministic `queued`, `processing`, `ready`, and
`failed` transitions, one committed result for an idempotent retry, canonical
page ordering, page-addressable text hashes, and the final `page_count`.
Command execution must recheck the verified practice, job grant, target,
authorization revision, document identity, and current document generation.

The frozen processing error is HTTP 422 `document_processing_failed` with the
exact user copy:

> This document could not be processed. Review the file and try again.

Logs may retain a bounded failure code and correlation identity. They may not
contain uploaded bytes, extracted text, chunks, or embeddings.

## Data and publication boundary

Extracted source text, page bodies, chunks, embeddings, upload staging,
processor diagnostics containing source content, command ledgers, and raw
provider responses are local data and are structurally absent from every
browser shape. An embedding of local chart text remains local PHI. Unknown
fields default to local and publication refuses them.

Web-05 owns one explicit trusted-PHI publication relation,
`document_statuses`, with exactly these approved columns:

`id, case_id, document_type_id, name, effective_date, content_sha256_text, page_count, processing_status, processing_error_code, updated_at, revision`

Tenant scope is derived by joining the document's case practice to the
verified selected practice. A document mutation, session revocation, practice
change, or authority-generation change replaces the prior generation before a
row can be rendered.

The current projection registry, Electric shape contract, PGlite schema, and
bootstrap view still expose the older `documents` relation. They do not yet
implement the frozen `document_statuses` contract. Task 1.3 must add the
explicit reviewed status relation and update the projection revision; it must
not widen the existing raw document table or publish processor-local columns.

## Decision gates

| Gate | Eligibility result | Binding consequence |
|---|---|---|
| G-PIN | Satisfied | Existing exact pins cover the work: `lopdf` 0.45.0 and PEM core/React `4.0.3-ra11c.1.g071b9e5.sbb3dc7729aa7`. No dependency or `versions.toml` change is planned. A new dependency requires separate official verification and an explicit pin decision. |
| G-SYNC | Eligible for memory-only browser qualification | The approved PEM persistence control permits the current memory-only browser qualification. The RA11c PGlite SQL materializer remains blocked from production adoption after exceeding the fixed 512 MiB incremental RSS limit. Web-05 may prove current-source browser status behavior; it may not claim durable client persistence or production materializer adoption. |
| G-DATA | Satisfied only under the explicit status projection | Source bytes, page text, chunks, embeddings, and detailed diagnostics remain local. Only the frozen `document_statuses` columns may cross the publication boundary. |
| G-REV | Satisfied | Processing and observation use the verified identity, selected practice, session and authorization revisions, target authorization, and document generation. Mutation or revocation replaces the generation rather than reviving cached authority. |
| G-AUTH | Satisfied only through the service job grant | Human users retain `document_upload`; only the internal service principal may hold `document_process`. Retry orchestration must not grant that capability to the browser user. |
| G-NATIVE | Not applicable | Tauri commands, native SQLite, Flutter, and device behavior remain deferred until Web-17 certifies the browser scenario. |

The no-query-cache rule remains binding. Durable document status belongs in
the PEM entity graph. Zustand may hold only view-scoped transient upload,
selection, progress-announcement, and uncertain-request state.

## Assigned ownership for remaining Web-05 tasks

Task 1.2 owns server-side extraction and the durable processing transaction:

- collision-checked migration
  `migrations/server/2026090621_document_processing.sql`
- the Web-05 additions to `crates/aso-web-server/src/migrations.rs` and the
  focused schema fixture/probe
- a shell-neutral processing feature in `crates/aso-host/src/`, composed only
  through the existing `lib.rs` and `ports/mod.rs` boundaries
- a replaceable processor adapter under `crates/aso-web-server/src/adapters/`,
  the existing `document_store.rs`, production composition in `main.rs`, and
  the restricted Gate repository functions
- the existing Axum `routes/documents.rs` command and lookup boundary plus its
  focused route tests

Task 1.3 owns the approved status publication and browser materialization:

- `crates/aso-host/src/projection.rs` and its projection-revision tests
- the collision-checked SQL view and the existing
  `docker/bootstrap/20-electric-sync-views.sql` compatibility definition where
  the local stack consumes that bootstrap
- `docker/flint-gate/config.yaml` only if current configuration inspection
  proves the status shape is declared there
- `web/src/shared/sync/electric-shapes.ts`, `pglite-schema.ts`, replica target
  wiring, and focused publication/materialization tests
- PEM entity registration and selectors for durable status; no Zustand copy of
  the document domain record

Task 1.4 owns the rendered browser workflow:

- a feature directory under `web/src/features/document-processing/` with
  API, model, hook, scoped transient store, and component boundaries matching
  the existing feature organization
- integration into the mounted case intake and detail routes, including the
  current `CaseIntake` placeholder that says document upload is added next
- upload progress, queued/processing/ready/failed presentation, exact frozen
  failure copy, uncertain-command recovery, reload behavior, and authorized
  source preview
- keyboard operation, live status announcements, reduced-motion behavior, and
  responsive adaptation without remounting the feature or losing transient
  selection during resize

Task 2.1 owns focused T0/T1 verification, deliberate forbidden-source-column
sabotage and byte-identical restoration, Artifact Refiner validation, and
fresh-context adversarial review. Task 3.1 owns the completion receipt, caller
inspection, documentation/spec delta, and truthful KBD completion status.

The shared worktree already contains accumulated changes in central host,
server, projection, sync, and route files. Each implementation task must keep
one writer per Rust target and preserve unrelated work.

## Limits at this boundary

No product source, schema, dependency, pin, Tauri, or mobile file changed in
task 1.1. The web application can create a case, resolve its administering
entity, and call the mounted upload service, but it still has no rendered
upload/status feature and cannot process an uploaded document into the
page-addressable evidence required for a letter. Web-06 through Web-17 remain
necessary for criteria, evidence, both letter workflows, the assembled
fixture, and actual-browser certification.

The uncomfortable fact is that Web-05 is eligible for a memory-only browser
implementation while the production PGlite materializer remains blocked on
measured memory use. Passing Web-05 will establish the document-processing UI
boundary; it will not certify persistent offline browser operation or the full
case-to-letter scenario.

## Observed verification

`openspec validate web-05-document-processing-ui --strict` exited zero:

```text
Change 'web-05-document-processing-ui' is valid
```

`python3 docs/architecture/fixtures/web-case-to-letter/verify.py` exited zero
and printed eleven `Passed:` lines. The generated child progress and task
ledger identify Web-05 task 1 as active with no blocker.

No implementation or broad integration command ran. This task records
eligibility and ownership only. Focused implementation verification begins in
task 1.2; full local-stack and actual-browser certification remains reserved
for Web-17.
