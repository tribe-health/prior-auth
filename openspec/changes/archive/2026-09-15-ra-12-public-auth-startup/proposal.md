## Why

The runtime assessment identifies a missing integration or invariant in this area. Mount real public authentication and explicit startup states is required to achieve the phase's authorized, scoped runtime outcome.

## What Changes

Implement real Kratos browser login/recovery flows with typed nodes and CSRF handling, and separate Anonymous from SessionUnavailable. Route public pages outside private providers; drive startup through environment/session/open/migrate/hydrate/catch-up states with scoped hooks.

## Capabilities

### New Capabilities

- `ra-12-public-auth-startup`: Mount real public authentication and explicit startup states.

### Modified Capabilities

None. The root OpenSpec spec store has no existing capability to modify.

## Impact

ASO: main composition, session/graph providers, public authentication feature and routing, proposed runtime status store/hooks; existing shadcn field/message parts.

Dependencies: ra-11c-sql-materialization. Runtime order: 4 / UI 2. Recommended agent: Codex; complexity L, High; model class frontier.

See the reviewed [phase plan](../../../.kbd-orchestrator/phases/runtime-architecture/plan.md) and its decision gates. This proposal authorizes no implementation during planning.
