## Why

The runtime assessment identifies a missing integration or invariant in this area. Fence scope changes and failed logout across tabs and reloads is required to achieve the phase's authorized, scoped runtime outcome.

## What Changes

Invalidate the session epoch synchronously, lock protected rendering, drain old resources, and create a fresh graph on identity/practice/revision changes. Own foreground/resume revalidation and persist a noncredential `logoutPending` marker before calling the server logout coordinator. The client consumes confirmed or incomplete logout results but does not own the ASO denial/retry journal. Separate recoverable draft entities from disposable replica generations; clinical commands are never queued for replay.

## Capabilities

### New Capabilities

- `ra-13-epoch-logout-and-drafts`: Fence scope changes and failed logout across tabs and reloads.

### Modified Capabilities

None. The root OpenSpec spec store has no existing capability to modify.

## Impact

ASO client: runtime/session coordinator, per-view store factories, foreground/resume checks, logout control storage and draft repository; ASO server: durable denial/retry and Kratos confirmation supplied by the RA06 repair; PEM: adopted lifecycle APIs.

Dependencies: ra-12-public-auth-startup. Runtime order: 4 / lifecycle 6. Recommended agent: Codex; complexity L, High; model class frontier.

See the reviewed [phase plan](../../../.kbd-orchestrator/phases/runtime-architecture/plan.md) and its decision gates. This proposal authorizes no implementation during planning.
