# W8-docker-compose — docker-compose.yaml + schema bootstrap

**Phase:** web-ui-architecture
**Goal:** G6
**Depends on:** —
**Recommended agent:** devops-engineer

## Authority

The **W8-docker-compose** section of `.kbd-orchestrator/phases/web-ui-architecture/plan.md` is the source of truth for tasks, verification
commands and acceptance criteria. Read it. Do not restate it here.

## Tasks

- [x] compose with 6 services on one postgres18; 3 bootstrap scripts; sync_* views resolving W6 blocker
- [~] docker compose config PARSES OK, services and pins resolve; web typecheck 0, test 6/6, build 2.43s, audit PASS. NOT RUN: docker compose up, schema load, live sync — Build-only
- [x] Caught POSTGRES_MULTIPLE_DATABASES as an unsupported convention before it shipped; replaced with explicit creation. Open risk: Electric serving a VIEW is untested and load-bearing

## Acceptance

Every command in the plan section's Verify block runs and passes, with observed
output recorded. A check that could not run is reported unverified, never as
passing.
