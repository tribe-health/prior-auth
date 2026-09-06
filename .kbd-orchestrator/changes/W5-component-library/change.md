# W5-component-library — Base component library under shared/ui

**Phase:** web-ui-architecture
**Goal:** G2
**Depends on:** W3
**Recommended agent:** typescript-reviewer

## Authority

The **W5-component-library** section of `.kbd-orchestrator/phases/web-ui-architecture/plan.md` is the source of truth for tasks, verification
commands and acceptance criteria. Read it. Do not restate it here.

## Tasks

- [x] Three components promoted on demand (chip, counts, citation) + barrel; all kebab-case
- [x] test 26/26, typecheck 0, lint clean, build 4.05s, audit PASS; both guards proved to fail under sabotage
- [x] Added jsdom + testing-library — required by the plan's own rendering-check step. Ember measured at 2.97:1, not 3.08:1

## Acceptance

Every command in the plan section's Verify block runs and passes, with observed
output recorded. A check that could not run is reported unverified, never as
passing.
