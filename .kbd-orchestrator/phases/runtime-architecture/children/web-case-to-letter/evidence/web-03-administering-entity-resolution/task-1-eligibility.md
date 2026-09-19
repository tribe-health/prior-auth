# web-03 task 1.1 — eligibility and ownership

Date: 2026-09-17

Phase: `runtime-architecture › web-case-to-letter`

Change: `web-03-administering-entity-resolution`

Task: `1.1`

Result: **Passed**

## Dependency and canonical position

- `web-02-case-publication-ui` is canonically `DONE` / `COMPLETE` with all six
  tasks complete. Its OpenSpec change is archived at
  `openspec/changes/archive/2026-09-17-web-02-case-publication-ui`, and its
  promoted specification is `openspec/specs/case-publication-ui/spec.md`.
- The Web-02 mounted browser boundary supplies the authorized case summary,
  case create/read/update/transition commands, committed-row confirmation, and
  responsive queue, intake, and detail views needed by Web-03.
- `openspec validate web-03-administering-entity-resolution --strict` exited
  zero and printed `Change 'web-03-administering-entity-resolution' is valid`.
- KBD lists this exact task as ordinal 1 of 6 and reports `6 0 6` before its
  completion. The child progress record marks Web-03 `IN_PROGRESS` with no
  blockers. No later Web-03 task is started by this receipt.

The generated child task summary still says task 1.4 mounts `HTTP/native`
commands. That line is stale. The Web-03 OpenSpec task, proposal, design, and
the frozen command matrix require browser HTTP only. Typed Tauri wrapper names
are reserved for RA19/RA21 and no desktop or mobile implementation is eligible
before Web-17 browser certification passes.

## Frozen Web-00 contract

The capability is `resolve_administering_entity`, available to a verified
coordinator or surgeon. Gate, shell-neutral `AppServices`, and a tenant-scoped
PostgreSQL command function enforce the operation independently.

The mounted browser contract is:

- `GET /api/cases/{caseId}/administering-entity`
- `POST /api/cases/{caseId}/administering-entity`
- command lookup under that resource

The command consumes `caseInputRevision`. Member, plan, payer, procedure,
service date, or facility changes invalidate that token. A successful command
produces `resolutionRevision`; administering entity, delegation, submission
channel, appeal path, validity, or source changes advance it and invalidate
criteria selection, evidence, the clinical gate, and letters.

The only eligible publication row is
`administering_entity_resolutions(case_id, entity_id, criteria_set_key,
submission_channel_key, appeal_path_key, source_document_id, valid_from,
valid_to, state, revision)`. It is `trusted`, is scoped by joining the case to
the verified selected practice, and is invalidated by a controlling case-input
change. Raw member, plan, procedure, delegation-rule, command-ledger, source
text, credential, and provider-response data are not publication columns.

The frozen fixture's initial-request case resolves case
`40000000-0000-4000-8000-000000000001` to entity
`21000000-0000-4000-8000-000000000001`, criteria set
`synthetic-lumbar-fusion-2026`, channel `manual_synthetic`, appeal path
`synthetic-standard-appeal`, and source document
`50000000-0000-4000-8000-000000000001`. Its command ID is
`b0000000-0000-4000-8000-000000000009`; it consumes
`request-case:caseInputRevision:r1` and produces
`request-case:resolutionRevision:r1`.

The public error contract already fixes `resolution_ambiguous`,
`case_inputs_incomplete`, `stale_revision`, `command_conflict`,
`action_forbidden`, `resource_not_found`, and `session_required`. Task 1.2 must
represent valid, missing, ambiguous, conflicting, and expired rule records as
deterministic fixture outcomes. It may not silently invent additional public
error codes or allow a browser selection to override the resolver. Task 1.3
must return the one expected resolution or a named parked state.

## Decision gates

