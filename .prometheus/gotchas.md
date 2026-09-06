# gotchas

Append-only. Dated entries. Mark superseded entries; do not delete them.

## 2026-09-04
- Initialized by prometheus-context-bootstrap.
- Seeded from repository documentation. Each entry below was written against an
  observed failure, not anticipated.

### `void` is a reserved word in Dart
The evidence-state enum member is `voidState`; the wire value stays `"void"`.
The JSON contract is shared across Rust, TypeScript and Dart and does not bend
to one language's grammar. The Dart parse **throws** on an unknown value rather
than defaulting — a default silently converts an unrecognized state into a
plausible one, and the three states route work to three different people.
Source: `docs/architecture/adr-003-three-evidence-states.md`.

### A caret in the Dart analyzer graph hides a nonexistent version
An earlier draft pinned `riverpod_lint` to the `flutter_riverpod` version — a
number never published. `flutter pub get` caught it because the pin was exact.
A caret range would have resolved to something arbitrary and hidden the mistake.
`freezed`, `riverpod_generator`, `json_serializable` and `build_runner` each cap
the analyzer differently; the set moves together or not at all.
Source: `mobile/pubspec.yaml` header.

### `audit.sh` check 3 once flagged its own documentation
The first version grepped for `fetch(` / `invoke(` without stripping comments,
so a component whose code comment *explained* the prohibition tripped it. Now
the check strips comments first, and uses `(^|[^A-Za-z0-9_])` so `onAffirm(`
does not match `invoke(`.
Source: `scripts/audit.sh` check 3 comments.

### `audit.sh` check 1 once reported a nameless violation
`.DS_Store` and friends split to an empty basename under the kebab-case check
and reported as a violation with no name attached — worse than useless. The
check now skips dotfiles.
Source: `scripts/audit.sh` check 1 comments.

### Two hand-mirrored theme files drift silently
A previous project kept two theme files in sync by hand. They ended up with two
different values for the same background role and nothing in the build noticed.
Two palettes that agree on intent and disagree on values are worse than one ugly
palette, because every screenshot comparison becomes unreliable. Hence one
generated source.
Source: `assets/templates/design-tokens/tokens.toml` header.

### Brand ember fails contrast at body size
`#DF7C35` measures **3.08:1** on white — passes for 24px+ or 19px bold, fails
everything else. The instinct is to set body copy, small labels and table
headers in the brand orange because it looks like the brand. Use `#A85417`
(Ember Deep, 5.45:1) there instead; it reads as the same colour family at small
sizes and passes AA.
Source: `docs/aso-brand-guide.html`, "The one rule that will be broken".

### A React developer will reach for `useQuery`
The audit refuses it with a pointer to ADR-001. That is the intended behaviour,
not an obstacle. Transient state goes in Zustand; anything durable is an entity.
Source: `docs/architecture/adr-001-no-query-cache.md`.

### A simulator is not a device
On iOS an over-budget model load does not raise an error — the OS kills the
process. Native bridges bind by symbol name, so a renamed class path compiles
clean on both sides and fails at runtime.
Source: `docs/plan/build-order.md`.

### The tier-guard hook matches command text, not intent
`.claude/hooks/tier-guard.sh` pattern-matches Tier 3 commands in the Bash
command string. Writing documentation that *quotes* a release-build command via
a heredoc trips it. Observed 2026-09-04 while writing `.claude/rules/rust.md`.
Use the Write tool for file content, or `PROMETHEUS_TIER3=1` for a deliberate
one-off. Do not edit the waypoint to get past it.

### The bootstrap's `Edit(.kbd-orchestrator/**)` deny was too broad
Installed 2026-09-04 by `prometheus-context-bootstrap`, intending to stop an
agent editing the waypoint to fake its position past a tier gate. But
`.kbd-orchestrator/` also holds `phases/<name>/assessment.md`, `plan.md` and
`reflection.md` — the artifacts KBD skills are required to write. The blanket
deny blocked `/kbd-assess` from writing its own output, via Write *and* Bash.

Narrowed the same day to the two files the CLI owns:

    Edit(.kbd-orchestrator/current-waypoint.json)
    Edit(.kbd-orchestrator/project.json)

Those are written by `prometheus kbd phase|stage`, never by hand. Phase
artifacts are now writable. If a future bootstrap re-run restores the broad
rule, narrow it again — the managed region does not own `settings.json`
permissions, so this is a real regression risk.

Separately: the auto-mode classifier blocks `jq`/shell edits to
`.claude/settings.json` itself. Use the Edit tool for that file.

### The typed KBD runtime and the file waypoint are not in sync in this repo
`prometheus kbd status --json` reports `lifecycle: ready`, `phase: null`, and no
stages, while `.kbd-orchestrator/current-waypoint.json` holds a full phase tree
(`web-ui-architecture › pem-refresh-3-3-0`). The shell hook libraries under
`$KBD_ORCHESTRATOR_ROOT/shared/lib/` read the file waypoint and work fine; the
typed CLI does not see any of it.

