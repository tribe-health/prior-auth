# Assessment — web-ui-architecture› pem-refresh-3-3-0

**Phase** `pem-refresh-3-3-0` (depth 2) · **Parent** `web-ui-architecture`
**Stage** assess · **Date** 2026-09-04
**Target repo** `/Users/gqadonis/Projects/prometheus/prometheus-entity-management` @ `d1588d8c` (`main`)

Every fact below was read from a registry, the filesystem, or vendor docs in
this session or the one that spawned this phase. Nothing is quoted from memory.

---

## 1 · Baseline — the repo is healthy, not broken

This is a mature release pipeline, and that is the dominant constraint on how
this phase must work.

| Signal | State |
|---|---|
| `validate:release-contract` | **0 errors** · 16 artifacts · 12 npm packages · release 3.2.0 |
| Working tree | clean of source changes (only KBD/knowledge artifacts) |
| Tooling | turbo + changesets + pnpm 10.33.0 (pinned via `packageManager`) |
| Governance | `release/v3-release-contract.json` is Ajv-schema-validated |
| Registry | all 12 packages public at 3.2.0, `latest` tag correct |
| `private: true` | **none** of the publishable packages |

The original suspicion that prompted this phase — "things being private or
unpublished" — is **not what is wrong**. Nothing is private. The defects are a
single naming inconsistency and ordinary dependency drift.

### Four coordinated registries define a package

A rename is not one edit. These four must agree or a gate fails:

1. `scripts/public-packages.mjs` — `PUBLIC_PACKAGES[]` (`directory` + `name`)
2. `release/v3-release-contract.json` — `artifacts[]` **and**
   `versionPolicy.npm.packages[]`
3. `.changeset/config.json` — `fixed[0][]` version-lockstep group
4. the package's own `package.json`

---

## 2 · G1 — the rename, and the constraint that shapes it

### The defect, stated precisely

`packages/entity-graph-react/` is the **only** entry in `PUBLIC_PACKAGES` where
`directory` and `name` disagree:

```js
{ directory: "packages/entity-graph-react",
  name: "@prometheus-ags/prometheus-entity-management" },   // ← the anomaly
{ directory: "packages/entity-graph-alpine",
  name: "@prometheus-ags/entity-graph-alpine" },            // every other entry
```

Its own description reads *"the React bindings over
`@prometheus-ags/entity-graph-core`"* — so the flagship binding is the one
package whose install name cannot be guessed from its role. Alpine, Solid,
Svelte, HTMX, Tauri and web-components all follow the pattern.

**This is what produced GAP-2 in the parent phase.** A plan written from the
directory name would have emitted an unresolvable import.

### GAP-A (BLOCKING) · the alias needs its own directory

`scripts/package-contract-validation.mjs:25` asserts:

```js
assert(manifest.repository?.directory === publicPackage.directory,
  `${publicPackage.name}: invalid repository directory`);
```

Two packages therefore **cannot share one directory**. The chosen additive-alias
shape requires a second package directory — the alias cannot be a second
`package.json` inside `packages/entity-graph-react/`.

Every published package must also satisfy, from the same file:

- `type: "module"`, MIT licence, `author`, `homepage`
- `main`/`module`/`types` **exactly** `PACKAGE_ENTRYPOINT_CONTRACT`
  (`./dist/index.cjs`, `./dist/index.mjs`, `./dist/index.d.ts`)
- conditional `exports` byte-identical to the contract
- `engines.node === "^22.14.0 || ^24.0.0 || >=26.0.0"`
- `files` containing `dist`, `README.md`, `CHANGELOG.md`

**Consequence for the alias.** `PACKAGE_ENTRYPOINT_CONTRACT.exports` declares
**only** the `.` entrypoint. But the React package publishes **three** —
`.`, `./devtools`, `./devtools/auto` — via a `typesVersions` block and extended
`exports`. An alias that re-exports only `.` silently breaks every existing
consumer importing `.../devtools`. The alias must reproduce all three **and**
still satisfy a contract check written for one. Whether the checker tolerates
the superset is **unverified** — the React package passes today with extra
entrypoints, which suggests it does, but that must be confirmed, not assumed.

