# Hybrid agentic stack architecture

## Host-neutral Rust packages

- `gen_ui_host`: typed application services and domain ports. No Tauri, Axum, or Flutter
  dependency.
- `gen_ui_server_axum`: reusable router, request validation, AG-UI SSE, OpenAPI,
  readiness, and metrics adapters.
- `<app>-web-server`: thin binary that selects configuration, assets, and deployment
  adapters.

All three surfaces consume the same `AppServices`: Tauri through commands/events,
Flutter through FFI, and web through Axum. Public capabilities include conversation,
message, artifact, model/provider, secret-reference, memory/citation, run/cancel, health,
readiness, metrics, and OpenAPI operations.

## Data ownership

| Runtime | Durable conversation store | Transient UI state |
|---|---|---|
| Browser | Electric PGlite + PEM 3.x | Zustand |
| Tauri | pglite-oxide through Rust + PEM 3.x | Zustand |
| Flutter mobile | SQLite/sqlite-vec through Rust | Riverpod presentation state |
| Hosted | PostgreSQL 18 / Flint Forge | PEM 3.x + Zustand |

## Realtime and authentication

Treat Flint Forge as the PostgreSQL-centered data plane, Fabric as the realtime plane,
and Gate as the optional policy/auth boundary. Preserve Fabric v1. Add a tenant-scoped
v2 entity-type watch contract and make Forge re-check row-level access for each emitted
event. Gate accepts anonymous sessions only for explicitly public demo operations; Ory
Kratos supplies authenticated identities for durable cloud BYOK and private data.

## Provider execution

Local execution is the zero-configuration default. Hosted execution uses Liter-LLM via a
server-side provider registry and a write-only secret-reference API. An explicit local
selection must never silently fall back to cloud.
