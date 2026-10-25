---
name: entity-graph-web-shell
description: Design or review a React web shell whose normalized application state is owned by Prometheus Entity Management, with components reading through hooks and an Axum boundary owning remote effects. Use for entity graphs, PEM transports, PGlite projections, web-shell layering, or normalized cross-view updates.
---

# Entity Graph Web Shell

Use this contract for browser shells that project a normalized entity graph.

## Invariants

1. Components import feature hooks, never transports, `fetch`, or raw stores.
2. Hooks select normalized entities and expose intent-oriented operations.
3. Register one transport per entity type. Every mutation returns canonical
   entities so all subscribed views converge.
4. PGlite is a local projection and offline queue, not an authorization source.
5. The Axum boundary derives tenant and actor identity from `VerifiedSession`.
6. Agent actions enter through the UAR gateway; UI code never owns agent
   lifecycle or tool execution.
7. Unknown entity kinds remain inspectable and do not disappear silently.

## Verification

- Assert components contain no direct network or IPC calls.
- Exercise create/update/delete across two subscribed views.
- Restart the shell and verify projection recovery.
- Deny cross-tenant reads and writes at the server boundary.
- Verify offline replay is idempotent and preserves causal order.
