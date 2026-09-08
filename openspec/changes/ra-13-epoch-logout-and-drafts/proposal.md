## Why

The runtime assessment identifies a missing integration or invariant in this area. Fence scope changes and failed logout across tabs and reloads is required to achieve the phase's authorized, scoped runtime outcome.

## What Changes

Invalidate the session epoch synchronously, lock protected rendering, drain old resources, and create a fresh graph on identity/practice/revision changes. Persist a noncredential logoutPending marker before revocation. Separate recoverable draft entities from disposable replica generations; clinical commands are never queued for replay.

## Capabilities

### New Capabilities

- `ra-13-epoch-logout-and-drafts`: Fence scope changes and failed logout across tabs and reloads.

### Modified Capabilities

None. The root OpenSpec spec store has no existing capability to modify.

## Impact

ASO: runtime/session coordinator, per-view store factories, logout control storage and draft repository; PEM: adopted lifecycle APIs.

Dependencies: ra-12-public-auth-startup. Runtime order: 4 / lifecycle 6. Recommended agent: Codex; complexity L, High; model class frontier.

See the reviewed [phase plan](../../../.kbd-orchestrator/phases/runtime-architecture/plan.md) and its decision gates. This proposal authorizes no implementation during planning.