Consequence observed 2026-09-04: `prometheus kbd stage transition --id plan`
fails with "stage plan was not found", and `implementationTotal` stays 0 in the
waypoint even after a plan emitted 9 changes.

Do NOT hand-edit `current-waypoint.json` to make the counters look right — it is
the position record, and `.claude/settings.json` denies Edit on it for that
reason. Either register the project with the runtime (`prometheus kbd register`)
or accept that stage counters are advisory here and the phase artifacts
(`plan.md`, `handoffs/*.json`) are the real record.

### Tree-shaking silently guts a re-export shim's side-effect entrypoint
Observed 2026-09-04 building the PEM compatibility alias
(`packages/prometheus-entity-management`).

`devtools/auto` is a SIDE-EFFECT entrypoint — importing it mounts the devtools
host. The alias source was:

    import "@prometheus-ags/entity-graph-react/devtools/auto";
    export * from "@prometheus-ags/entity-graph-react/devtools/auto";

The shared `definePackageConfig` sets `treeshake: true`, correct for real
packages whose code references its imports. A re-export shim has no such code,
so the bare import looks dead and was dropped. The emitted `auto.mjs` contained
only the `export *` line — the entrypoint resolved, type-checked, packed, and
did nothing.

**Nothing in the contract gate catches this.** `verify:package-contracts` passed
13 tarballs green including `are-the-types-wrong`: the entrypoint exists and its
types are right. Only reading the emitted `.mjs` revealed it.

Fix: `treeshake: false` for forwarding-only packages, plus `sideEffects` in
package.json so downstream bundlers do not repeat it. When building any
re-export shim, READ the emitted output — do not infer correctness from a green
build.

### `export *` drops default exports
Before relying on `export *` to forward a package surface, confirm the source
has no default export (`grep -c 'export default'`). PEM's three entrypoints had
none, so the alias is complete — but a default would have vanished silently.

### "The symbol still exists" is not "the API still fits" — check arity
Observed 2026-09-04 migrating PEM to `@tanstack/react-table` v9.

Planning inspected the v9 tarball, confirmed `ColumnDef` was still exported
(re-exported from `@tanstack/table-core`), and concluded the public type surface
could be held stable under a MINOR bump. It could not:

    v8:  ColumnDef<TData, TValue>
    v9:  ColumnDef<TFeatures extends TableFeatures, TData extends RowData, TValue>

`TFeatures` threads through every column, cell, header and row type. Existence
was verified; **arity and constraints were not**. 23 type errors followed,
including 14 implicit-`any` on callback bindings — the feature set now drives
context inference.

When a dependency major "keeps" a type you re-export publicly, grep the shipped
`.d.ts` for the full generic signature, not just the name. A symbol that
resolves is not an API that fits.

Same release: `ColumnMeta` gained `TFeatures` too, so `declare module`
augmentation silently stops applying (matching is by arity), and
`VisibilityState` is no longer exported from the react package at all.

### Revert only the files the change owns
`git checkout -- fileA fileB` to undo an in-progress change also reverted a
DIFFERENT, already-completed change that touched the same files. Caught and
restored, but verified work was nearly lost. Prefer `git stash push -- <paths>`
while iterating, or commit completed changes before starting the next one.

### Diff generated files against git HEAD, not a mid-session backup
Observed 2026-09-04 regenerating `providers.g.dart` in PEM.

`build_runner` reported "wrote 0 outputs", and a diff against a `/tmp` backup
showed IDENTICAL — so the file was reported as unchanged. `git status` then
showed it modified: three `_$…Hash()` staleness markers had moved.

The backup had been taken *after* an earlier codegen run in the same session, so
it compared the new output to the new output. "wrote 0 outputs" only means the
second run changed nothing relative to the first.

For any generated artifact, the baseline is `git diff`, never a copy made
mid-session. Here the change was benign (every changed line was a Hash line,
verified), but the same mistake on a real regeneration would have reported a
content change as no change.

### A brand-new npm package name 404s briefly after publish
Observed 2026-09-05 publishing `@prometheus-ags/entity-graph-react@4.0.0`.

`npm view` returned 404 right after `pnpm publish -r`, and the conclusion drawn
was that the publish had failed and left the compatibility alias uninstallable
(its only dependency). It had NOT failed. The retry produced:

    npm error You cannot publish over the previously published versions: 4.0.0.

That EPUBLISHCONFLICT was the proof it was already there; a re-query minutes
later showed 4.0.0 with the correct `latest` tag.

Propagation lag is longer for a name the registry has never served. Before
declaring a publish failed: re-query after a pause, and treat
EPUBLISHCONFLICT on retry as confirmation of success, not a new problem.

