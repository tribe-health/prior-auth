# Execution — web-ui-architecture

**Phase** `web-ui-architecture` · **Stage** execute · **Date** 2026-09-05
**Backend** `native-tool` (KBD change files)
**Target** `web/` in this repository

## Backend selection

`native-tool`, not `openspec`. `.kbd-orchestrator/project.json` declares
`openspec_available: false`, and the nested `web/openspec/` carries no specs.
The eight changes are native KBD structures at
`.kbd-orchestrator/changes/W1…W8`.

The real verification surface is this repo's own gates — `scripts/audit.sh`,
`pnpm --dir web typecheck|lint|build` — not a tool's progress model.

## Dispatch contract

- **Web surface only.** The phase goals scope this to `web/`. `crates/`,
  `mobile/` and `desktop/` are out of scope.
- **Per change:** run the plan section's Verify block and record *observed*
  output. A check that could not run is reported unverified, never as passing.
- **`scripts/audit.sh` is the boundary gate.** Checks 1, 2, 3 and 6 all bear on
  this phase; it runs before any change is called done.
- **Nothing here publishes or deploys.** Every change is reversible — the
  difference between this phase and the child that preceded it.

## Change ledger

| # | Change | Goal | Status |
|---|---|---|---|
| W1 | adopt-entity-graph-react | G3 | in progress |
| W2 | esm-conformance | G1 | pending |
| W3 | architecture-decisions | G7 | pending |
| W4 | app-shell | G1 | pending |
| W5 | component-library | G2 | pending |
| W6 | entity-graph-sync | G3, G4 | pending |
| W7 | evidence-timeline-slice | G5 | pending |
| W8 | docker-compose | G6 | pending |

## Known runtime condition

The typed runtime reports `phase: null` and holds no stage registrations for
this tree — the same desync recorded during the child phase. `prometheus kbd
change|task` registration is therefore unavailable here.

The authoritative record is `plan.md`, `handoffs/*.json`, and this file. The
waypoint is not hand-edited to compensate; position moves through
`prometheus kbd phase activate`.
