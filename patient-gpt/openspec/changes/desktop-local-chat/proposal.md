# Proposal

## Why

Goal 1 needs a streamed local reply on the Tauri desktop with UAR absent. Decision
10 limits desktop to macOS this phase; decision D-001 picks `mlex` (mlx-c,
statically linked) as the macOS engine.

## What Changes

- An `mlex`-backed `LocalChatPort` adapter in `patient-gpt-inference`, behind a
  feature compiled only for macOS on Apple Silicon.
- Qwen3 chat formatting with thinking disabled, fixed generation limits, token
  streaming into the AG-UI subset, and cancellation when the stream is dropped.
- Desktop boot registers the adapter; `local` onboarding runs stream real replies.
- Non-macOS desktop builds register no engine and answer `engine_unavailable`.

## Capabilities

### New Capabilities
- `local-chat-macos`: the macOS desktop engine's observable behaviour — model load, streamed generation, cancellation and absence on other desktop targets.

### Modified Capabilities
- (none)

## Impact

- `crates/patient-gpt-inference` (engine module, feature `engine-mlex`),
  `desktop/src-tauri/src/lib.rs` and `Cargo.toml`.
- New dependency `mlex` 0.1.3 (MIT), pin listed for the operator.
- Build: mlx-c compiles C++/Metal sources; first desktop build time grows.
- Maintenance risk: all four `mlex` releases (0.1.0–0.1.3) were published on
  2026-07-06 and none since; a stall would leave macOS on an unmaintained binding.