The same query also showed two OTHER packages at a stale 3.2.0 in the same
breath — also cache. Do not diagnose a partial publish from one cold read.

### A negative test pinned to a literal version stops being a test
`verify-binding-singletons.mjs` built a deliberately-incompatible "fake core"
pinned at a literal `4.0.0`, chosen when the real packages were 3.x. The moment
the real release reached 4.0.0 the fake became COMPATIBLE, the install it
expected to fail succeeded, and the gate crashed rather than passing quietly —
which was lucky. Derived from the real core's major now.

Any fixture asserting "this must NOT work" needs its incompatibility derived
from current state, or it silently expires.

### `kbd-child-exit.sh` overwrites handoff-out.md with a TBD stub on every failure
Observed 2026-09-05 closing `pem-refresh-3-3-0`.

The script writes a stub `handoff-out.md` **before** its runtime transition, so
every failed attempt destroys a hand-written handoff. It happened three times:
missing start receipt, `Pending → Complete` rejected, then `Complete →
Complete`. Only the reflection survived, because it is written earlier.

Back up `handoff-out.md` before invoking the script, or write it after the exit
succeeds.

### Closing a child needs a start receipt the child never got
The runtime rejected the exit with "boundary ... has no matching start receipt",
because this project's phase tree lives only in the file waypoint — the typed
runtime reports `phase: null` and never saw the child spawn.

The sequence that worked:

    prometheus kbd guard evaluate --boundary phase --edge before \
      --subject "<parent>::<child>" --repair-projections
    prometheus kbd phase transition --id "<parent>::<child>" --status in-progress
    prometheus kbd phase transition --id "<parent>::<child>" --status complete
    prometheus kbd phase activate --id "<parent>" --exact-next-work "..."

`phase activate` is what returns the pointer and clears `childPointer` — do that
rather than hand-editing `current-waypoint.json`, which is denied for good
reason.

## KBD runtime (2026-09-05)

- `prometheus kbd change transition` refuses `Pending → Complete`. Must pass
  through `in-progress` first. A batch that skips it fails silently if stderr
  is suppressed — always capture the error.
- `prometheus kbd stage enter` already sets `in-progress`; a following
  `transition --status in-progress` errors as a self-transition.
- `stage enter/transition` take `--id`/`--title`, not `--stage`.
- Registering changes only at phase close makes `progress.json` read `0 of 0`
  for the whole phase. Register at execute time so the ledger accumulates a
  trace rather than being reconstructed.
- `.claude/hooks/sycophancy-gate.sh` is INERT without
  `.prometheus/.review-pending`. Exit 0 from it is a no-op, not a pass — do not
  report it as a gate result. Run the detector directly instead.

## Web surface (2026-09-05)

- The prototype encodes evidence state on THREE channels: text label, shape
  (circle/square/diamond, `aso.css:357-362`), and colour. Shape is the one that
  survives greyscale and colour blindness — do not treat it as decoration.
- Ember `#DF7C35` measures **2.97:1** on white, not the 3.08:1 quoted in the
  plan. Fails AA at every size. `statusGap` is `#A85417` (5.32:1); never reach
  for `--color-accent-vivid` for text.
- `policy_criteria` is NOT among the five synced tables, so `criterionLabel` is
  null client-side. Render "Criterion unavailable offline" — a UUID in a label
  slot reads as working software to a developer and a data bug to a clinician.

## ElectricSQL 1.8.0 CANNOT serve a Postgres VIEW (2026-09-05) — BLOCKING

Measured, with a control, against a live stack:

```
GET /v1/shape?table=aso.sync_cases  -> 400  {"errors":{"table":["Table \"aso\".\"sync_cases\" does not exist..."]}}
GET /v1/shape?table=aso.cases       -> 200  snapshot-end
psql: information_schema -> sync_cases IS a VIEW; it exists.
```

Electric replicates from the Postgres logical replication stream. A view
produces no WAL records of its own, so it can never appear in a publication —
this is structural, not a config gap.

**Consequence.** W6/W8 made `sync_*` views the PHI boundary AND the tenant
boundary, and W7's read path assumes Electric serves them. The design does not
work as built. Options, none yet chosen:

1. Denormalize `practice_id` onto `case_evidence`, `evidence_citations`,
   `documents` + triggers. Electric syncs base tables with a flat `where`.
   Cost: the drift 20-electric-sync-views.sql was explicitly written to avoid.
2. ~~Materialized views~~ — TESTED AND ELIMINATED 2026-09-05. Also 400, and
   Postgres itself refuses: `CREATE PUBLICATION FOR TABLE aso.probe_mv_cases`
   -> "cannot add relation to publication ... not supported for materialized
   views." The constraint lives in Postgres logical replication, not Electric.
