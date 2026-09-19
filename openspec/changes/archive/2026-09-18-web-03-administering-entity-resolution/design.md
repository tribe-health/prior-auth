## Context

This is ordered change `web-03-administering-entity-resolution` in the reviewed `runtime-architecture › web-case-to-letter` plan. The repository already provides verified sessions, clinical command patterns, authorized projection, PGlite/PEM materialization, and responsive React foundations, but this capability is absent or incomplete.

## Goals / Non-Goals

**Goals:** Implement only `administering-entity-resolution` at its focused contract boundary and retain shell-neutral `AppServices`, verified tenant scope, typed browser HTTP contracts, and explicit replica privacy classification before publication.

**Non-Goals:** No typed Tauri wrappers, Tauri runtime certification, native SQLite selection, Flutter/mobile work, real payer transport, external inference, production deployment, or broad child integration run. Native delivery resumes only after web-17 passes.

## Decisions

- Follow the frozen decisions and dependency order in the child plan; do not reopen them during apply.
- Use additive migrations and least-privilege security-definer functions for durable effects; direct production-role table writes remain refused.
- Keep durable domain state in Postgres/PEM and transient view state in scoped Zustand.
- Resolve the selected payer plan through an effective-dated, practice-scoped member enrollment before applying delegation rules. Changes to an enrollment, plan, entity, rule, validity window, path, or source invalidate any affected current resolution and advance `resolutionRevision`.
- Serialize resolver-input mutations with resolution in table-then-case lock order, including the first resolution when no current row exists. Future-effective paths and disjoint historical windows remain `missing` for the case service date; `expired` is reserved for a compatible path whose non-empty intersected validity ended on or before that date.
- Treat persisted `validTo` values as exclusive boundaries in both server evaluation and interface copy. Describe `expired` as an ended coverage path because the plan, enrollment, or delegation rule may be the first component to end.
- Return incomplete case inputs as HTTP `422 case_inputs_incomplete` with the exact guidance “Complete the member, plan, procedure, and service date before continuing.” The case-detail projection does not publish member, procedure, or plan values. It therefore passes a resolution-focus intent to intake; intake loads the authorized full case record, derives the first missing field in member, plan, procedure, service-date order, and focuses that control.
- Retain an uncertain resolution command ID and expected case-input revision in a session/practice/case-scoped Zustand recovery store backed by tab-scoped session storage. Exact lookup runs before the current row. A lookup 404 reissues the same command and payload idempotently; a serialized `stale_revision` or `case_inputs_incomplete` result proves that command absent, clears it, reloads committed state, and preserves applicable guidance.
- Add document/page/date to every generated external assertion. Documentless annotations or criteria may guide work but cannot become an included assertion.
- Run only applicable Tier 0 and focused Tier 1 checks in this change. Child Tier 2 belongs to web-17.

## Risks / Trade-offs

- [Service/HTTP drift] → Keep browser HTTP command contracts beside the shell-neutral service and verify equivalent refusal semantics.
- [Replica disclosure] → Require the plan's lane/privacy/column/tenant/revocation record before any new publication.
- [False readiness] → Acceptance names only the mounted boundary completed by this change and does not reuse fixture-only evidence as product evidence.

## Migration Plan

Apply additive schema and contract changes before enabling their callers. Preserve existing reads until the focused migration is verified. Roll back callers first; never delete historical clinical or audit records as rollback.
