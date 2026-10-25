---
name: hybrid-mobile-architecture
description: Build, adopt, upgrade, and audit governed agentic applications with Flutter, Tauri, React, Axum, Rust, Universal Agent Runtime, A2UI/AG-UI, and Prometheus Entity Management. Use for KnowMe Builder projects, hybrid mobile or desktop apps, governed web shells, UAR integration, typed native bridges, agent-tool security, or non-destructive application generation.
---

# KnowMe Builder

Create, adopt, extend, and maintain governed agentic applications. UAR owns
agent execution, run lifecycle, model routing, and tool governance. Prometheus
owns development workflow lifecycle and cross-harness coordination. The
Builder owns application architecture, typed adapters, generation, skills, and
conformance tests.

## Distribution boundary

This standalone skill contains the architecture references needed for design and
review. Executable generation, environment remediation, and maintained templates
belong to the versioned `knowme-builder` CLI and the trusted source checkout.
Never assume repository scripts or templates exist beside an individually
installed skill. Use the public installation guide at
<https://know-me-tools.github.io/hybrid-mobile-architecture-skill/reference/installation>
when the CLI or native harness package is required.

## Quick orientation

Read the architectural standard document before any substantial work:
`references/arch-standard.md` — this is the decision-making authority.

For platform-specific deep dives:
- Flutter patterns → `references/flutter/patterns.md`
- Tauri/React patterns → `references/tauri/patterns.md`
- Rust core patterns → `references/rust/patterns.md`
- Auth patterns → `references/auth/patterns.md`

---

## Step 1 — Environment and contract check

Before any generation or adoption, run:

```bash
knowme-builder doctor --json
```

The source checkout also provides `scripts/check-env.mjs` for maintainers. An
individually installed skill must use `knowme-builder doctor --json` instead.

### Required tool matrix

| Tool | Minimum Version | Install command |
|------|----------------|-----------------|
| Rust + Cargo | 1.97.1 | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| Flutter SDK | beta channel, latest | Follow the public installation guide |
| Node.js | 26.5.0 (current release — pin, not `--lts`) | `curl -fsSL https://fnm.vercel.app/install \| bash && fnm install 26` |
| Tauri CLI | 2.10+ | `cargo install tauri-cli --version "^2"` |
| flutter_rust_bridge_codegen | 2.12+ | `cargo install flutter_rust_bridge_codegen` |
| cargo-ndk | latest | `cargo install cargo-ndk` (Android only) |
| create-tauri-app | latest | `npm create tauri-app@latest` |

Do not attempt environment remediation unless the user explicitly requests it.

---

## Step 2 — Determine the operation

Infer the operation from the request and existing project state; ask only when the
choice is ambiguous. Read `references/project-evolution.md` for greenfield,
brownfield and ongoing upgrade workflows.

### 2a. New project

Require an explicit profile and generation mode:

```bash
knowme-builder new <path> --profile <profile> --mode runnable|skeleton
```

Profiles are `sovereign-hybrid`, `governed-web-shell`, `flutter-mobile`,
`tauri-desktop`, and `axum-web`.

For a host-certification attempt, repeat `--target <triple>` for every native
target and add `--verify-ffi` for Flutter/Rust FFI. Missing requested
prerequisites must fail before the destination is written. Omitting these flags
generates complete runnable source but does not claim host certification.

### 2b. Existing application adoption

Never re-scaffold an evolved application. Preview first, then apply:

```bash
knowme-builder adopt <path> --profile <profile> --check
knowme-builder adopt <path> --profile <profile> --apply
```

The preview result reports `detectedSurfaces`, `missingSurfaces`,
`integrationSteps`, and conflicts so the architecture inventory remains useful
without creating adoption metadata.

Inventory actual source roots, entrypoints, dependencies, persistence and native
bridges first. Adoption metadata is not proof that missing layers or surfaces
were implemented. Preserve existing application behavior and user-owned files.
Apply requested architecture changes as bounded migrations with an executable
feature through the existing layers; do not replace the application with a new
scaffold or call disconnected generated snippets an integration.

### 2b.1. Continue evolving a previous output

Inspect `.knowme-builder/project.toml` and `generated.lock.json`, then preview:

```text
knowme-builder upgrade <path> --check
```