| Gate | Eligibility result | Binding consequence |
|---|---|---|
| G-PIN | Satisfied for this change | The current PEM core/react pin remains `4.0.3-ra11c.1.g071b9e5.sbb3dc7729aa7`; Web-03 introduces no dependency or pin change. |
| G-SYNC | Qualified only for focused synthetic browser work | The SQL materializer remains blocked from production adoption by its measured RSS budget. Web-03 may exercise the exact memory-only experimental browser path and may not make a production-adoption claim. |
| G-DATA | Satisfied only for the exact memory-only row | Only the frozen resolution columns may enter the trusted projection. Raw matching inputs and delegation rules remain server-side. Persistent real-clinical browser storage remains unauthorized. |
| G-REV | Satisfied | Verified identity, selected practice, grant revision, and the 5,000 ms revocation ceiling remain binding. Identity, session, practice, epoch, or authorization changes destroy the generation. |
| G-NATIVE | Not applicable | Tauri, native SQLite, desktop command wrappers, Flutter, and mobile source are outside this browser-first change and remain deferred until Web-17 passes. |

The no-query-cache rule remains binding. Durable resolution state belongs in
Postgres/PEM; React components and scoped Zustand stores may keep only
interaction state. Browser commands go through typed HTTP clients and
`AppServices`; React and Zustand do not write PGlite or PEM.

## Assigned ownership for remaining Web-03 tasks

Task 1.2 owns the additive server schema and deterministic rule fixtures:

- the next collision-checked additive migration under `migrations/server/`
- `crates/aso-web-server/src/migrations.rs`
- `docs/design/schema/schema-web-case-to-letter.sql` and its focused checks
- the Web-03 portions of
  `docs/architecture/fixtures/web-case-to-letter/fixture-manifest.json`,
  `expected-output-manifest.json`, `manifest-lock.json`, and `verify.py`
- focused migration and fixture tests beside those sources

Task 1.3 owns the shell-neutral resolver model, service, port, adapter, and
revision behavior:

- a new administering-entity capability module under `crates/aso-host/src/`
- `crates/aso-host/src/lib.rs` and `crates/aso-host/src/ports/mod.rs`
- a new administering-entity adapter under
  `crates/aso-web-server/src/adapters/`
- `crates/aso-web-server/src/adapters/mod.rs` and the production composition
- focused resolver, tenant, command-reconciliation, and invalidation tests

Task 1.4 owns the browser HTTP and React capability surface:

- a feature route module under `crates/aso-server-axum/src/routes/` plus the
  existing route composition
- a feature-based `web/src/features/administering-entity/` API, model, hooks,
  scoped Zustand interaction state, components, and focused tests
- the administering-entity panel mounted from the existing case detail route
- responsive, reload, downstream-blocking, and tenant-refusal checks

The shared worktree contains accumulated edits in central host, adapter,
route, projection, and React composition files. Each task preserves those
edits, uses one writer for its assigned files, and does not modify desktop,
mobile, or companion repositories.

## Limits at this boundary

No product source, schema, fixture, dependency, pin, Tauri, or mobile file
changed in task 1.1. The application still cannot resolve an administering
entity through the mounted browser, so the full case-to-letter scenario is not
ready. Tasks 1.2 through 1.4 must implement this capability, and Web-04 through
Web-17 must still deliver document ingestion, criteria, evidence, both letter
paths, and actual-browser certification.

The uncomfortable fact is that this receipt proves eligibility and ownership,
not clinical workflow function. Web-02 made case management usable, but no
letter can yet be generated from uploaded case data.

## Observed verification

`openspec validate web-03-administering-entity-resolution --strict` exited zero:

```text
Change 'web-03-administering-entity-resolution' is valid
```

`kbd-apply list` showed six incomplete tasks and `kbd-apply progress` printed:

```text
6 0 6
```

No implementation test or broad integration command ran. This is an
eligibility task; focused implementation verification begins with task 1.2,
and full local browser integration remains reserved for Web-17.
