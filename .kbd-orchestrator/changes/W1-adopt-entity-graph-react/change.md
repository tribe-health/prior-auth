# W1-adopt-entity-graph-react — Adopt entity-graph-react@^4.0.0; retire the alias

**Phase:** web-ui-architecture
**Goal:** G3
**Depends on:** —
**Recommended agent:** general-purpose

## Authority

The **W1-adopt-entity-graph-react** section of `.kbd-orchestrator/phases/web-ui-architecture/plan.md` is the source of truth for tasks, verification
commands and acceptance criteria. Read it. Do not restate it here.

## Tasks

- [x] Dependency swapped to entity-graph-react@^4.0.0; two pre-existing typecheck failures fixed
- [x] resolved 4.0.0; ESM-only confirmed; 203 exports import at runtime; typecheck 0, lint clean, build 3.54s, audit PASS
- [x] Baseline captured BEFORE the change (2 errors, same 2 files) and confirmed unchanged after, so the swap introduced nothing

## Acceptance

Every command in the plan section's Verify block runs and passes, with observed
output recorded. A check that could not run is reported unverified, never as
passing.