Review the version range, proposed files and conflicts before applying an
upgrade. Preserve local edits and original project identity. A successful file
refresh does not prove a dependency, schema or bridge migration is complete.
Unsupported versions and unresolved conflicts must be reported explicitly.
Rebuild and exercise the migrated feature on each affected surface; retain
recovery evidence. See `references/project-evolution.md` for current limitations.

### 2c. Code generation
- New feature module (Flutter or Tauri)
- New ContentBlock variant (full stack: Rust enum → Dart/TS sealed union → widget/component)
- New MCP server integration
- New SurrealDB query/store

### 2d. Audit
- Check architecture compliance against TJ-ARCH-MOB-001
- Verify state management patterns (Riverpod / Zustand + Prometheus Entity Management 3.x)
- Verify clean architecture boundaries (no direct store→API calls in components)

---

## Step 3 — Architecture rules (always enforce)

These are invariants. Violating them makes code non-compliant with the standard.

### Rust core (gen_ui_core)

1. **All networking, LLM interaction, inference, MCP, and agent logic lives in Rust.** Never re-implement these in Dart or TypeScript.
2. The crate exposes exactly one FFI surface: `api.rs` (Flutter) or Tauri commands/events (desktop).
3. One global Tokio runtime per process. Never create additional runtimes.
4. All CPU-bound work (inference forward passes, GGUF loading) uses `spawn_blocking`.
5. ContentBlock model + A2UI/AG-UI protocol pipeline is the canonical event contract between Rust and UI.

### Flutter state management (Riverpod 3.3)

Read `references/flutter/patterns.md` for the full Riverpod architecture.

**Key invariants:**
- Use `@riverpod` codegen annotations, never manual `Provider` declarations
- `AsyncNotifier` for async state; `Notifier` for sync state
- `autoDispose` on all streaming providers to prevent memory leaks
- Never access `ref.watch` outside build / provider bodies
- ContentBlock mutations happen only via `ChatNotifier.streamBlock()` — never direct state assignment
- Feature modules own their providers; cross-feature deps go through the domain layer

### Tauri + React 19 state management (Zustand 5 + Prometheus Entity Management 3.x)

Read `references/tauri/patterns.md` for the full React architecture.

**Strict layer boundary:**
```
Component → Hook → Store → [Rust IPC / API]
           ↑               ↑
      (hook only)    (store only, never component)
```

**Zustand (client-side state):**
- All client-side state lives in Zustand 5 stores
- Use `@tauri-apps/plugin-store` for Zustand persistence when state must survive restarts
- Rust-side state extension via the Tauri Zustand plugin for shared state crossing the IPC boundary

**Prometheus Entity Management 4.0.2 (server/async/entity state):**
- Use `@prometheus-ags/entity-graph-react` 4.0.2 for new code; the generated baseline's `@prometheus-ags/prometheus-entity-management` 4.0.2 is a compatibility alias
- Register each entity transport once, then read through `useEntities`, `useEntityQuery`, or `useEntity`
- Perform graph-aware writes with `useEntityMutation`; normalized entities update every subscribed view
- Never call `fetch`/`invoke` directly from a component

**TanStack Router:**
- File-based routing via `@tanstack/react-router`
- Route-level code splitting is required for routes with >3 components
- Auth guards implemented as `beforeLoad` route functions

**Visual components:**
- Components talk ONLY to hooks (`useFeatureName` pattern)
- No direct store imports in components
- No `invoke()` calls in components

**shadcn-equivalent (React):** Prefer `shadcn/ui` components over raw HTML controls with Tailwind 4. Run `npx shadcn@latest init` during scaffold.

**React chat:** Use Assistant UI for thread, composer, thread-list, streaming, attachment, and message-action behavior. Persist normalized conversation entities with Prometheus Entity Management 3.x: PGlite on web and pglite-oxide through Rust on Tauri. Zustand is transient UI state only. Apply the Flat 2.0 contract—no visible borders, divider lines, or layout shadows.

**shadcn-equivalent (Flutter):** Use `shadcn_flutter` package — see `references/flutter/patterns.md`.

### Feature-based clean architecture

Both Flutter and React follow the same feature module structure:

```
features/
  <feature-name>/
    data/          ← repositories, data sources, DTOs
    domain/        ← entities, use cases, repository interfaces
    presentation/  ← UI components/widgets, providers/hooks
```

**Dependency direction:** presentation → domain ← data

Cross-feature navigation and shared state go through the application layer (`app/`), never feature-to-feature direct imports.

