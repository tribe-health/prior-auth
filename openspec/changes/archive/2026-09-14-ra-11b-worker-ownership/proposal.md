## Why

The runtime assessment identifies a missing integration or invariant in this area. Own database opening, migrations and leader handover is required to achieve the phase's authorized, scoped runtime outcome.

## What Changes

Implement one worker database owner, namespaced by deployment/identity/practice/auth revision/generation, and a checksummed migration lifecycle before allowing sync. Use an exclusive cross-tab owner/schema lease and explicit recovery state.

## Capabilities

### New Capabilities

- `ra-11b-worker-ownership`: Own database opening, migrations and leader handover.

### Modified Capabilities

None. The root OpenSpec spec store has no existing capability to modify.

## Impact

ASO: proposed replica worker/owner service, migration ledger and scope/generation repository; browser ownership tests.

Dependencies: ra-11a-sync-conformance. Runtime order: 4. Recommended agent: Codex; complexity L, High; model class frontier.

See the reviewed [phase plan](../../../.kbd-orchestrator/phases/runtime-architecture/plan.md) and its decision gates. This proposal authorizes no implementation during planning.
