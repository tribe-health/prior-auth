## Context

This is ordered change `web-15-response-letter-workspace` in the reviewed `runtime-architecture › web-case-to-letter` plan. The repository already provides verified sessions, clinical command patterns, authorized projection, PGlite/PEM materialization, and responsive React foundations, but this capability is absent or incomplete.

## Goals / Non-Goals

**Goals:** Implement only `response-letter-workspace` at its focused contract boundary and retain shell-neutral `AppServices`, verified tenant scope, typed browser HTTP contracts, and explicit replica privacy classification before publication.

**Non-Goals:** No typed Tauri wrappers, Tauri runtime certification, native SQLite selection, Flutter/mobile work, real payer transport, external inference, production deployment, or broad child integration run. Native delivery resumes only after web-17 passes.

## Decisions

- Follow the frozen decisions and dependency order in the child plan; do not reopen them during apply.
- Use additive migrations and least-privilege security-definer functions for durable effects; direct production-role table writes remain refused.
- Keep durable domain state in Postgres/PEM and transient view state in scoped Zustand.
- Add document/page/date to every generated external assertion. Documentless annotations or criteria may guide work but cannot become an included assertion.
- Run only applicable Tier 0 and focused Tier 1 checks in this change. Child Tier 2 belongs to web-17.

## Risks / Trade-offs

- [Service/HTTP drift] → Keep browser HTTP command contracts beside the shell-neutral service and verify equivalent refusal semantics.
- [Replica disclosure] → Require the plan's lane/privacy/column/tenant/revocation record before any new publication.
- [False readiness] → Acceptance names only the mounted boundary completed by this change and does not reuse fixture-only evidence as product evidence.

## Migration Plan

Apply additive schema and contract changes before enabling their callers. Preserve existing reads until the focused migration is verified. Roll back callers first; never delete historical clinical or audit records as rollback.

## 2026-09-19 approved revision-12 target — Shared denial-response surfaces

The [implementation addendum](../../../docs/handoff/web-case-to-letter-revision-12-agent-integration.md) supplies the current
agent scope and dependencies after responsive web UI acceptance. Its synthetic
Liter-LLM inference, live AG-UI and interoperable task interfaces supersede older
no-external-inference/templates-only/optional-stream wording above. Production PHI
inference remains disabled pending qualification; Tauri and Flutter remain deferred.
The rendering kernel stays store-free, and model/tool calls happen before final
transaction locks. Preserve frozen browser intents, clinical authority and cited
claim requirements. This dated extension does not claim implementation or advance
the KBD runtime. Historical checks and completed tasks keep their original meaning.

- Reuse the same four document blocks for response preview, seven QA findings, sources and halt memo; use typed task hooks and application-owned streaming.
- Expose the selected response mode, denial/source/deadline and current revision; keep clinical controls host-owned and provisional output visibly separate.
- Prove both response workflows preserve scoped state and source access during desktop/mobile resize, reconnect and account changes.
