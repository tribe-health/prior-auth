# W6-entity-graph-sync — Entity graph + PGlite + Electric wiring

**Phase:** web-ui-architecture
**Goal:** G3, G4
**Depends on:** W1, W3
**Recommended agent:** architect

## Authority

The **W6-entity-graph-sync** section of `.kbd-orchestrator/phases/web-ui-architecture/plan.md` is the source of truth for tasks, verification
commands and acceptance criteria. Read it. Do not restate it here.

## Tasks

- [x] PGlite schema (5 tables, column-level PHI exclusions), tenant-scoped Electric wiring, exclusion test; pglite 0.5.8 + client 1.5.27 + vitest installed
- [x] test 6/6, typecheck EXIT=0, lint clean, build 3.18s, audit.sh PASS; guard proved to fail on a reintroduced PHI column
- [~] OPEN QUESTION ANSWERED: the privacy class does not exist in the schema (build-order phase 1 is partial and says so). Tenant scoping implemented; per-record refusal deferred to phase 1. Two findings recorded: column-level PHI beyond the table list, and a real ShapeMessage.offset disagreement between PEM 4.0.0 and electric-client 1.5.27

## Acceptance

Every command in the plan section's Verify block runs and passes, with observed
output recorded. A check that could not run is reported unverified, never as
passing.
