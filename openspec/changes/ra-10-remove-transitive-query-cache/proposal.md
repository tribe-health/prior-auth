## Why

The runtime assessment identifies a missing integration or invariant in this area. Remove the unused bridge that brings SWR into the application is required to achieve the phase's authorized, scoped runtime outcome.

## What Changes

Reconfirm that @assistant-ui/ai-sdk is unused, then remove that dependency edge so its @ai-sdk/react→SWR closure is absent. Preserve the existing assistant-ui presentation surface and exact framework/PEM pins; do not introduce another cache.

## Capabilities

### New Capabilities

- `ra-10-remove-transitive-query-cache`: Remove the unused bridge that brings SWR into the application.

### Modified Capabilities

None. The root OpenSpec spec store has no existing capability to modify.

## Impact

ASO: web/package.json, lockfile and architecture dependency check; existing assistant-ui presentation components only if verification finds a real affected import.

Dependencies: NONE. Runtime order: independent invariant. Recommended agent: Codex; complexity M, High; model class frontier.

See the reviewed [phase plan](../../../.kbd-orchestrator/phases/runtime-architecture/plan.md) and its decision gates. This proposal authorizes no implementation during planning.
