## Why

The runtime assessment identifies a missing integration or invariant in this area. Evaluate a native SQLite materializer against the PGlite baseline is required to achieve the phase's authorized, scoped runtime outcome.

## What Changes

Implement a SQLite candidate for the complete approved projection revision used by ra-18, including annotations and the gate summary with native transactions/checkpoints and the same typed read model. Compare it against the PGlite baseline before selecting a release engine; graph snapshot persistence alone cannot count as a materializer.

## Capabilities

### New Capabilities

- `ra-19-native-sqlite-parity`: Evaluate a native SQLite materializer against the PGlite baseline.

### Modified Capabilities

None. The root OpenSpec spec store has no existing capability to modify.

## Impact

ASO: host-owned SQLite replica/query/migration adapter; PEM: engine-neutral committed projection contract and parity harness only.

Dependencies: ra-18-tauri-pglite-baseline. Runtime order: 5. Recommended agent: Codex; complexity L, High; model class frontier.

See the reviewed [phase plan](../../../.kbd-orchestrator/phases/runtime-architecture/plan.md) and its decision gates. This proposal authorizes no implementation during planning.
