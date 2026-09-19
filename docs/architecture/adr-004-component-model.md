# ADR-004 · Three component layers, and a rule about which one you are in

**Status** Accepted · **Date** 2026-09-05

## Decision

Components live in exactly one of three places, and the boundary between them
is what a component is allowed to know.

| Layer | Path | Knows about | Example |
|---|---|---|---|
| **Vendor** | `web/src/components/ui/` | nothing in this product | shadcn `button`, `dialog` |
| **Library** | `web/src/shared/ui/` | design tokens and domain vocabulary | `evidence-badge`, `criterion-row` |
| **Feature** | `web/src/features/<domain>/components/` | one feature's data | `evidence-timeline-entry` |

`components/ui/` holds **unmodified** shadcn output. It is regenerable — treat
it as vendored. Do not add product logic there; the next `shadcn add` will
overwrite it and the loss will be silent.

`shared/ui/` is the product's own library. A component earns a place here when a
second feature needs it, not before.

## Why not one component directory

The three layers answer different questions, and collapsing them loses the
answer.

A vendor component asks *"how does a button behave?"* A library component asks
*"what does this product's evidence badge look like?"* A feature component asks
*"how does this screen show one evidence entry?"* Only the third may know the
shape of a case.

Without the split, product decisions leak into files that get regenerated, and
regenerating becomes a change with unpredictable blast radius.

## Promotion is on demand

`components/ui/` currently holds **61** shadcn primitives. The reference slice
needs a handful. Wrapping all 61 into `shared/ui/` before anything imports them
would be speculative work whose only measurable effect is more files.

A primitive is promoted when a feature needs it, and the promotion is where the
design tokens get applied.

## Consequences

- A feature component that reaches past its feature hook to the network is a
  layering violation. `scripts/audit.sh` check 3 fails the build on a bare
  `fetch(` or `invoke(` inside `features/*/components/*.tsx`.
- Filenames are kebab-case everywhere under `web/src` — `audit.sh` check 1. One
  casing convention, mechanically enforced, because mixed casing breaks
  case-insensitive filesystems in ways that only appear on someone else's
  machine.
- `shared/ui/` will look under-populated for most of this phase. That is the
  intended state, not an omission.

## Enforcement

`scripts/audit.sh` checks 1 and 3. The vendor/library boundary itself is **not
mechanically enforced** — nothing stops someone editing `components/ui/`. It is
a convention held by review and by this record, and it will be broken the first
time editing the vendored file is more convenient than promoting it.

## Runtime alignment — 2026-09-06

The same `web/` feature components run in browser and Tauri. Environment selection
belongs at the composition root and service adapters. Components use feature
hooks and PEM graph selectors; they do not open SQL databases, choose transports
or invoke the Tauri Zustand plugin directly. Public authentication routes mount
without a protected graph; private feature routes wait for verified scope and
coherent hydration. Components and hooks receive ADR-010's sanitized session
projection; they never receive or persist the native Kratos token. The Rust
application core remains shell-independent.

See [ADR-008](adr-008-shared-runtime-state-and-sessions.md) and
[ADR-010](adr-010-native-session-credentials.md). The boundary is a target
requirement; existing audit checks cover only their stated patterns.