### GAP-B · `workspace:` protocol leak is a known prior incident

`scripts/verify-no-workspace-leak.mjs` exists because of a real failure:

> *"the 3.0.0 stable run used `npm publish`, which — unlike `pnpm publish` —
> does not rewrite `workspace:` specifiers as it packs. Ten of the twelve
> packages shipped a literal `workspace:^`/`workspace:*` to the registry and
> became uninstallable."*

The React package still carries `"@prometheus-ags/entity-graph-core":
"workspace:^"` in `peerDependencies`. I verified the **published** 3.2.0
manifest and it reads `^3.2.0` — pnpm rewrote it correctly, so this is not
currently broken. It is a live hazard for a new package published by the wrong
command, and doubly so for an alias whose entire purpose is to depend on
another workspace package.

**Publish with `pnpm publish`, never `npm publish`**, and run
`verify-no-workspace-leak` against the registry after publishing, not only
against local tarballs.

---

## 3 · G3 — react-table v9 is the largest risk in this phase

### Actual call sites (counted, not estimated)

| Location | Surface |
|---|---|
| `src/ui/entity-table.tsx:8,68,72,103,129` | the **only** `useReactTable` call in the library |
| `src/ui/columns.tsx:9,22-27` | `ColumnDef` import + `declare module` augmenting `ColumnMeta` |
| `tsup.config.ts:34` | external marker |
| `examples/nextjs-app` × 5, `examples/vite-app` × 5 | mostly `type ColumnDef` only |

The library's exposure is **one component**. The examples are mostly type
imports. That is smaller than "15 call sites" implied.

### GAP-C (BLOCKING) · `ColumnDef` is in the public API

`src/index.ts:392` exports `EntityTable`, and `EntityTableProps<T>` declares:

```ts
columns: ColumnDef<T>[];
```

`ColumnDef` is a **v8 type crossing the package boundary**. Consumers construct
it. A v9 type change is therefore a **breaking change for consumers**, not an
internal refactor.

**This collides with G2.** A `fixed` group at 3.3.0 is a *minor* bump, and semver
says a minor does not break consumers. Either:

- the type surface stays compatible (verify, do not assume), or
- this release is **4.0.0**, not 3.3.0, or
- `EntityTable` re-exports its own `ColumnDef` alias so consumers are insulated.

**This must be resolved in plan.** Shipping a breaking type change as 3.3.0
would repeat — in a different form — the uninstallable-package failure the
workspace-leak gate was built to prevent.

### What v9 actually changes (TanStack migration guide, fetched)

| v8 (in use) | v9 |
|---|---|
| `useReactTable` | `useTable` |
| `getCoreRowModel()` | automatic — removed |
| `getSortedRowModel()` | `createSortedRowModel()` inside `tableFeatures` |
| `flexRender` | unchanged |
| `sortingFn` / `SortingFn` | `sortFn` / `SortFn` |
| `columnPinning.left/right` | `.start/.end` |
| destructured instance methods | **break** — now prototype-shared, lose `this` |

Plus a new **required** `features` option on every table.

`entity-table.tsx:72` passes `getCoreRowModel()` and `getSortedRowModel()`
together with `enableRowSelection: true` — all three move.

The decision is **explicit `tableFeatures`, not `stockFeatures`**; TanStack's own
guide calls the shortcut *"a migration shortcut, not the preferred production end
state."*

### GAP-D · the `declare module` augmentation

`columns.tsx:22-27` augments `ColumnMeta<TData, TValue>` with `entityMeta`. Module
augmentation is tied to the module's declared shape; whether v9 keeps
`ColumnMeta` with the same two type parameters is **unverified**. If the arity
or name changed, this augmentation fails to compile and the filter toolbar —
which reads `entityMeta` — loses its typing.

