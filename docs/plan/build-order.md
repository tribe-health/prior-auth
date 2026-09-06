# Build order

The ordering is load-bearing. **Phases 1 and 2 are irreversible** — retrofitting
a privacy class or a session boundary means rewriting the schema and the
gateway. Everything from phase 5 onward is comparatively cheap to redo.

## Status

| Phase | Scope | State |
|---|---|---|
| 0 | Control, pins, token source | **done** — `tokens.toml`, `audit.sh`, workspace |
| 1 | Data and privacy contracts | **partial** — schema exists in `docs/design/schema/`; lane and privacy class per table not yet assigned |
| 2 | Security and identity | **partial** — `VerifiedSession` and the capability seam exist; the gateway is not wired |
| 3 | Runtime and protocol contracts | **not started** |
| 4 | Client state | **partial** — feature layering established for one feature |
| 5 | Design system and surfaces | **partial** — tokens generate both themes; screens not built |
| 6 | Deployment | **not started** |
| 7 | Verification | **gate** — recurs at every boundary, never "done" |

## Phase 1 — before another table exists

Every record needs a **lane** and a **privacy class**.

- Lane: server-authoritative relational, CRDT document, or append-only log.
- Privacy: `public`, `trusted`, or `local`. Unknown defaults to `local`, and
  local data is **structurally refused** at the sync boundary rather than
  filtered out.

The consequential rule for this product: **an embedding of local data is itself
local.** An embedding of a chart note is protected health information — text can
be reconstructed from the vector. The schema already refuses to store a vector
of patient text against a model that is not cleared for it; the client lane must
inherit the same rule.

## Phase 2 — before any agent or endpoint

The eight-step governed tool sequence, and the persona boundary.

The rule that matters most: **tool names and descriptions are untrusted data.**
A tool describing itself as safe is making a claim, not a guarantee. Effects are
classified independently of what the tool says about itself.

An AI assistant acting for a surgeon is a **different principal**. A policy
granting the surgeon the ability to sign grants the assistant nothing.

## Phase 3 — where a turn runs

Engine is a per-**device** choice; lane is a per-**turn** choice. Neither is
"mobile versus desktop". An unknown lane is rejected loudly — on the cloud lane,
defaulting means patient data leaving the device.

## What "done" means

Nothing is called working until every gate passes on every claimed surface, and
results are recorded in four words — **Passed**, **Build-only**, **Blocked**,
**Failed**. Only the first means finished.

A simulator is not a device. On iOS an over-budget model load does not raise an
error; the operating system kills the process. Native bridges bind by symbol
name, so a renamed class path compiles clean on both sides and fails at runtime.
