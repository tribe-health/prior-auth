# W4-app-shell — App shell: layout, providers, gated navigation

**Phase:** web-ui-architecture
**Goal:** G1
**Depends on:** W2, W3
**Recommended agent:** typescript-reviewer

## Authority

The **W4-app-shell** section of `.kbd-orchestrator/phases/web-ui-architecture/plan.md` is the source of truth for tasks, verification
commands and acceptance criteria. Read it. Do not restate it here.

## Tasks

- [x] Layout, session + graph providers, 10-step gated nav, boundaries; 13 routes nested under AppShell with paths unchanged
- [x] test 18/18, typecheck 0, lint clean, build 5.52s, audit PASS; gating guard proved to fail when the gate is disabled
- [x] Two stubs both fail CLOSED (useGateAffirmed=false, session=null). Shell not yet rendered in a browser — visual result is Build-only

## Acceptance

Every command in the plan section's Verify block runs and passes, with observed
output recorded. A check that could not run is reported unverified, never as
passing.
