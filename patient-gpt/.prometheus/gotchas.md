# gotchas

Append-only. Dated entries. Mark superseded entries; do not delete them.

## 2026-10-04
- Initialized by prometheus-context-bootstrap.

## 2026-10-04 — Bootstrap and prototype are not application proof

- PatientGPT has its own bootstrap waypoint (`spec`, `ready`); the parent
  project's active workflow is not its task state. KBD initialization is pending.
- The prototype is synthetic and scripted, resets on reload, and has no proven
  authentication, durable persistence, or trusted clinical enforcement. Its
  AG-UI/A2UI-shaped streams and simulated search do not prove runtime integration.
- The requested architecture source contains version drift (including older
  OpenSpec and entity-management references). Check official sources and project
  pins before dependency selection; do not downgrade the installed OpenSpec setup.
- Hooks are wired for Claude Code. File presence does not prove enforcement in
  Codex, OpenCode, Kimi, Zed, MiniMax, or DeepSeek Harness. The single-writer hook
  detects collisions after a write; isolated worktrees provide prevention.

## 2026-10-04 — Measured skill listing limits

- Bootstrap verification measured 3,476 machine-wide skills, approximately
  256,717 description tokens against a 4,000-token budget (64.2 times over),
  plus ten empty descriptions. This is a warning, not proof every installed
  skill is visible or auto-triggerable. Named routing remains necessary;
  changing machine-wide skill installation is outside this bootstrap task.

## 2026-10-04 — PatientGPT team setup

Research found UAR current catalog accepts nine primitives while prototype clinical catalog has 17 types; app-only renderers cannot make upstream validators admit them. Full versioned registry extension remains required. PGlite materializer has inherited RSS adoption block; exact SurrealDB3.3.0 integration and native Kratos/Gate header seam remain unverified. Native role files are definitions, not proof of invocation. Impeccable context initially missed docs/design; project authority remains explicit.

## 2026-10-04 — KBD project initialization

Supersedes the earlier KBD initialization pending note: project.json and constraints.md now exist and the installed kbd-init validator passed. activePhase remains null. Canonical prometheus kbd status --json reports legacy spec/ready and runtimeInitialized=false; the typed runtime initializes automatically on the intended first mutation. Do not create an unrelated phase just to change that status. App commands remain null because no app manifests exist.

- 2026-10-25: `surrealdb = "=3.3.0"` resolves sub-crates to 3.3.4 unless Cargo.lock is held; `cargo update` silently moves the engine.
- 2026-10-25: cargokit looks up artifacts by package name; hyphenated crate `patient-gpt-ffi` needs the patched `libraryName` in `mobile/rust_builder`.
- 2026-10-25: Dart reserves `void`; the token generator maps `--void` to `voidState`.
