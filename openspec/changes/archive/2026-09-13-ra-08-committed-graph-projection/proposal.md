## Why

The runtime assessment identifies a missing integration or invariant in this area. Publish committed replica batches atomically into PEM is required to achieve the phase's authorized, scoped runtime outcome.

## What Changes

Expose an explicit committed-SQL-batch input and publish normalized entities plus ordered lists at one graph boundary, reusing ingestFetchedList where appropriate. Preserve valid keys, deletes and generation replacement; do not add a second graph writer or mistake snapshots for SQL replication.

## Capabilities

### New Capabilities

- `ra-08-committed-graph-projection`: Publish committed replica batches atomically into PEM.

### Modified Capabilities

None. The root OpenSpec spec store has no existing capability to modify.

## Impact

PEM: proposed committed-replica projection adapter, graph atomic primitives and public exports; ASO: five-table identity/normalization contract fixtures only.

Dependencies: ra-07-scoped-pem-runtime. Runtime order: 3. Recommended agent: Codex; complexity L, High; model class frontier.

See the reviewed [phase plan](../../../.kbd-orchestrator/phases/runtime-architecture/plan.md) and its decision gates. This proposal authorizes no implementation during planning.
