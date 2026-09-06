# W3-architecture-decisions — ADR-004..007: component model, navigation, entity binding, sync

**Phase:** web-ui-architecture
**Goal:** G7
**Depends on:** —
**Recommended agent:** architect

## Authority

The **W3-architecture-decisions** section of `.kbd-orchestrator/phases/web-ui-architecture/plan.md` is the source of truth for tasks, verification
commands and acceptance criteria. Read it. Do not restate it here.

## Tasks

- [x] ADR-004..007 written in the existing house style; numbering continuous 001-007
- [x] 4/4 have an Enforcement section; 4/4 state what they do NOT enforce; audit.sh PASS; typecheck 0 errors
- [x] Grounded in read facts — shell.js gated set, installed 4.0.0 API surface, schema-ai.sql PHI text. ADR-007 leaves the Electric privacy-class question explicitly open for W6

## Acceptance

Every command in the plan section's Verify block runs and passes, with observed
output recorded. A check that could not run is reported unverified, never as
passing.
