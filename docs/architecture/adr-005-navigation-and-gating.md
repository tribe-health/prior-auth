# ADR-005 · Navigation requires verified scope and committed case state

**Status** Accepted · **Date** 2026-09-05

**Runtime reconciliation** 2026-09-06; see the [ADR index](README.md).

## Decision

The case pipeline is **ten ordered steps**, and steps **07–10 are unreachable
until the surgeon gate is affirmed**.

| # | Step | Gated |
|---|---|---|
| 01 | Case dashboard | |
| 02 | Intake checklist | |
| 03 | Evidence timeline | |
| 04 | Policy panel | |
| 05 | Pathway comparison | |
| 06 | Surgeon gate | |
| 07 | Letter & QA | **yes** |
| 08 | Submission packet | **yes** |
| 09 | Receipt & custody | **yes** |
| 10 | Peer-to-peer | **yes** |

Source: `docs/design/prototype/assets/shell.js:377-390`, where those four
entries carry `gated: true`. Global navigation is separately role-gated — the
admin console carries `requires: 'configure'`.

**Navigation requires a verified identity/practice scope, permission to read the
step, a ready coherent graph, and the committed case gate state.** Steps 07–10
require an affirmed case gate. Action capabilities are checked separately: a
coordinator permitted to prepare a packet after a surgeon affirms does not need
the surgeon's affirmation capability.

## Why not a UI flag

A flag is a claim the interface makes about itself. The surgeon gate is not a
UI state — it is a **clinical act** (ADR-002), checked at three independent
layers, none of which may assume another ran.

If navigation gates on a boolean the client owns, the client has become a
fourth layer that ADR-002 never authorised, and the weakest one: a flag can be
flipped by a bug, a stale cache, or a devtools console. The gateway policy,
`AppServices::affirm_gate`, and the Postgres trigger would still refuse the
action — so the failure is not a security breach. It is worse in a different
way: **a screen that lets a coordinator draft a letter the system will refuse to
transmit**, discovered after the work is done.

Combining verified permissions with committed case state makes navigation agree
with the authoritative workflow. Navigation never grants command authority.

## What this means concretely

- The shell reads capabilities from the verified session, not from props.
- Steps 07–10 render as visibly unavailable with a reason — not hidden. A
  missing step is a confusing interface; a step that says *"Awaiting surgeon
  affirmation"* is an accurate one.
- An agent is a separate principal and never inherits a surgeon's clinical
  authority. Its read navigation follows explicit policy and committed case
  state; neither a visible route nor a human delegation grants signing rights.
- Public login/recovery routes do not wait for a database. On identity or practice
  change, hide protected routes until the new scope is verified and hydrated.
  Runtime unavailability is not evidence `void`, `gap`, or an unaffirmed act.

See [ADR-008](adr-008-shared-runtime-state-and-sessions.md) and
[ADR-009](adr-009-authorized-replicas-and-updates.md).

## Consequences

- The shell cannot be built before the session boundary exists. That ordering is
  deliberate; it is why the app shell depends on session wiring rather than the
  reverse.
- Adding a step to the pipeline means deciding whether it is gated. There is no
  default, and a step added without that decision is a bug.
- The prototype's step numbers (`01`…`10`) are part of the contract, not
  decoration. Coordinators refer to cases by where they are in the pipeline.

## Enforcement

Required behavioral tests cover an unaffirmed case, an affirmed case with an
allowed coordinator, missing read permission, unavailable hydration, and a scope
switch. **Not enforced by `scripts/audit.sh`** — the audit checks structural
boundaries. These target cases were not executed by this documentation change.
