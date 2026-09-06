# Plan — web-ui-architecture› pem-refresh-3-3-0

**Phase** `pem-refresh-3-3-0` (depth 2) · **Parent** `web-ui-architecture`
**Stage** plan · **Date** 2026-09-04
**Target repo** `/Users/gqadonis/Projects/prometheus/prometheus-entity-management` @ `d1588d8c`
**Change backend** OpenSpec (PEM has `openspec/` with active changes; prior-auth
does not — changes are emitted in the PEM repo)

**9 changes.** Ordering is load-bearing: C1 and C2 are decisions that determine
what every later change writes. C9 is the only irreversible step.

---

## Blocking gaps resolved during planning

Both BLOCKING gaps from the assessment were settled by inspecting the actual v9
tarballs (`npm pack @tanstack/react-table@9.2.4`, `@tanstack/table-core@9.2.4`),
not by prediction.

### GAP-C — resolved: this release stays **3.3.0**

Three facts change the answer the assessment could not reach:

1. **`ColumnDef` still exists in v9**, re-exported from `@tanstack/table-core`
   (`useLegacyTable.d.ts` imports it from there).
2. **v9 ships a `./legacy` entrypoint** with `useLegacyTable` plus v8-compatible
   `getSortedRowModel()` / `getFilteredRowModel()` / `getPaginationRowModel()`
   stubs, each marked `@deprecated` but present and typed.
3. `flexRender` moved to its own `./flex-render` subpath.

So the public type surface can be held stable across the upgrade. **C2 makes
this explicit and testable** rather than assumed — the plan does not depend on
the types happening to line up.

### GAP-D — confirmed, and it is a real break

TanStack's own migration table, read from the shipped declarations:

> `Global TableMeta<TData> / ColumnMeta<TData, TValue>` → *"Add `TFeatures`
> first, or register per-table `tableMeta` / `columnMeta` with `metaHelper()`"*

`columns.tsx:22-27` augments `ColumnMeta<TData, TValue>` with two parameters.
**It will not compile against v9 unchanged.** C6 owns this.

---

## Change list

| # | Change | Goal | Depends on | Reversible |
|---|---|---|---|---|
| C1 | Decide and record the alias directory shape | G1 | — | yes |
| C2 | Freeze the public table type surface behind our own aliases | G2/G3 | — | yes |
| C3 | Rename: new `entity-graph-react` package + 4-registry update | G1 | C1 | yes |
| C4 | Alias package re-exporting all three entrypoints | G1 | C1, C3 | yes |
| C5 | PGlite `0.5.4` → `^0.5.8` | G4 | — | yes |
| C6 | react-table v9 migration | G3 | C2 | yes |
| C7 | Flutter toolchain + `hooks_riverpod` | G5 | — | yes |
| C8 | Dart hook helpers + export ledger | G6 | C7 | yes |
| C9 | 3.3.0 changeset, gates, publish | G2/G8 | C1–C8 | **NO** |

G7 (dependency audit) produced findings, not work: it is folded into C5 and C6.
Nothing else was stale — caret ranges already absorb react-virtual, immer,
lucide-react, zustand and tailwind-merge, and the open `>=` floors on
`@ag-ui/core`, `@tauri-apps/plugin-sql` and `loro-crdt` have no named failure
justifying a raise.

---

### C1 · Decide the alias directory shape

**Why first.** `scripts/package-contract-validation.mjs:25` asserts
`manifest.repository.directory === publicPackage.directory`, so two packages
cannot share `packages/entity-graph-react/`. Every later change writes paths
that depend on this answer.

Two viable shapes:

| | A — source moves | B — alias is new |
|---|---|---|
| `packages/entity-graph-react/` | **alias** (keeps directory) | **source** (unchanged) |
| new directory | `packages/entity-graph-react-core/`? | `packages/prometheus-entity-management/` |
| `repository.directory` churn | source package gets a new one | alias gets a new one |
| git history | follows the moved source | source history untouched |

**Recommended: B.** The source package keeps its directory, its git history and
its `repository.directory`; only the alias is new. A is a larger diff for the
same end state.

**Deliverable:** a one-paragraph decision recorded in the change, naming the
directory. No code.

**Verify:** `node -e` reading `PUBLIC_PACKAGES` shows the intended pair.

---

### C2 · Freeze the public table type surface

