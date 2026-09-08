## Why

The runtime assessment identifies a missing integration or invariant in this area. Persist authenticated gate affirmation with independent controls is required to achieve the phase's authorized, scoped runtime outcome.

## What Changes

Replace the production memory affirmation path with verified human context and a Postgres transaction. Introduce the persisted command-result ledger for this operation, binding identity, practice, command ID and payload; install equivalent behavior on fresh and existing databases. Maintain the existing trigger-derived cases.gate_affirmed_at and serve its authoritative read; prevent callers from directly forging the derived value.

## Capabilities

### New Capabilities

- `ra-02-durable-affirmation`: Persist authenticated gate affirmation with independent controls.

### Modified Capabilities

None. The root OpenSpec spec store has no existing capability to modify.

## Impact

ASO: aso-host services/ports, Axum gate routes, Postgres adapter/composition, additive server migrations and desktop command wrapper; Gate: ASO clinical route policy.

Dependencies: ra-01-verified-session. Runtime order: 1. Recommended agent: Codex; complexity L, High; model class frontier.

See the reviewed [phase plan](../../../.kbd-orchestrator/phases/runtime-architecture/plan.md) and its decision gates. This proposal authorizes no implementation during planning.
