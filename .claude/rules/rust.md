---
paths: ['**/*.rs', '**/Cargo.toml']
---

# Rust

Loaded when a Rust file is read. Not resident.

Workspace: `crates/aso-host`, `crates/aso-server-axum`, `crates/aso-web-server`,
`desktop/src-tauri`. Rust 1.94, edition 2024, resolver 3.

| Tier | Commands |
|---|---|
| T0 every edit | `cargo check -p <crate>`; `cargo clippy -p <crate> --no-deps` |
| T1 unit complete | `cargo test -p <crate> <module>` — the just-written unit only |
| T2 phase complete | `cargo test --workspace`; `cargo build --workspace`; `bash scripts/audit.sh` |
| T3 milestone only | release builds; Tauri bundle; cross-compiles; device certification |

## Hard rules

- Never build in the release profile during implementation. It invalidates
  incremental artifacts and pays full optimization for code that will change.
- Never cross-compile or run a Tauri bundle before T2 passes.
- One build profile per session. Switching profiles thrashes the incremental cache.
- Scope T0 to the touched crate. Workspace-wide checks on every edit are waste.
- Dependencies are pinned exactly in `[workspace.dependencies]`. Do not add a
  caret. `versions.toml` is the pin authority.

## The boundary that defines this workspace

`aso-host` names **no shell** — no `axum`, no `tauri`, no `flutter_rust_bridge`.
The moment the shared core knows which shell it is inside, it stops being
shared. Tauri consumes it through commands, Flutter through FFI, web through
Axum; all three see the same `AppServices`.

`scripts/audit.sh` check 4 greps `crates/aso-host/Cargo.toml` for those names.
If a borrow or trait error tempts you to add one, that is the invariant working
— stop and surface the conflict.

Desktop Tauri commands mirror the HTTP routes **1:1**. A route added to
`aso-server-axum` without its desktop counterpart is an incomplete change.

## Domain invariants that are compile errors

`EvidenceState` is a three-member enum: `Met`, `Gap`, `Void`. A missing match
arm is a compile error, and that is deliberate — `Void` is not a weak `Gap`.
`scripts/audit.sh` check 6 greps for `Void` in
`crates/aso-host/src/domain/mod.rs`.

Clinical authority (`AppServices::affirm_gate`, `sign_letter`) returns a typed
`CapabilityDenied` rather than a constraint violation, because "you may not
affirm this case" is actionable and a Postgres error code is not.
Production composition uses the restricted PostgreSQL authority repository and
fails startup when its database or Kratos configuration is absent. Memory
authority adapters are test-only — a test that accidentally proves an
administrator can sign a letter must fail locally, not in production.

An AI agent acting for a surgeon is a different principal: `Agent`, not `User`.
A policy granting the surgeon signing authority grants a delegated agent
nothing. Authority is re-granted per action or it does not exist.

## Build concurrency

Within one target directory, single-writer — serialize.

Across worktrees with separate `CARGO_TARGET_DIR` and a **shared** `CARGO_HOME`,
run check, build, test, and clippy in parallel. Serialize only
dependency-mutating commands: `cargo fetch`, `cargo update`, `cargo add`.

Do not give each agent its own `CARGO_HOME`. The fingerprint includes that path,
so a separate one breaks registry sharing and forces full recompiles.