**Why second, and why it exists.** `src/index.ts:392` exports `EntityTable`,
whose props declare `columns: ColumnDef<T>[]`. That is a TanStack type crossing
our package boundary. Re-exporting our own alias means a future TanStack type
change is *our* decision to pass on, not an automatic break for consumers — and
it is what makes 3.3.0 defensible as a minor.

**Tasks**

1. In `src/ui/columns.tsx`, export our own names:
   ```ts
   export type EntityColumnDef<T> = ColumnDef<T>;
   ```
   and re-export it from `src/index.ts` beside `EntityTable`.
2. Change `EntityTableProps<T>.columns` to `EntityColumnDef<T>[]`.
3. Add a type-level regression test asserting a v8-shaped column literal still
   assigns to `EntityColumnDef<T>`.

**Verify:** `pnpm --filter @prometheus-ags/entity-graph-react typecheck` passes
**before** C6 touches anything. This is the baseline C6 must preserve.

**Note:** this is additive. `ColumnDef` stays exported for anyone importing it
directly.

---

### C3 · New `entity-graph-react` package

**Tasks**

1. Set `packages/entity-graph-react/package.json` `name` to
   `@prometheus-ags/entity-graph-react`; keep version at 3.2.0 (C9 bumps).
2. Update all four registries together:
   - `scripts/public-packages.mjs` — `PUBLIC_PACKAGES[]`
   - `release/v3-release-contract.json` — `artifacts[]` (`id: npm-react`) **and**
     `versionPolicy.npm.packages[]`
   - `.changeset/config.json` — `fixed[0][]`
   - the package's own `repository.directory`
3. Update the 10 `package.json` files depending on the old name.
4. Run `pnpm install` to relink the workspace.

**Verify:**
```bash
pnpm run validate:release-contract     # must stay 0 errors
pnpm run verify:package-contracts
pnpm run build:packages
```

**Do not** update the ~348 doc/test/generated references yet — C4 keeps the old
name working, so they are correct until then. C9 sweeps them.

---

### C4 · Alias package

**Tasks**

1. Create the directory chosen in C1 with
   `name: "@prometheus-ags/prometheus-entity-management"`.
2. Re-export **all three** entrypoints — `.`, `./devtools`, `./devtools/auto`.
   A one-entrypoint alias silently breaks every consumer importing
   `.../devtools`.
3. Satisfy `PACKAGE_ENTRYPOINT_CONTRACT` exactly: `type: module`, MIT,
   `author`, `homepage`, `engines.node`, `repository.url`, `bugs.url`, and
   `files` containing `dist`, `README.md`, `CHANGELOG.md`.
4. Depend on `@prometheus-ags/entity-graph-react` with `workspace:^`.
5. README states plainly: this package is an alias; new code should install
   `@prometheus-ags/entity-graph-react`.

**Verify:**
```bash
pnpm run verify:package-contracts
pnpm run verify:no-workspace-leak -- --local     # BEFORE publish
```

**Open risk (from assessment GAP-A, still unresolved):**
`PACKAGE_ENTRYPOINT_CONTRACT.exports` declares only `.`, yet the React package
passes today with three entrypoints — so the checker appears to tolerate a
superset. **Confirm this on the alias before proceeding**; if it does not, C1's
decision may need revisiting rather than weakening the contract.

---

### C5 · PGlite to a caret range

Smallest change, and the one the **parent phase depends on** — `web-ui-architecture`
selected ElectricSQL 1.8.0, and `src/adapters/pglite-persistence.ts` is that path.

**Tasks**

1. `entity-graph-core` devDependency `"@electric-sql/pglite": "0.5.4"` →
   `"^0.5.8"`.
2. `pnpm install`.

**Verify:**
```bash
pnpm --filter @prometheus-ags/entity-graph-core exec vitest run \
  src/adapters/pglite-persistence.integration.test.ts
```

Report the resolved version observed, not the range requested.

---

### C6 · react-table v8 → v9

**Depends on C2.** The type surface must be frozen first, or this change is
indistinguishable from a breaking one.

**Tasks**

1. `"@tanstack/react-table": "^9.2.4"` in `entity-graph-react`.
2. `src/ui/entity-table.tsx`:
   - `useReactTable` → `useTable`
   - drop `getCoreRowModel()` (automatic in v9)
   - `getSortedRowModel()` → `createSortedRowModel()` inside an explicit
     `tableFeatures({ rowSortingFeature, sortedRowModel: … })`
   - import `flexRender` from `@tanstack/react-table/flex-render`
   - **do not use `stockFeatures`** — TanStack documents it as "a migration
     shortcut, not the preferred production end state"
