# Execution — web-ui-architecture› pem-refresh-3-3-0

**Phase** `pem-refresh-3-3-0` (depth 2) · **Stage** execute · **Date** 2026-09-04
**Backend** `openspec`
**Target repo** `/Users/gqadonis/Projects/prometheus/prometheus-entity-management` @ `d1588d8c`

## Backend selection

`openspec` — PEM carries `openspec/` with an active change set and a
schema-validated release contract. The nine changes were emitted there as
`openspec/changes/C1…C9`. Traceability is required because this phase ends in an
irreversible npm + pub.dev publish.

Not `native-tool`: the repo's own gates (`validate:release-contract`,
`verify:package-contracts`, `verify:no-workspace-leak`) are the real
verification surface, and they are pnpm scripts, not a tool's progress model.

## Dispatch contract

- **Source edits land only in the PEM repo.** `scope.json` denies `web/`,
  `mobile/`, `crates/`, `desktop/`, `docs/` in prior-auth.
- **Task execution routes through `/kbd-apply`**, never bare `/opsx:apply` —
  the latter has no KBD awareness and would skip per-task hooks and the ledger.
- **Per change:** run the plan section's Verify block and record *observed*
  output. A check that could not run is reported unverified, never as passing.
- **C9 is irreversible** and runs only after C1–C8 are green.

## Change ledger

| # | Change | Status |
|---|---|---|
| C1 | alias-directory-decision | in progress |
| C2 | freeze-table-type-surface | pending |
| C3 | rename-entity-graph-react | pending |
| C4 | alias-package | pending |
| C5 | pglite-caret-range | pending |
| C6 | react-table-v9 | pending |
| C7 | flutter-hooks-riverpod | pending |
| C8 | dart-hook-helpers | pending |
| C9 | release-3-3-0 | pending |

## Known runtime condition

`prometheus kbd status --json` reports `lifecycle: ready`, `phase: null`, no
registered stages; `position-reminder.txt` therefore still advertises
`/kbd-assess` although assess and plan are complete. The typed runtime has no
record of this phase tree — only the file waypoint does.

`prometheus kbd change|task` registration is **not available** for this phase
for the same reason (`stage plan was not found`). The authoritative record is
therefore `plan.md`, `handoffs/*.json`, and this file. The waypoint is not
hand-edited to compensate — see `.prometheus/gotchas.md`.
