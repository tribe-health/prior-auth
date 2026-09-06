# Handoff out — web-ui-architecture› pem-refresh-3-3-0

**Status:** COMPLETE — published `4.0.0` to npm (13 packages) and pub.dev,
2026-09-05. Registry-verified.

## Deliverables

- `openspec/changes/C1…C9/` in the PEM repo — per-change design + tasks
- `assessment.md`, `plan.md`, `execution.md`, `reflection.md` in this directory
- Published: 13 npm packages at `4.0.0`; `entity_graph_flutter 4.0.0` on pub.dev

## What the parent gets

### 1. The install line for the web app

```jsonc
"@prometheus-ags/entity-graph-react": "^4.0.0"
```

```ts
import { useEntity, useEntityList, EntityTable } from "@prometheus-ags/entity-graph-react";
```

`web/package.json` currently depends on
`@prometheus-ags/prometheus-entity-management: ^3.2.0`, which is now a
**published but deprecated alias**. Switch it.

### 2. BREAKING for the parent: these packages are ESM-only

All 13 npm packages dropped CommonJS in 4.0.0 — no `.cjs`, no `.d.cts`, no
`require` condition. The trigger was `@tanstack/react-table` v9, itself
ESM-only; a CJS declaration file cannot `require` an ESM dependency's types
(TS1479).

**Check before G1/G5:** anything in `web/` reaching these packages through
`require()` must use `await import(...)`. Vite is ESM-native so the app build is
fine; the risk is Node-side tooling, config files, or test harnesses still on
CommonJS.

### 3. PGlite is verified on the parent's chosen sync path

`@electric-sql/pglite` moved from pinned `0.5.4` to `^0.5.8`, and
`pglite-persistence.integration.test.ts` passes against it (1 passed). That is
the adapter G4's ElectricSQL 1.8.0 decision depends on. `entity-graph-core` also
ships tested `electricsql.ts` and `electricsql-tenant.ts` — the tenant adapter
matters for the practice-boundary requirement.

### 4. Flutter, for the parent's future mobile surface

```yaml
entity_graph_flutter: ^4.0.0   # pub.dev
```

On `hooks_riverpod 3.4.3` with `flutter_hooks`, shipping `useEntity`,
`useEntityList`, `useEntityQuery` mirroring the React surface. Caret ranges, so
it composes with the prior-auth mobile app rather than fighting it.

## API note the parent's plan must account for

`EntityColumnDef<T>` is unchanged for consumers — that was the point of the
work. v9 widened `ColumnDef<TData, TValue>` to
`ColumnDef<TFeatures, TData, TValue>`; the public alias supplies `TFeatures`, so
column definitions compile as written, asserted by a type-level test.

If the parent's slice imports `ColumnDef` from `@tanstack/react-table`
**directly**, it gets v9's three-parameter form. Prefer `EntityColumnDef`.

## Goal completion

| | Goal | Result |
|---|---|---|
| G1 | `entity-graph-react` name + alias | published; alias deprecated with pointer |
| G2 | version lockstep | **4.0.0**, not the planned 3.3.0 |
| G3 | react-table v8 → v9 | done; explicit `tableFeatures`, no `stockFeatures` |
| G4 | PGlite `^0.5.8` | done; integration test passes |
| G5 | Flutter `hooks_riverpod` + latest | done; 73 tests pass |
| G6 | Dart hook helpers | done; 3 helpers + 3 tests, export ledger updated |
| G7 | dependency audit | 2 real findings, both fixed |
| G8 | release gates | all green; published; registry-verified |

## Unresolved items

- **Flutter `>=3.44.0` is unverified.** All checks ran on Flutter 3.48.0 beta.
  The floor was deliberately not raised, so it is declared but unproven.
- **PEM is uncommitted.** The working tree carries the published 4.0.0 state
  with no commit. A published release whose source is uncommitted is one
  machine failure from being unreproducible.
- **`prometheus-entity-sync` untouched** — still v0.1.0 JS SDKs with no build.
  Out of scope; the parent's ElectricSQL choice stands.
- **No consumer has used any of this yet.**

## Recommendations to the parent (web-ui-architecture)

1. **Amend G3's install line** to `@prometheus-ags/entity-graph-react@^4.0.0`.
2. **Add an ESM audit to G1** — these packages no longer ship CommonJS.
3. **Commit the PEM 4.0.0 state** before building on it. Cheap now, expensive
   to reconstruct later.
4. Proceed with the plan as written otherwise: C1–C9 changed the library, not
   the parent's architecture decisions. ElectricSQL, the shell contract from
   `shell.js`, and the evidence-timeline slice are all unaffected.

## The uncomfortable thing

This raised the floor under a library the application still has not written a
line against. If the parent's slice shows the entity graph is the wrong
abstraction for evidence-timeline, the react-table v9 migration will have been
careful work aimed at the wrong target. The rename, ESM move and version
alignment survive that outcome; the v9 migration mostly does not.

The counter-argument, unchanged: a major upgrade is cheaper before consumer code
exists than after — and the parent is about to write that consumer code.
