# Web-03 task 3.1 completion evidence

Result: **Passed** for the focused Web-03 boundary.

## Delivered behavior

Web-03 resolves one administering entity and coverage path from verified,
practice-scoped case inputs. Effective member enrollment, payer plan,
delegation rule, active entity, service date, and source-document version are
authoritative. The server returns `resolved`, `missing`, `ambiguous`,
`conflicting`, or `expired`; only `resolved` permits downstream evidence work.

Entity, plan, enrollment, rule, path, validity, and selected source-document
changes invalidate the affected current resolution and advance its revision.
Resolver-input mutations and resolution use a table-then-case lock order, so
the same rule holds during first resolution and after invalidation when no
current row exists. Future-effective paths are `missing` on the case service
date. Historical windows that never overlap are also `missing` because no
compatible path existed to expire. `expired` is reserved for a compatible path
that already ended. The interface labels `validTo` as exclusive and describes
an ended plan, enrollment, or rule as an expired coverage path.
Immutable command receipts retain the selected entity, criteria set,
submission channel, appeal path, validity interval, source metadata, and input
revisions. The current resolution row retains the same entity, plan,
enrollment, rule, and source-document versions, and the mounted panel renders
them after reload.

The browser retains an uncertain command ID with its expected case-input
revision in session/practice/case-scoped Zustand state. Exact lookup precedes
the current row. A racing 404 reissues the same command idempotently. A
serialized stale or incomplete-input result clears the absent command, reloads
committed state, and preserves the applicable guidance.

If an authoritative input invalidates the current row after a command receipt
commits but before the browser reloads it, the 404 is authoritative absence.
The hook clears the saved command, publishes `unresolved`, and permits a fresh
resolution instead of leaving the case permanently uncertain.

Incomplete authoritative inputs return HTTP `422 case_inputs_incomplete`.
The exact guidance “Complete the member, plan, procedure, and service date
before continuing” remains visible after navigation to intake. The case-summary projection deliberately omits member,
procedure, and plan values. The detail view therefore sends a resolution-focus
intent to intake. The production route-composition test enters
`/cases/:caseId`, follows that intent through the registered intake route,
keeps the exact guidance visible, and focuses the Plan field from the full
record. The production full-record hook uses the verified session practice in
its typed HTTP request. A mounted Axum test returns protected inputs only with
`case:read` and the verified practice; it refuses a missing capability,
foreign practice, and denied target. The frozen FRF transport, chunk writer,
PGlite schema, Electric allowlist, materialization, and PEM projection tests
reject member, procedure, and plan fields together from the case summary even
when an over-wide source row supplies them.

## Mounted production chain

1. `web/src/app/routes/app-routes.tsx` maps `/cases/:caseId` and its intake
   child to the exact production route modules.
2. `web/src/app/routes/case-detail-route.tsx` mounts `CaseDetail`, which mounts
   `useAdministeringEntityResolution` and `AdministeringEntityPanel`.
3. The hook calls the typed client in
   `web/src/features/administering-entity/api/administering-entity-api.ts`.
4. `crates/aso-server-axum/src/lib.rs` merges the router from
   `crates/aso-server-axum/src/routes/administering_entity.rs`.
5. The administering-entity route verifies the capability and calls the
   shell-neutral `AppServices` boundary.
6. `crates/aso-web-server/src/adapters/gate.rs` implements authorize, resolve,
   read, and exact-command lookup through the shell-neutral `AppServices`
   boundary.
7. `migrations/server/2026090619_administering_entity_resolution_commands.sql`
   supplies the least-privilege durable command, lookup, receipt, audit, and
   invalidation functions.

No desktop or mobile source is part of this chain.

## Commands and observed outputs

- The final thirteen-file Vitest command passed 52 tests, including the
  production route composition, case API/full-record hook, narrow PEM
  selector, over-wide transport refusal, and PGlite materialization.
- `pnpm --dir web typecheck` exited 0.
- `pnpm --dir web lint` exited 0.
- The mounted Axum administering-entity command passed 3 tests.
- The separate mounted gate-policy command passed 1 supporting policy test; it
  is a peer router and is not middleware in the administering-entity path.
- The mounted full-record route test passed 1 test: authorized reads returned
  protected resolution inputs, while missing `case:read`, foreign practice,
  and repository target denial returned 403.
- `cargo check` passed for `aso-host`, `aso-server-axum`, and
  `aso-web-server` with Rust 1.97.1.
- `cargo fmt --all -- --check` exited 0 with Rust 1.97.1.
- Strict OpenSpec validation reported the change valid.
- Fresh and populated-upgrade PostgreSQL/AppServices probes passed the five
  states, effective enrollment, four authoritative invalidations, three-way
  validity intersection, both concurrent transaction orders, future plan,
  enrollment, and rule classification, disjoint historical-window
  classification, plan-ended and enrollment-ended coverage paths, durable provenance, retry
  authorization, tenant refusal, least privilege, and cleanup.
- Removing the production input-table lock made the actual paused resolver and
  concurrent mutation deadlock; restoring it passed both transaction orders
  with cleanup.
- Removing the non-empty validity-intersection predicate made the disposable
  PostgreSQL probe classify disjoint historical windows as `expired` and fail;
  restoring it made both fresh and populated-upgrade probes report `missing`.
- Restoring the misleading “Effective through” and “Matching rule expired”
  copy failed 3 of 6 component tests; the exclusive validity label and neutral
  coverage-path copy restored all 6.
- Restoring the rule-specific label in the authoritative state catalog made a
  disposable PostgreSQL probe fail on the observed label; restoring “Coverage
  path expired” passed both fresh and populated-upgrade probes.
- Returning incomplete inputs as HTTP 409 failed the mounted route assertion;
  restoring HTTP 422 passed it. Disabling intake field autofocus failed all
  four focus assertions; restoring it passed all five form tests. The final
  intake wiring test proves a loaded record with a missing plan focuses the
  plan field.
- Disabling the validated notice at the intake route made the routed recovery
  test fail because the exact guidance disappeared. Restoring the notice passed
  the routed test with both visible guidance and Plan-field focus.
- The caller-selected-output sabotage failed under the weakened guard, the
  source was restored, and its recorded hash matches the mounted route.
- Temporarily restoring the post-invalidation uncertainty defect failed both
  new recovery tests; restoring the repair passed 12/12 hook tests.
- Temporarily hiding the entity revision failed the mounted panel test;
  restoring the revision fields passed 3/3 panel tests.
- The final artifact-refiner rebuild matched all current source snapshots and
  separately checked the narrow case-summary boundary and exact production
  browser route in addition to the prior focused constraints.
- Post-freeze independent artifact and distinct-model review outcomes are not
  asserted inside this frozen source set. They are recorded beside the
  artifact against the exact final manifest digest before KBD marks task 3.1
  complete.

The exact commands and final observations are recorded in
`task-6-command-receipt.json`. Task-5 receipts and the 79-snapshot critic are
retained as historical evidence for the earlier focused iteration; they do not
claim to review the final artifact manifest.

## Claim boundary

This result proves only the mounted administering-entity capability at focused
Tier 0/Tier 1. It does not prove document upload, criteria selection, evidence
assembly, letter generation, denial response, or a complete actual-browser
scenario. Web-04 through Web-16 must deliver those capabilities, and Web-17
must certify the unchanged assembled browser candidate. Tauri and mobile stay
deferred.