3. **RECOMMENDED — tested 2026-09-05.** Electric's own `columns=` and `where=`
   parameters do both jobs on a BASE TABLE, so no view is needed:

   ```
   ?table=aso.cases&where=practice_id='1111...'          -> 200  tenant scoping works
   ?table=aso.documents&columns=id,name,effective_date   -> 200  projection works
   ```

   Proved against a canary row holding `author_name='Dr PHI-LEAK-CANARY'`,
   `storage_uri='s3://phi-leak-canary/doc.pdf'`:

   - UNPROJECTED shape shipped the whole row — author_name, patient_id and
     storage_uri all on the wire.
   - PROJECTED shape returned the SAME row carrying only id, name,
     effective_date. No PHI.

   So the PHI projection survives without views. The tenant join
   (case_evidence/evidence_citations/documents -> cases.practice_id) still has
   no server-side equivalent, since a shape `where` cannot join — that part
   needs denormalized practice_id + triggers, or gateway enforcement.

CAUTION when testing shapes: Electric CACHES by shape definition. Re-requesting
an identical shape returns the earlier snapshot, so a shape created before an
INSERT comes back EMPTY and looks like a passing PHI test. Change the column
list (or use a fresh handle) and confirm the row is visible UNPROJECTED first,
or the test proves nothing.

The PHI column projection is the part that must NOT be lost in whichever
option is taken.

## flint-realtime-fabric needs a whole substrate (2026-09-06)

Not a config gap — 15 required env settings, plus iggy-server, keto,
keto-migrate and surrealdb, plus its own Postgres replication slot and
publication. Check `max_replication_slots` (10 here, Electric holds 1) before
adding a second CDC consumer to the same database.

The Debian `apt-get` failure seen on the first build ("Package
'ca-certificates' has no installation candidate") is TRANSIENT — it does not
reproduce, and the same install succeeds on retry. Do not treat it as a
Dockerfile defect.

## Six defects only a browser could find (2026-09-06)

Every one of these passed 49/49 tests, typecheck, lint, build and audit 6/6.

**1. The app rendered NOTHING.** `main.tsx` shipped `session={null}`, so
`GraphProvider` rendered its fallback forever: a permanent "Loading…" and no
routes. Correct as a fail-closed default, wrong as a shipped state. Fixed with
`app/providers/dev-session.ts`, gated on `import.meta.env.DEV` (statically
replaced at build time, so it tree-shakes out of production) plus a runtime
assertion.

**2. PGlite broke under Vite dep pre-bundling.**
`Error: Invalid FS bundle size: 637 !== 6295316` — Vite rewrote the 6MB WASM
filesystem bundle. PGlite's own docs require
`optimizeDeps.exclude: ['@electric-sql/pglite']`.

**3. theme.css generated NO utilities.** Tailwind 4 only processes `@theme` in
files reachable from the `@import "tailwindcss"` CSS graph. `theme.css` was
imported from **main.tsx**, i.e. from JavaScript, so Vite treated it as a plain
asset: every brand variable resolved to empty string and `text-accent`,
`text-display`, `bg-canvas` silently did nothing. Import it from `index.css`.

**4. Token collision between two design systems.** `index.css` maps
`--color-accent: var(--accent)` and `:root` set `--accent: oklch(0.97 0 0)`.
An INDIRECT mapping resolves at use time, so shadcn's near-white shadowed the
brand `#A85417` — the eyebrow rendered white on white. shadcn's scale is now
`ui-accent` / `ui-muted`; the bare names belong to `tokens.toml`. Note
shadcn `muted` is a SURFACE while brand `muted` is TEXT — do not merge them.

**5. Nested `<main>`.** AppShell renders `<main>`; `RoutePlaceholder` also did.
Visible in the accessibility tree as `main > main`.

**6. No visible keyboard focus anywhere.** All 12 focusable elements accepted
focus and none showed an indicator. Added a `:focus-visible` floor in
`@layer base` using `--color-focus`.

Also: the pipeline sidebar overflowed at 320/375px. Hiding it below `md` fixed
the overflow and STRANDED phone users with no navigation — a worse bug. Both
navs are now horizontal scrolling strips below `md`.

**Lesson: a green test suite says the code runs, not that the app works.**

## PEM peer mismatch resolves silently (2026-09-06)

`entity-graph-react@4.0.0` peer-requires `entity-graph-core: ^4.0.0`, but if
nothing declares core DIRECTLY, pnpm can satisfy the tree with **3.2.0** and
only emit a generic "Issues with peer dependencies found" line. Typecheck,
tests, build and audit all stayed green with the mismatch in place.

Check it explicitly:

    python3 -c "import json;print(json.load(open('web/node_modules/@prometheus-ags/entity-graph-core/package.json'))['version'])"

All Prometheus entity-management modules must be **4.0.0**.