**Not a gap:** `SortHeader` (`columns.tsx:33`) types its `column` parameter
structurally rather than importing a TanStack type, so it survives v9 untouched.
Good prior design.

---

## 4 · G5/G6 — Flutter

### GAP-E · the existing pins encode an observed failure

`pubspec.yaml:18-20` and `:27-29` are not arbitrary:

> *"Bounded ranges retain the newest Riverpod generation line that resolves on
> Flutter 3.44 stable. The 3.4/4.0.6 line targets the newer Flutter test
> dependency matrix and **cannot resolve** against Flutter 3.44.8."*

> *"build_runner 2.15.2+ forces analyzer 13.3+, while Riverpod generator 4.0.4
> uses analyzer 12 and remains compatible with Flutter 3.44.8."*

Someone hit a real resolution failure and wrote it down. The G5 targets
(`hooks_riverpod 3.4.3`, `riverpod_annotation 4.0.7`, `riverpod_generator 4.0.9`,
`build_runner 2.16.1`) are **exactly the line those comments say does not
resolve on 3.44.8**.

**The local toolchain cannot settle this.** `flutter --version` here reports
**3.48.0-0.3.pre (beta)**. A green run on 3.48 beta says nothing about 3.44.8
stable, which is what `environment.flutter: ">=3.44.0"` promises.

Three honest options for plan, none of which is "just bump it":

1. Raise the SDK floor to whatever actually resolves, and state the new minimum.
2. Keep `>=3.44.0` and verify on 3.44.8 stable — requires that toolchain.
3. Adopt the newer line and accept that 3.44 users are dropped, recorded as a
   deliberate breaking change (which again argues 4.0.0, not 3.3.0).

Deleting the comments and bumping the numbers would discard a recorded
observation in favour of an assumption.

### The parity gap is real and G5 closes it

| | PEM `entity_graph_flutter` | prior-auth `mobile/` |
|---|---|---|
| `flutter_riverpod` | `>=3.3.2 <3.4.0` | **3.4.3** |
| `riverpod_annotation` | `>=4.0.3 <4.0.5` | **4.0.7** |
| `riverpod_generator` | 4.0.4 | **4.0.9** |
| `build_runner` | 2.15.1 | **2.16.1** |
| package version | **3.1.0** | — |

The library pins *below* what the consuming app already uses. Published on
pub.dev at 3.1.0 while JS sits at 3.2.0.

### G6 is additive, and cheaper than it sounds

The package has **no widgets** — 17 Dart files of providers, graph store,
transports and devtools. `grep` for `ConsumerWidget|HookConsumer|WidgetRef`
returns **nothing**. So:

- `hooks_riverpod` re-exports `flutter_riverpod`; existing consumers are
  unaffected.
- The three hook helpers are **new files**, not a rewrite.

### GAP-F · Dart exports are ledger-gated

`scripts/dart-public-api-contract.mjs` validates the barrels
(`lib/entity_graph_flutter.dart`, `lib/devtools.dart`) against
`prometheus-entity-skills/_shared/references/dart-library-exports.json`.
New hook helpers must be added to that ledger via `refresh:dart-exports`, or
`verify:dart-exports` fails.

---

## 5 · G4 — PGlite, and why it matters most to the parent

`entity-graph-core` carries `@electric-sql/pglite: "0.5.4"` as a **pinned**
devDependency; latest is **0.5.8**. Target is `^0.5.8`.

This is the smallest change in the phase and the one the parent most depends on:
`web-ui-architecture` selected **ElectricSQL 1.8.0** as its sync engine, and
`src/adapters/pglite-persistence.ts` plus its integration test are that path.

Note the asymmetry — `entity-sync-pglite` (the rejected engine) peers on
`@electric-sql/pglite ^0.2.0`, three minors stale. Not this phase's problem, but
it confirms the parent's engine choice.

---

## 6 · Gap register