3. `src/ui/columns.tsx` — **GAP-D**: the `declare module` augmenting
   `ColumnMeta<TData, TValue>` must either add the new `TFeatures` parameter or
   move to per-table `columnMeta` via `metaHelper()`. Choose the first if it
   compiles; it is the smaller diff.
4. Audit `sortingFn` → `sortFn` and any `columnPinning.left/right` →
   `.start/.end`. Neither appears in the current source; confirm rather than
   assume.
5. Update `tsup.config.ts:34` external marker if the package name string changed.
6. Migrate the 10 example files (`examples/nextjs-app`, `examples/vite-app`).
   Most are `type ColumnDef` only; `entity-table.tsx` in each is the real work.

**Verify:**
```bash
pnpm --filter @prometheus-ags/entity-graph-react typecheck   # C2's test must still pass
pnpm --filter @prometheus-ags/entity-graph-react test
pnpm run build:packages
pnpm run test:vite-react19:unit
grep -rn 'useReactTable' packages/ examples/     # must return nothing
```

**Escape hatch, deliberately not the default.** v9 ships `useLegacyTable` with
deprecated v8-shaped row-model stubs. If the explicit migration overruns, that
is the fallback — but it is a stated retreat recorded in the change, not a quiet
substitution.

---

### C7 · Flutter toolchain and `hooks_riverpod`

**GAP-E is unresolved and this change must resolve it, not step around it.**

`pubspec.yaml:18-20` records an observed failure: *"The 3.4/4.0.6 line … cannot
resolve against Flutter 3.44.8."* That is exactly the line this change targets.
Local Flutter is **3.48.0-0.3.pre (beta)** — a green run here says nothing about
3.44.8 stable, which `environment.flutter: ">=3.44.0"` promises.

**Tasks**

1. **First, reproduce or refute the recorded failure.** Attempt resolution with
   the target set against the declared floor. Record what was actually observed.
2. Then, whichever holds:
   - **Refuted** — bump in place, keep `>=3.44.0`, and replace the stale
     comments with the new observation and its date.
   - **Confirmed** — raise `environment.flutter` to the version that does
     resolve. **This is a breaking change for the Dart package** and must be
     recorded as such in C9; it is the one thing in this phase that could push
     the Dart artifact past a minor.
3. Apply: `flutter_riverpod` → `hooks_riverpod 3.4.3`, add
   `flutter_hooks 0.21.3+1`, `riverpod_annotation 4.0.7`,
   `riverpod_generator 4.0.9`, `build_runner 2.16.1`, `riverpod_lint 3.1.9`.
4. Regenerate `src/providers.g.dart` via `build_runner`.

**Verify:**
```bash
flutter pub get          # from packages/entity_graph_flutter
flutter analyze
flutter test
```

Report the **Flutter version the checks actually ran on**. A result whose
toolchain is unstated is not evidence for the declared floor.

`hooks_riverpod` re-exports `flutter_riverpod`, so existing `ConsumerWidget`
consumers are unaffected. The package has no widgets (17 files, zero
`ConsumerWidget|HookConsumer|WidgetRef` matches), so this is a dependency change
plus codegen, not a rewrite.

---

### C8 · Dart hook helpers

**Tasks**

1. Add `lib/src/hooks/use-entity.dart`, `use-entity-list.dart`,
   `use-entity-query.dart`, mirroring the React binding's hook names and
   semantics.
2. Export them from `lib/entity_graph_flutter.dart`.
3. **GAP-F:** register the new exports —
   `node scripts/dart-public-api-contract.mjs --write` (`refresh:dart-exports`),
   which updates
   `prometheus-entity-skills/_shared/references/dart-library-exports.json`.
4. Widget tests for each helper.

**Verify:**
```bash
pnpm run verify:dart-exports     # fails if the ledger is stale
flutter analyze && flutter test
```

---

### C9 · Version, gate, publish

**The only irreversible change. Nothing here starts until C1–C8 are green.**

**Tasks**

1. `pnpm changeset` — one minor covering the `fixed` group. All 12 existing
   packages **plus** `entity-graph-react` **plus** the alias → **3.3.0**.
