## Why

The runtime assessment identifies a missing integration or invariant in this area. Apply authorized streams and publish committed graph batches is required to achieve the phase's authorized, scoped runtime outcome.

## What Changes

Implement the bounded internal FRF-to-PGlite materializer selected after the ra-11a published candidate failed the authorized-facade check. Run it inside the owned worker and apply the approved projection revision, including the cases gate field. Commit SQL rows plus per-shape checkpoints in one transaction, then publish coherent graph entities/lists, preserving all three reference keys and generation/refetch behavior. The real materializer also owns the caller that converts an authorized replica revalidation failure into the shared session-revocation event consumed by the RA06 Zustand access fence.

## Capabilities

### New Capabilities

- `ra-11c-sql-materialization`: Apply authorized streams and publish committed graph batches.

### Modified Capabilities

None. The root OpenSpec spec store has no existing capability to modify.

## Impact

ASO: replica worker materialization service, shared sync projection/key mapping, replica-failure session event publisher and explicit live integration runner; PEM: adopted committed projection API.

Dependencies: ra-11b-worker-ownership. Runtime order: 4. Recommended agent: Codex; complexity L, High; model class frontier.

See the reviewed [phase plan](../../../.kbd-orchestrator/phases/runtime-architecture/plan.md) and its decision gates. This proposal authorizes no implementation during planning.