| ID | Gap | Goal | Severity |
|---|---|---|---|
| **GAP-C** | `ColumnDef` is public API; v9 change breaks consumers under a *minor* bump | G2/G3 | **BLOCKING** |
| **GAP-A** | Alias needs its own directory (`repository.directory` assert); must carry 3 entrypoints against a 1-entrypoint contract | G1 | **BLOCKING** |
| **GAP-E** | Flutter pins encode an observed resolution failure the G5 targets contradict; local toolchain is 3.48 beta, not 3.44.8 | G5 | HIGH |
| GAP-B | `workspace:` leak hazard — prior incident made 10 packages uninstallable | G1/G8 | HIGH |
| GAP-D | `declare module ColumnMeta<TData,TValue>` augmentation may not survive v9 | G3 | MEDIUM |
| GAP-F | New Dart hooks must be registered in the export ledger | G6 | MEDIUM |
| GAP-G | Four registries must be updated together or gates fail | G1 | MEDIUM |
| GAP-H | 358 files reference the old name; docs/examples drift after rename | G1 | LOW |

---

## 7 · Open questions for plan

1. **GAP-C, decide first.** Is this 3.3.0 or 4.0.0? If `ColumnDef` changes shape
   in v9, a minor bump ships a breaking change. Options: verify type
   compatibility, re-export an insulating alias, or version this 4.0.0.
2. **GAP-A.** What is the alias directory called — `packages/entity-graph-react-alias/`,
   or does the *source* move to a new directory and the alias keep the existing
   one? The second is less churn in `repository.directory` terms.
3. **GAP-E.** Which of the three Flutter options? This determines whether
   `environment.flutter` changes, and that is itself a breaking change.
4. Does the alias need `verify:skills` registration, or is it exempt as a
   re-export shell?
5. Should the 10 example files migrate to v9 in this phase, or is the library
   plus a compiling example set sufficient?

---

## 8 · Scope discipline

In scope: the eight goals, in the PEM repo only.

Out of scope, and named so plan can refuse them:

- **`prometheus-entity-sync`.** Its JS SDKs are v0.1.0 with no build. Real, but
  a different repo and a different phase.
- **The consuming application.** `scope.json` denies `web/`, `mobile/`,
  `crates/`, `desktop/`, `docs/`. The parent owns those and is paused.
- **Broad dependency modernisation.** G7 found only two genuine staleness items
  (react-table, PGlite). Caret ranges already absorb react-virtual, immer,
  lucide-react, zustand, tailwind-merge. Raising open `>=` floors on
  `@ag-ui/core`, `@tauri-apps/plugin-sql` and `loro-crdt` without a named
  failure would be change without evidence.

---

## 9 · Self-review (sycophancy-correction S-01…S-08)

- **S-02 (unearned agreement).** The framing that prompted this phase was
  "things being private or unpublished." §1 records that **nothing is private**
  and all 12 packages are published. Adopting the premise would have produced a
  phase fixing an imaginary defect.
- **S-04 (scope inflation).** §8 bounds the work. G7's audit is reported as
  *two* real findings, not a modernisation sweep.
- **S-06 (confidence beyond evidence).** GAP-D and the alias-entrypoint question
  in GAP-A are marked unverified rather than predicted. The Flutter comments in
  GAP-E are treated as recorded observation that outranks my assumption.
- **S-07 (deference to instruction over evidence).** "Upgrade ALL components to
  latest" is followed, but GAP-C and GAP-E surface where *latest* conflicts with
  *minor-version semantics* and with a *recorded resolution failure*. Both are
  raised for decision rather than silently executed or silently dropped.

**Unverified in this assessment:**

- whether v9's `ColumnDef` is type-compatible with v8 for this usage (GAP-C)
- whether `ColumnMeta` keeps `<TData, TValue>` in v9 (GAP-D)
- whether the contract checker tolerates an alias with 3 entrypoints (GAP-A)
- whether the newer Riverpod line resolves on Flutter 3.44.8 (GAP-E) — **cannot
  be tested here**; local Flutter is 3.48.0 beta
- no build, test, or `flutter pub get` was executed in this stage

Each is a plan task with a named check, not an assumption carried forward.
