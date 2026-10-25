---
name: deploy-hybrid-agentic-stack
description: Plan, scaffold, configure, and verify a full hybrid agentic application spanning React web, Tauri desktop, Flutter mobile, a shared Rust host, Axum, Flint Forge/Fabric/Gate, optional Ory Kratos, and local or BYOK LLMs. Use when adding web deployment, realtime sync, cloud inference, authentication, Docker Compose, Kubernetes, or full-stack deployment options to a TJ-ARCH-MOB-001 project.
---

# Deploy Hybrid Agentic Stack

Build deployment choices around one host-neutral Rust application layer while preserving
the mandatory Flutter-mobile and recommended Tauri-desktop architecture. Apply
Apply the consuming project's `AGENT_BASE_RULES.md` and architecture authority
before changing code; this standalone skill does not replace project policy.

## Choose the requested surface

Use only the profiles the operator requests:

| Profile | Includes |
|---|---|
| `local` | Tauri/Flutter, embedded Rust services, local model, local persistence |
| `web` | React 19 bundle, Axum API/static host, PostgreSQL-compatible persistence |
| `realtime` | `web` plus Flint Forge and Flint Realtime Fabric |
| `authenticated` | Gate plus Ory Kratos; never required for the anonymous demo |
| `full-agentic` | web, realtime, Gate/Kratos, Liter-LLM BYOK, observability |

For scaffold generation expose `--mobile flutter|tauri|both|none`; default to `flutter`.
Do not replace Flutter mobile with Tauri unless the operator explicitly chooses it.

## Required boundaries

1. Put inference, persistence, memory/RAG, MCP, agent logic, configuration, and sync in
   the shared Rust service layer.
2. Make Tauri commands, Flutter FFI, and Axum handlers thin adapters over the same typed
   services. Do not duplicate domain behavior in TypeScript or Dart.
3. Route hosted React traffic through optional Gate, then Axum, then shared services.
   The browser must not directly orchestrate Forge, Fabric, Gate, or Liter-LLM.
4. Keep React data flow `component -> hook -> PEM 3.x/Zustand store -> transport`.
   TanStack Query is prohibited.
5. Use AG-UI SSE for runs and typed ContentBlocks for thinking, citation, memory, tool,
   artifact, and media events.

Read [architecture.md](references/architecture.md) before implementing service or API
changes. Read [deployment.md](references/deployment.md) before emitting containers or
Kubernetes resources.

When a Prometheus deployment catalog is available, consume its pinned sources,
immutable image digests, Compose profiles, PostgreSQL distribution, and GitOps
components. Do not invent a second build path inside a generated application.

## Asset modes for Axum

Both modes read a env-var prefix derived from the application name (`<APP>_`,
SCREAMING_SNAKE_CASE) — never a hardcoded product prefix.

- **Embedded:** `build.rs` consumes `<APP>_WEB_DIST_DIR` or invokes the tracked package
  build into `OUT_DIR`. It must never install dependencies or modify the source tree.
- **External:** runtime `<APP>_WEB_ROOT` points to an existing compiled bundle. Reject an
  invalid directory at readiness time. If unset, use embedded assets.
- Serve hashed assets with immutable caching, `index.html` with no-cache, client routes
  through an SPA fallback, and unknown API routes as 404.

## BYOK rules

- Derive providers and capabilities from Liter-LLM's registry; do not hard-code a stale
  provider list.
- Anonymous hosted keys are memory-only and session-bound. Durable hosted keys require
  authenticated identity and encrypted Flint Vault references.
- Local desktop/mobile keys use platform secure storage.
- Never store secret values in PEM, PGlite, Zustand, logs, URLs, ordinary database
  columns, images, Compose files, or ConfigMaps. APIs return metadata, never key values.

## Completion gate

Do not call the stack working until a clean checkout proves install, production build,
real launch, persistence, one public-boundary workflow, health/readiness, and the selected
Compose/Kustomize profiles. Use `hybrid-runtime-verification` for the executable proof and
`karpathy-progress-memory` at each verified phase boundary.
