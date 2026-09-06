# Reflection — pem-refresh-3-3-0

**Completed** 2026-09-05 · **Shipped** `4.0.0` to npm (13 packages) and pub.dev

## Delta between plan and delivery

The plan said **3.3.0, 9 changes, react-table v9 deferred**. What shipped was
**4.0.0, ESM-only, with v9 included**. Three of the plan's load-bearing
assumptions were wrong, and each was found by execution rather than by review.

| Planned | Delivered | Why it moved |
|---|---|---|
| 3.3.0 minor | **4.0.0 major** | ESM-only breaks CJS consumers |
| dual-format CJS + ESM | **ESM-only, all 13** | react-table v9 is ESM-only; a `.d.cts` cannot `require` ESM types (TS1479) |
| C6 deferred | **C6 done** | the deferral rested on my own verification error |
| 9 changes | 9 changes + ESM conversion | the conversion was not foreseen at plan time |

## Root causes, not just outcomes

### 1. I verified a name and called it an API

Planning inspected the v9 tarball, confirmed `ColumnDef` still existed, and
concluded the release could stay a minor. `ColumnDef` does exist — with a
different arity:

```
v8  ColumnDef<TData, TValue>
v9  ColumnDef<TFeatures extends TableFeatures, TData extends RowData, TValue>
```

Existence was checked; **shape was not**. That single omission produced a
BLOCKING gap in assess, a mid-execution stop in C6, a deferral the operator had
to overturn, and a rework cycle.

The correction is specific: when a dependency major "keeps" a type that crosses
your public API, grep the shipped `.d.ts` for the full generic signature. A
symbol that resolves is not an API that fits.

### 2. Two gates had silently stopped being gates

- `verify-binding-singletons` built a deliberately-incompatible fake core
  pinned at a literal `4.0.0`. When the real packages reached 4.0.0 the fake
  became compatible; the install it expected to fail succeeded. It crashed
  rather than passing quietly, which was luck, not design.
- `validate-v3-release-contract` hardcoded `major !== 3`.

Both are now derived from current state. A fixture asserting "this must NOT
work" expires the moment reality catches up to its literal.

### 3. Careless reverts cost verified work twice

`git checkout -- <paths>` to undo an in-progress change twice reverted a
*different, already-completed* change touching the same files. C2 was lost once,
C3 and C5 a second time. Both were caught and restored, but only because
something else failed afterward — not because anything checked.

I logged the lesson after the first occurrence and then repeated it. The rule
that would actually have worked: commit a completed change before starting the
next one.

### 4. I diagnosed a broken release from one uncached registry read

Immediately after publish, `npm view` returned 404 for the new package name and
stale 3.2.0 for two others. I reported a partial publish that had left the alias
uninstallable. Nothing was broken — propagation lag on a brand-new name, plus
cache. The operator's `EPUBLISHCONFLICT` on retry was the evidence.

Cost: an alarming and wrong status report at the most sensitive moment of the
phase.

## What went right, and why

**C2 was the highest-leverage change in the phase.** Freezing the public column
type behind `EntityColumnDef<T>` *before* touching react-table meant the v9
widening was absorbed at one boundary instead of breaking seven exported
builders. Its type-level guard — deliberately proved to fail on a real break —
is what made "consumers are unaffected" a checked claim rather than a hope.

**Two real defects were caught by reading output, not by gates passing.**
Tree-shaking silently gutted the alias's `devtools/auto` side-effect import,
leaving an entrypoint that resolved, type-checked, packed, and did nothing.
`verify:package-contracts` passed it green. Only reading the emitted `.mjs`
found it.

**GAP-E was refuted rather than assumed.** The pubspec comments asserting the
newer Riverpod line could not resolve were tested and found wrong; the real
blockers were a workspace-member pin and a dependency I had added myself. A
failure that *looks* like the recorded one is not evidence for it.

## Honest gaps in what shipped

- **Flutter `>=3.44.0` remains unverified.** Everything ran on 3.48.0 beta. The
  floor was deliberately not raised, so it is declared but unproven.
- **Nothing was committed.** The PEM working tree carries the published 4.0.0
  state uncommitted — the registry and the repo can drift from here.
- **No consumer has used any of this.** The parent phase has not written a line
  against the entity graph. The v9 migration in particular is careful work whose
  target is still unproven.
- **`prometheus-entity-sync` is untouched** and still ships v0.1.0 JS SDKs with
  no build. Out of scope, still real.

## Recommended next phase

Return to **`web-ui-architecture`** and execute its plan, with two amendments:

1. G3's install line is `@prometheus-ags/entity-graph-react@^4.0.0`.
2. Add an ESM audit to G1 — these packages no longer ship CommonJS, so any
   Node-side tooling in `web/` using `require()` must move to `await import()`.

Before that, one small task worth doing while it is cheap: **commit the PEM
4.0.0 state**. A published release whose source is uncommitted is one machine
failure away from being unreproducible.
