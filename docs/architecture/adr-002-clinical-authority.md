# ADR-002 · Clinical authority is enforced in three places

**Status** Accepted · **Date** 2026-09-04

## Decision

Affirming the surgeon gate and signing a letter are checked at **three
independent layers**, and none of them is permitted to assume another ran.

| Layer | Mechanism | What it catches |
|---|---|---|
| Gateway | Policy decision on the verified session | A caller with no right to invoke the action at all |
| Application core | `AppServices::affirm_gate` / `sign_letter` capability check | A typed refusal the interface can explain to a human |
| Database | `enforce_gate_authority`, `enforce_letter_signing` triggers | Anything that bypassed both — a batch job, a psql session, a future route |

## Why not one layer

Each layer answers a different question and fails differently.

The **database** trigger is the floor. A service role can bypass row-level
security, so a rule that lives only in row-level security is not a rule for
every caller. A trigger is.

The **core** check exists so a refusal arrives as `CapabilityDenied` rather than
a constraint violation. "You may not affirm this case" is actionable; a
Postgres error code is not.

The **gateway** check exists because an AI assistant acting for a surgeon is a
*different principal* — `Agent`, not `User`. A policy granting a surgeon the
ability to sign grants a delegated agent nothing. Authority is re-granted per
action or it does not exist.

## Consequences

- Three checks means three places to update when a capability changes. That is
  the cost, and it is deliberate: the alternative is one place to forget.
- `MemoryAuthority` in the web binary models the boundary faithfully rather than
  approving everything, so a test that accidentally proves an administrator can
  sign a letter fails locally instead of in production.

## Runtime alignment — 2026-09-06

Kratos verifies identity; authoritative ASO membership and policy grant clinical
capabilities. The session store exposes a verified presentation projection and
cannot authorize a command. Native IPC must reach the same Gate, AppServices
and authoritative Postgres checks as HTTP. A local PGlite or SQLite replica is
never the authority for affirmation or signing. Both operations require online
validation and must not replay automatically after reconnection.

An administrator cannot affirm or sign. An agent never inherits its human
principal's clinical authority. Generated assertions require document, page and
date citations; local optimistic state cannot invent a committed clinical act.
These are target invariants, not certification that every runtime enforces them.
See [ADR-008](adr-008-shared-runtime-state-and-sessions.md) and
[ADR-009](adr-009-authorized-replicas-and-updates.md).
