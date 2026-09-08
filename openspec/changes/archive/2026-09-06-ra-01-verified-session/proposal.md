## Why

The runtime assessment identifies a missing integration or invariant in this area. Return an authoritative ASO session and practice scope is required to achieve the phase's authorized, scoped runtime outcome.

## What Changes

Implement a sanitized session operation backed by active ASO membership in Postgres and verified Kratos identity. Derive subject/practice/principal/capabilities server-side; use transaction-local aso.kratos_identity_id with a non-bypass role. Add the corresponding typed desktop wrapper, inactive until host authentication is available.

## Capabilities

### New Capabilities

- `ra-01-verified-session`: Return an authoritative ASO session and practice scope.

### Modified Capabilities

None. The root OpenSpec spec store has no existing capability to modify.

## Impact

ASO: aso-server-axum session/router, aso-web-server adapters/composition, Gate/Kratos deployment config; Gate: Kratos credential normalization only where required. Forge: PostgreSQL substrate and verified transaction-context conformance, without ASO-specific logic in its generic gateway.

Dependencies: NONE. Runtime order: 1. Recommended agent: Codex; complexity L, High; model class frontier.

See the reviewed [phase plan](../../../.kbd-orchestrator/phases/runtime-architecture/plan.md) and its decision gates. This proposal authorizes no implementation during planning.
