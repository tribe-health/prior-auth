# Rust Compile-Speed Reference
> Inner-loop discipline for `gen_ui_core` and the layered workspace

> This encodes CLAUDE.md "Speed through minimal compilation." The goal is the fewest, fastest
> compilations. Read alongside `references/rust/patterns.md` (workspace layout) and
> `references/rust/testing.md` (features-first — tests run at completion, not in the loop).

## The one rule: limit compilations above all else

Every avoided recompile is the biggest single speed win. Two habits cause most wasted
rebuilds — fix both:

1. **Pick `cargo clippy` as the single inner-loop driver. Never alternate with bare
   `cargo check`.** `check` and `clippy` do **not** share a build cache; running one after the
   other recompiles the whole workspace twice. Choose clippy and stay on it.
2. **Never run full `cargo build` in the inner loop.** Building artifacts (codegen, linking,
   FFI staticlibs) is a completion/CI step, not an iteration step.

```bash
# Inner loop — the ONLY thing you run while iterating:
cargo clippy --workspace -- -D warnings

# Continuous variant (re-runs on save):
bacon clippy

# Gate cross-target cfg errors in seconds WITHOUT a real build:
cargo check --target wasm32-unknown-unknown
cargo check --target aarch64-apple-ios
```

## Workspace shape is a compile-speed decision

The layered split in `references/rust/patterns.md` exists partly to cache well:

- **`gen_ui_db` isolates SurrealDB.** `surrealdb-core` has a `build.rs` re-run issue
  ([#6954](https://github.com/surrealdb/surrealdb/issues/6954)) that triggers long rebuilds.
  Keeping it in its own leaf-ish crate means app code above it recompiles without dragging
  SurrealDB through every time.
- **`gen_ui_types` holds the frozen trait seams.** Downstream crates depend on stable
  signatures, so editing app logic in one crate doesn't invalidate the others — and parallel
  worktrees don't fight.
- **Heavy deps (inference engines, SurrealDB) live in leaves**, not in the crate you edit most.

## Profiles: dependencies compile well once, app code iterates fast

```toml
# Cargo.toml (workspace root)

# Optimize dependencies heavily (they compile once and cache); keep app crates cheap to rebuild.
[profile.dev.package."*"]
opt-level = 2

[profile.dev.build-override]
opt-level = 3

[profile.dev]
debug = "line-tables-only"        # enough for backtraces, far cheaper than full debuginfo
split-debuginfo = "unpacked"      # faster linking on macOS
```

## Cranelift for host-native inner loops (nightly)

Cranelift codegen is much faster than LLVM for debug builds — use it for the **host-native**
inner loop only. LLVM stays for the shipping targets (iOS / Android / WASM), which Cranelift
does not support.

```toml
# A dev-fast profile / toolchain override for host iteration (nightly).
# Do NOT use Cranelift for iOS/Android/WASM builds — it can't target them.
```

```bash
# host inner loop, fast codegen:
cargo +nightly clippy -Zcodegen-backend=cranelift --workspace
# cross-target correctness still via LLVM check:
cargo check --target aarch64-apple-ios
```

## Cross-target cache thrash

Different targets share a `target/` dir by default and evict each other's artifacts. Give each
surface its own dir so switching between host / iOS / WASM doesn't recompile the world:

```bash
CARGO_TARGET_DIR=target/host   cargo clippy --workspace
CARGO_TARGET_DIR=target/ios    cargo check --target aarch64-apple-ios
CARGO_TARGET_DIR=target/wasm   cargo check --target wasm32-unknown-unknown
```

- Use **`cargo-hakari`** to pin feature unification across the workspace so a feature toggled
  in one crate doesn't silently rebuild others.
- Use **sccache** in CI (not usually needed locally with the profiles above).

## FFI release profile: never `panic = "abort"`

```toml
# ✗ WRONG on any profile the FFI staticlib/cdylib ships under:
# [profile.release]
# panic = "abort"
```

`flutter_rust_bridge` needs **unwinding** to convert a Rust panic into a Dart
`PanicException`. `panic = "abort"` kills the whole app instead. Keep `panic = "unwind"`
(the default) on every FFI-facing release profile. (This is also a BLOCKING constraint — see
`.kbd-orchestrator/constraints.md`.)

## Checklist

- [ ] Inner loop is `cargo clippy` (or `bacon clippy`) — never alternated with `cargo check`.
- [ ] No `cargo build` in the iteration loop.
- [ ] Cross-target correctness via `cargo check --target …`, not a full build.
- [ ] SurrealDB / heavy deps isolated in leaf crates.
- [ ] `[profile.dev.package."*"] opt-level = 2` + line-tables-only debuginfo set.
- [ ] Per-surface `CARGO_TARGET_DIR` when switching targets.
- [ ] No `panic = "abort"` on any FFI release profile.
