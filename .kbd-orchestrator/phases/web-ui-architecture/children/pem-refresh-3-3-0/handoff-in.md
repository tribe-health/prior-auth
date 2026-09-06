# Handoff in — web-ui-architecture› pem-refresh-3-3-0

**Spawned by:** web-ui-architecture · **Date:** 2026-09-04 · **Depth:** 2

## Why this child was spawned

`/kbd-plan web-ui-architecture` stopped before writing `plan.md` because two
BLOCKING gaps in the parent assessment both resolve upstream, in a **different
repository**.

**GAP-2 was the trigger.** The parent's G3 named
`@prometheus-ags/entity-graph-react`. That package does not exist on npm. The
React binding lives at `packages/entity-graph-react/` but publishes as
`@prometheus-ags/prometheus-entity-management` — the *product* name. It is the
only entry in `scripts/public-packages.mjs` where `directory` and `name`
disagree; alpine, solid, svelte, htmx, tauri and web-components all derive their
name from their directory.

Planning against the directory name would have produced a fabricated import in
every task that touched the entity graph. Planning against the *correct* name
would have locked the application to a name the library itself documents as "the
React bindings" — leaving the next reader to fall into the same trap.

Scope then grew past what the parent could absorb:

- `@tanstack/react-table` is a **major** behind (8.21.3 → 9.2.4), and v9 renames
  every API this repo uses.
- `entity_graph_flutter` is at **3.1.0** while the JS packages are at **3.2.0**.
- The Flutter package pins Riverpod **below** what the prior-auth mobile app
  already uses.

A rename plus a major migration plus a Dart parity pass is not a sub-task of
"build the web shell". It is its own phase with its own release gates.

## Inputs

From the parent node:

- `.kbd-orchestrator/phases/web-ui-architecture/assessment.md` — §2 carries the
  verified version table; Finding D is GAP-2.
- `.kbd-orchestrator/phases/web-ui-architecture/handoffs/assess.handoff.json`

`plan.md` does **not** exist. The parent paused before writing it; that is
expected and is not a missing input.

## Where the work happens

**All source edits land in `/Users/gqadonis/Projects/prometheus/prometheus-entity-management`**,
branch `main`, baseline commit `d1588d8c`. Only KBD artifacts are written into
the prior-auth repo. `scope.json` denies `web/`, `mobile/`, `crates/`,
`desktop/` and `docs/` for exactly this reason — the parent owns those and is
paused.

## Verified baseline (2026-09-04, read from registries and disk)

| Item | Current | Target |
|---|---|---|
| 12 npm packages | 3.2.0 | **3.3.0** |
| React binding name | `prometheus-entity-management` | **`entity-graph-react`** + alias |
| `entity_graph_flutter` | 3.1.0 (pub.dev) | **3.3.0** |
| `@tanstack/react-table` | ^8.21.3 | **9.2.4** |
| `@electric-sql/pglite` | 0.5.4 pinned dev | **^0.5.8** |
| `flutter_riverpod` | >=3.3.2 <3.4.0 | **`hooks_riverpod` 3.4.3** |
| `riverpod_annotation` | >=4.0.3 <4.0.5 | **4.0.7** |
| `riverpod_generator` | 4.0.4 | **4.0.9** |
| `build_runner` | 2.15.1 | **2.16.1** |
| `flutter_hooks` | absent | **0.21.3+1** |

`pnpm run validate:release-contract` was green before any change: **0 errors, 16
artifacts, 12 npm packages, release 3.2.0**. Any failure after this point is
attributable to this phase.

The Flutter targets match the prior-auth mobile app's pins exactly
(`flutter_riverpod 3.4.3`, `riverpod_annotation 4.0.7`, `riverpod_generator
4.0.9`, `build_runner 2.16.1`), so G5 closes the parity gap and the version skew
in one move.

## Decisions already made — do not re-litigate

1. **Additive alias, not a hard rename.** 358 files reference the old name and it
   is a `fixed` version-lockstep member. The old name keeps resolving forever.
2. **react-table v9 feature-by-feature.** No `stockFeatures`. TanStack's own
   migration guide calls it "a migration shortcut, not the preferred production
   end state."
3. **PGlite gets a caret range**, not a new pin.
4. **`hooks_riverpod` swap plus Dart hook helpers** — `use-entity`,
   `use-entity-list`, `use-entity-query` — mirroring the React hook surface.

## Success criteria

- `@prometheus-ags/entity-graph-react@3.3.0` published and installable.
- `@prometheus-ags/prometheus-entity-management@3.3.0` published as an alias
  re-exporting **all three** entrypoints (`.`, `./devtools`, `./devtools/auto`),
  then `npm deprecate`d with a pointer to the new name.
- All 12 existing npm packages at 3.3.0; `entity_graph_flutter` at 3.3.0.
- `useReactTable` appears nowhere; all 15 call sites use `useTable` with an
  explicit `tableFeatures` object.
- `pglite-persistence.integration.test.ts` passes against `^0.5.8`.
- `flutter analyze` and `flutter test` pass on `hooks_riverpod` with the three
  hook helpers exported.
- Release gates green: `validate:release-contract`, `verify:package-contracts`,
  `verify:no-workspace-leak`, `verify:binding-singletons`, `verify:skills`,
  `release:check`.

## Expected deliverables back to the parent

Via `handoff-out.md`:

1. The exact install line and version the prior-auth web app should use.
2. Whether the PGlite adapter is verified against `^0.5.8` — this is the sync
   path the parent chose (ElectricSQL 1.8.0) and depends on.
3. The Flutter install line and Riverpod set for the parent's future mobile
   surface, with the Flutter-3.44-constraint question in G5 answered from
   observation rather than from the old pubspec comment.
4. Any API change the parent's plan must account for.

## The uncomfortable thing

This phase raises the floor under a library the application has not yet written
a line against. If the parent's plan later shows the entity graph is the wrong
abstraction for the evidence-timeline slice, this release will have been
correct work aimed at the wrong target. The rename and the version alignment
survive that outcome; the react-table v9 migration mostly does not.