2. `pnpm run version-packages`.
3. `entity_graph_flutter` 3.1.0 → **3.3.0** (closing the JS/Dart skew), unless
   C7 forced an SDK-floor raise — then record the breaking change explicitly and
   re-decide the Dart version alone.
4. Sweep the remaining ~348 doc/test/generated references to the old name.
   `pnpm run readme:write` and `pnpm run refresh:exports` handle part of it.
5. Full gate run:
   ```bash
   pnpm run validate:release-contract
   pnpm run verify:package-contracts
   pnpm run verify:binding-singletons
   pnpm run verify:skills
   pnpm run verify:no-workspace-leak -- --local
   pnpm run release:check
   ```
6. **Publish with `pnpm publish`, never `npm publish`.** The 3.0.0 run used
   `npm publish`, which does not rewrite `workspace:` specifiers; ten of twelve
   packages shipped a literal `workspace:^` and became uninstallable.
7. Post-publish, against the **registry**:
   ```bash
   node scripts/verify-no-workspace-leak.mjs 3.3.0
   ```
8. `npm deprecate '@prometheus-ags/prometheus-entity-management@3.3.0'
   'Renamed to @prometheus-ags/entity-graph-react. This alias re-exports it and
   will keep working.'`
9. Publish `entity_graph_flutter` 3.3.0 to pub.dev.

**Verify:** a clean-room install of `@prometheus-ags/entity-graph-react@3.3.0`
outside the repo, plus an install of the alias importing `.../devtools`, both
resolving and type-checking.

---

## Ordering rationale

C1 and C2 are **decisions that constrain writes**. Both are cheap, reversible,
and produce artifacts every later change reads. Doing them first is what keeps
C3–C8 from being rewritten.

C5 is independent and could run at any point; it is placed early because the
**parent phase depends on it** and an early failure there is worth knowing before
the expensive changes.

C6 must follow C2 or there is no way to distinguish "v9 changed our public
types" from "we changed our public types".

C7 and C8 are independent of the JS work and could run in parallel by a second
agent. C8 must follow C7 (codegen).

C9 is last and is the only irreversible step. A publish cannot be undone —
`npm unpublish` is restricted and does not restore consumer trust.

---

## Recommended agent per change

| Change | Agent | Why |
|---|---|---|
| C1, C2 | `architect` | decisions with downstream constraints |
| C3, C4 | `typescript-reviewer` | manifest + registry correctness |
| C5 | `general-purpose` | one range, one test |
| C6 | `typescript-reviewer` | major migration, type-surface sensitive |
| C7, C8 | `flutter-reviewer` | Dart/Flutter idiom + codegen |
| C9 | `code-reviewer` | irreversible; wants a second reader |

---

## What this plan does not do

- **Touch the consuming application.** `scope.json` denies `web/`, `mobile/`,
  `crates/`, `desktop/`, `docs/`.
- **Fix `prometheus-entity-sync`.** Its JS SDKs are v0.1.0 with no build. Real,
  but a different repo and a different phase.
- **Raise open `>=` peer floors** without a named failure.
- **Migrate examples to v9 beyond compiling.** Feature parity in the examples is
  not this phase's deliverable.

---

## Unverified at plan time

Named so execute checks rather than assumes:

1. Whether `verify-package-contracts` tolerates an alias with three entrypoints
   against a one-entrypoint contract (C4). The React package passing today is
   suggestive, not proof.
2. Whether adding `TFeatures` to the `ColumnMeta` augmentation compiles, or
   whether `metaHelper()` is required (C6).
3. Whether the newer Riverpod line resolves on Flutter 3.44.8 (C7). **Cannot be
   tested on this machine** — local Flutter is 3.48.0 beta.
4. Whether `sortingFn` or `columnPinning` appear anywhere in the source. Grep
   found none; C6 confirms.

## The uncomfortable thing

This phase raises the floor under a library the application has not yet written
a line against. If the parent's plan later shows the entity graph is the wrong
abstraction for the evidence-timeline slice, C6 will have been careful work
aimed at the wrong target. C1–C5 and C7–C9 survive that outcome; the v9
migration mostly does not.

The counter-argument for doing it now: the parent chose ElectricSQL, C5 is on
that path, and a major upgrade is cheaper before consumer code exists than after.
