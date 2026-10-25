---
name: axum-agent-gateway
description: Implement or audit an Axum boundary between an application and Universal Agent Runtime. Use for agent HTTP or SSE routes, verified identity, tenant derivation, Cedar authorization, cancellation, idempotency, event streaming, or UAR service integration.
---

# Axum Agent Gateway

The gateway authenticates and governs application requests; UAR remains the
agent runtime authority.

## Request sequence

1. Validate request shape and size.
2. Resolve `VerifiedSession` from server-side validation.
3. Derive tenant, actor, and allowed persona from the verified session.
4. Authorize the action and resource with the project policy engine.
5. Submit an idempotent run command to UAR with bounded budgets.
6. Stream typed AG-UI/A2UI events with correlation and resume IDs.
7. Propagate disconnect or explicit cancel to UAR.
8. Persist an immutable, redacted outcome.

Never accept caller-selected tenants, trusted roles, provider routes, or raw
tool permissions. Never execute an MCP transport directly.

## Tests

Cover forged/expired/wrong-audience credentials, cross-tenant access,
idempotent retries, cancellation, slow consumers, unknown events, policy
denial, and restart/resume from the last event ID.
