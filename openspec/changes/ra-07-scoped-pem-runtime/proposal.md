## Why

The runtime assessment identifies a missing integration or invariant in this area. Own hydration, status, listeners and persistence per runtime is required to achieve the phase's authorized, scoped runtime outcome.

## What Changes

Provide a strict explicit-scope runtime entrypoint with cancellable hydration, tracked saves, drainable disposal and queued-flush cancellation. Keep compatibility APIs separated; ASO must not use global fallback status/actions or automatic clinical replay.

## Capabilities

### New Capabilities

- `ra-07-scoped-pem-runtime`: Own hydration, status, listeners and persistence per runtime.

### Modified Capabilities

None. The root OpenSpec spec store has no existing capability to modify.

## Impact

PEM: core local-first-runtime/graph-actions/realtime-manager/Electric listener cleanup and React graph-store binding; public exports and focused package tests.

Dependencies: ra-06-bounded-revocation. Runtime order: 3. Recommended agent: Codex; complexity L, High; model class frontier.

See the reviewed [phase plan](../../../.kbd-orchestrator/phases/runtime-architecture/plan.md) and its decision gates. This proposal authorizes no implementation during planning.