### Authentication (Ory Kratos + Supabase)

Read `references/auth/patterns.md` before implementing any auth.

**Ory Kratos:** Self-hosted identity. Handles login flows, registration, MFA, sessions.
**Supabase:** Managed Postgres + Auth. RLS policies enforce row-level security.

Both are supported. Many projects use Kratos for identity (SSO, enterprise) and Supabase for database/realtime. They are not mutually exclusive.

---

## Step 4 — UAR integration (Universal Agent Runtime)

The UAR can be integrated in two modes:

**External mode (URL-based):** UAR runs as a separate service. Connect via its HTTP/WebSocket API. Use when UAR is a shared enterprise infrastructure component.

**Embedded mode:** UAR is embedded directly in `gen_ui_core`. The agent loop, MCP registry, and protocol pipeline run in-process. This is the default for standalone consumer apps (KnowMe) and field tools (Prometheus AGS mobile).

Generated applications integrate through a pinned `UarRuntimeFacade`:

- embedded implementation for mobile and local operation;
- service implementation for desktop, web, and hosted execution;
- deterministic implementation for CI.

Applications must not generate a competing agent loop. Raw MCP transport is
internal to UAR; application code invokes tools only through UAR governance.

For external mode, configure the URL in `gen_ui_core/src/config.rs` and the crate switches to HTTP client mode.

---

## Step 5 — Code generation patterns

When generating code, always:

1. Read the relevant reference file for the target platform first
2. Follow the feature-based directory structure
3. Include the correct imports (no wildcard imports)
4. Add the `// TJ-ARCH-MOB-001 compliant` marker at the top of generated files
5. For Rust: run `cargo fmt` and `cargo clippy` on generated code mentally before outputting
6. For Flutter: follow `flutter_lints` rules
7. For React: follow the ESLint config in `references/tauri/eslint-config.md`

When adding a new ContentBlock type, always do all 7 steps in `references/rust/new-block-type.md`.

---

## Reference index

| File | When to read |
|------|-------------|
| `references/arch-standard.md` | Architecture decisions, platform selection, decision matrix |
| `references/flutter/patterns.md` | Any Flutter work — Riverpod, clean arch, shadcn_flutter, FFI wiring |
| `references/flutter/auth.md` | Flutter Kratos/Supabase — full implementation including GoRouter guards |
| `references/flutter/testing.md` | Flutter testing — Riverpod test, widget tests, golden tests |
| `references/tauri/patterns.md` | Any Tauri/React work — Zustand, Prometheus Entity Management 3.x, TanStack Router/Table, IPC, layer contract |
| `references/tauri/auth.md` | React Kratos/Supabase — full store + Prometheus Entity Management + component |
| `references/tauri/eslint-config.md` | ESLint 9 flat config, tsconfig strict, Prettier, Vitest setup |
| `references/tauri/testing.md` | Vitest, React Testing Library, layer contract enforcement tests |
| `references/rust/patterns.md` | layered crate structure, FFI rules, Tauri commands, UAR modes |
| `references/rust/compile-speed.md` | Rust workspace dependency boundaries and compile-time controls |
| `references/rust/inference-lanes.md` | per-device engines, the three lanes, native bridges, model acquisition |
| `references/rust/wasm-plugin-sandbox.md` | Wasmtime limits for third-party plugin components |
| `references/rust/tool-governance.md` | UAR trust, schema, policy, approval, cancellation, and immutable tool audit |
| `references/rust/wasm-targets.md` | WASM target selection and browser/runtime constraints |
| `references/generator-placeholders.md` | porting contract: `__APP_*__` / `@VERSION@` substitution |
| `references/rust/new-block-type.md` | 7-step full-stack guide for new ContentBlock variants |
| `references/rust/testing.md` | cargo test, tokio::test, wiremock, SurrealDB integration tests |
| `references/auth/patterns.md` | Auth strategy selection — when Kratos vs Supabase vs combined |
| `references/sync/doctrine.md` | authoritative sync lanes, privacy classes, and non-mirroring rule |
| `references/sync/decisions.md` | local-first architecture decision records |
| `references/sync/partial-replication.md` | scoped replication and hydration |
| `references/sync/peer-crdt.md` | device-to-device private profile vault |
| `references/sync/client-rag.md` | on-device retrieval and vector-storage boundaries |
| `references/ui-skills.md` | UI skill routing and cross-surface quality gates |
