# W7-evidence-timeline-slice — evidence-timeline vertical slice

**Phase:** web-ui-architecture
**Goal:** G5
**Depends on:** W4, W5, W6
**Recommended agent:** typescript-reviewer

## Authority

The **W7-evidence-timeline-slice** section of `.kbd-orchestrator/phases/web-ui-architecture/plan.md` is the source of truth for tasks, verification
commands and acceptance criteria. Read it. Do not restate it here.

## Tasks

- [x] model/api/hooks/components + route replaced; other 12 routes untouched (verified by import)
- [x] test 35/35, typecheck 0, lint clean, build 5.23s, audit PASS; void-collapse guard AND audit check 3 both proved to fail
- [x] One addition outside the feature: useLocalStore() on graph-provider, needed by the api layer. criterionLabel left null — W6 subset not widened

## Acceptance

Every command in the plan section's Verify block runs and passes, with observed
output recorded. A check that could not run is reported unverified, never as
passing.
