# web-02 task 1.1 — eligibility and ownership

Date: 2026-09-17  
Phase: `runtime-architecture › web-case-to-letter`  
Change: `web-02-case-publication-ui`  
Task: `1.1`  
Result: **Passed**

## Dependency and canonical position

- `web-01-case-command-core` is canonically `DONE` / `COMPLETE`. Its six real
  OpenSpec tasks are complete; the generated 7/7 count includes one cancelled
  duplicate registration retained by the append-only KBD log.
- The Web-01 OpenSpec change is archived at
  `openspec/changes/archive/2026-09-17-web-01-case-command-core`, and its
  `case-command-core` specification is promoted under `openspec/specs`.
- The mounted Web-01 boundary supplies create, list, read, update, transition,
  and command-reconciliation HTTP operations. Mutation results are minimal
  receipts; protected case data still requires `case:read`.
- `openspec validate web-02-case-publication-ui --strict` exited zero and
  printed `Change 'web-02-case-publication-ui' is valid`.
- KBD started this exact backend task as ordinal `1` of `6` at source revision
  1561. No later Web-02 task is started by this receipt.

## Frozen publication interpretation

The publication row named `case_summaries` in
`docs/architecture/web-case-to-letter-contract.md` is the logical case-summary
projection backed by the existing `aso.cases` base relation. Task 1.2 extends
the existing `cases` shape and graph entity rather than adding a second shape
over the same base table or introducing an Electric SQL view. This preserves
the existing `replica:cases` / `Case` callers while advancing the projection
revision and exact allowlists together.

The only additional case columns eligible for that projection are the frozen
set: `case_number`, `patient_id`, `surgeon_id`, `coordinator_id`, `payer_id`,
`date_of_service`, and `revision`, alongside the already approved `id`,
`practice_id`, `status`, `gate_affirmed_at`, and `updated_at`. The existing
`created_at` column is not part of the Web-02 publication row and must be
removed from the projected wire/local contract when the revision advances.
`member_id`, `facility_id`, `procedure_code`, `plan_key`, command results,
arbitrary `data`, and clinical source content remain excluded.

The frozen row contains identifiers, not patient, payer, or surgeon display
names. The current `CaseSummary` prototype model cannot manufacture those
names. Web-02 renders approved identifiers or data from an independently
authorized contract; it does not widen the replica under a presentation need.

Case create/edit reads continue through the verified HTTP service. Editable
form values may live only as a scoped, memory-only draft and must not become a
second durable record cache. Successful commands reconcile by command receipt,
then the committed case entity remains the rendered source.

## Decision gates

| Gate | Eligibility result | Binding consequence |
|---|---|---|
| G-PIN | Satisfied for this change | `versions.toml` pins PEM core/react to `4.0.3-ra11c.1.g071b9e5.sbb3dc7729aa7`; Web-02 changes no dependency or pin. |
| G-SYNC | Qualified only for focused synthetic browser work | The internal materializer has mounted behavioral evidence but remains blocked from production adoption by its measured RSS budget. Web-02 may use the exact `experimental` qualification switch in local synthetic checks and cannot make a production-adoption claim. |
| G-DATA | Satisfied only in memory mode | The clinical projection remains eligible for synthetic memory-only browser qualification. No persistent real clinical replica or release claim is authorized. Reload acceptance must recover committed server state, not rely on unapproved IndexedDB persistence. |
| G-REV | Satisfied | The existing 5,000 ms server revocation ceiling and generation destruction on identity, session, practice, or authorization-revision change remain binding. |
| G-NATIVE | Not applicable | Tauri, native SQLite, desktop wrappers, Flutter, and mobile source are denied by this child scope until Web-17 passes. |

The no-query-cache decision remains binding. Lists contain ordered identifiers,
and each view rejoins the current PEM entity at render time. PGlite is a
read-side replica; create, update, and transition writes use the Web-01 HTTP
commands through `AppServices`.

## Assigned ownership for the remaining Web-02 tasks

Task 1.2 has exclusive ownership of the publication and materialization set:

- `crates/aso-host/src/projection.rs`
- `crates/aso-server-axum/src/session.rs` focused grant tests
- `docker/frf/shape-catalog.json`
- `web/src/shared/sync/pglite-schema.ts`
- `web/src/shared/sync/electric-shapes.ts`
- `web/src/shared/sync/replica-wiring.ts`
- `web/src/app/providers/graph-provider.tsx` schema/generation composition
- focused projection, catalog, schema, wiring, materializer, and mounted-replica
  tests beside those sources

Task 1.3 owns new case projection selectors and per-mounted-view Zustand state
under `web/src/features/case-queue`, using
`web/src/shared/scoped-view-store.ts` and
`web/src/shared/use-scoped-view-store.ts` without changing their shared
contract unless an observed defect requires it.

Task 1.4 owns the case command client/hooks, responsive queue/detail/intake
components, and their mounted route modules. Expected route ownership includes
`web/src/app/routes/case-queue-route.tsx`,
`web/src/app/routes/intake-checklist-route.tsx`, and the missing
`/cases/:caseId` detail route in `web/src/app/routes/app-routes.tsx`.

The shared worktree already contains accumulated edits in central projection,
provider, shell, and route files. Each remaining task uses one writer for its
assigned files and preserves those edits. No companion-repository, desktop, or
mobile source is assigned to Web-02.

## Real caller chain confirmed

The existing production chain is
`ReplicaGrant::for_session` → mounted `/api/session/replica-grant` → Gate/FRF
authorized shape catalog → `REPLICA_SHAPES` → PGlite tables and checkpoints →
committed PEM table/list bindings → React graph selectors. Web-01 case commands
follow the separate mounted HTTP write path. Task 1.2 extends this real chain;
it does not add a fixture-only publication seam.

## Limits at this boundary

No product source changed in task 1.1. The case queue and intake routes remain
placeholders, no case detail route exists, and no browser usability claim is
made. Those are the observed gaps assigned to tasks 1.2 through 1.4. Full local
stack and actual-browser certification remain reserved for Web-17.

## Observed verification

`openspec validate web-02-case-publication-ui --strict` exited zero:

```text
Change 'web-02-case-publication-ui' is valid
```

A read-only eligibility assertion checked canonical progress, the Web-01
archive and promoted spec, denied desktop/mobile scope, the frozen
`case_summaries` row, the browser-first contract, the exact PEM pin, and this
receipt. It exited zero:

```text
Passed: web01_done
Passed: web01_archived
Passed: web01_spec_promoted
Passed: desktop_mobile_denied
Passed: case_summary_contract_present
Passed: browser_first_contract_present
Passed: pem_pin_present
Passed: receipt_present
```

`git diff --check` for this receipt exited zero. No implementation or broad
verification command ran in this eligibility task.
