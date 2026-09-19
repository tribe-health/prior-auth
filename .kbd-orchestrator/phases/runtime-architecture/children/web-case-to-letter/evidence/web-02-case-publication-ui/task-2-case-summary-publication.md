# Web-02 task 1.2 — case-summary publication

Date: 2026-09-17  
Phase: `runtime-architecture › web-case-to-letter`  
Change: `web-02-case-publication-ui`  
Task: `1.2`  
Result: **Passed**

## Delivered contract

Projection revision 4 extends the existing `aso.cases` shape, `Case` PEM
entity, and `replica:cases` identifier list. The exact published columns are:

`id, practice_id, case_number, patient_id, surgeon_id, coordinator_id,
payer_id, status, date_of_service, gate_affirmed_at, updated_at, revision`.

The server-owned grant binds the row to `practice_id = verified practice`, an
authorization revision, the originating session, and grant expiry. The frozen
publication matrix classifies it as server-authoritative relational `trusted
PHI`; practice/session/authorization change destroys the replica generation.

The FRF catalog, browser shape request, PGlite revision-6 migration, generic
materializer target, and PEM table/list bindings now carry that same exact
contract. The browser storage generation advances to 4, so the additive
revision-6 migration runs in a fresh identity/session/practice-qualified
namespace instead of rewriting the immutable generation-3 base migration.

The local schema excludes `member_id`, `facility_id`, `procedure_code`,
`plan_key`, arbitrary `data`, `gate_affirmed_by`, command revision tokens, and
`created_at`. A real PGlite test passed an over-wide synthetic transport row
through `writeChunk`; `SELECT *` returned only the twelve approved columns and
the expected `Case` / `replica:cases` bindings.

## Cross-repository revision dependency

Task 1.1 said no companion source was assigned. Inspection during task 1.2
found that FRF compiles the accepted ASO projection revision into
`frf-ports::identity::ASO_PROJECTION_REVISION`. Leaving it at 3 made FRF reject
the revision-4 grant before resolving a shape. The bounded companion update is
therefore required by the already-approved production caller chain, not a new
feature or native-platform change.

Changed companion files:

- `/Users/gqadonis/Projects/prometheus/flint-realtime-fabric/crates/frf-ports/src/identity.rs`
- `/Users/gqadonis/Projects/prometheus/flint-realtime-fabric/crates/frf-gateway/tests/shape_projection_grant.rs`

No desktop or mobile source changed.

## Observed verification

TypeScript T0:

```text
pnpm --dir web typecheck
$ tsc --noEmit

pnpm --dir web lint
$ oxlint
```

Focused browser publication suite:

```text
pnpm --dir web exec vitest run \
  src/shared/sync/pglite-schema.test.ts \
  src/shared/sync/catalog-conformance.test.ts \
  src/shared/sync/case-summary-materialization.test.ts \
  src/shared/sync/replica-wiring.test.ts \
  src/app/providers/graph-provider-startup.test.tsx \
  src/app/providers/graph-storage-key.test.ts --maxWorkers=1

Test Files  6 passed (6)
Tests       28 passed (28)
```

Host registry and mounted grant:

```text
cargo fmt --check -p aso-host -p aso-server-axum && \
cargo test -p aso-host projection::tests && \
cargo test -p aso-server-axum session::tests::mounted_registry_derives_two_practice_grants

projection::tests: 3 passed, 0 failed
mounted_registry_derives_two_practice_grants: 1 passed, 0 failed
```

FRF feature-enabled gateway boundary:

```text
cargo fmt --check --all && \
cargo test -p frf-gateway --features shape-facade --test shape_projection_grant

running 3 tests
... 3 passed; 0 failed
```

The first meaningful FRF run produced 2 passed and 1 failed because the
authorized-route assertion still expected the revision-3 six-column list. The
facade had returned the correct revision-4 twelve-column list. Updating that
assertion and rerunning produced 3/3. An earlier default-feature command that
selected zero tests is deliberately not counted as behavioral evidence.

`python3 -m py_compile` passed for all six updated local integration fixtures.
No current script still hard-codes projection revision 3. `git diff --check`
passed for the task files. `openspec validate web-02-case-publication-ui
--strict` exited zero and printed:

```text
Change 'web-02-case-publication-ui' is valid
```

## Claim limits and remaining Web-02 work

This is focused synthetic, memory-only qualification. The measured browser RSS
gate still blocks production adoption of the internal materializer, and G-DATA
still blocks durable real-clinical browser persistence. Reload recovery must
come from the committed server source.

Task 1.3 still owns case selectors and independent per-view Zustand state.
Task 1.4 still owns the queue/detail/intake React views. Task 2.1 owns the
foreign-practice sabotage and review gates. Task 3.1 owns architecture/spec
reconciliation and final change evidence. No browser usability or complete
case-to-letter claim is made here.
