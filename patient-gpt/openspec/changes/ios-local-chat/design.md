# Design

## Context

KnowMe bridges MLX-Swift to Rust over a C vtable
(`mobile/ios/Runner/KnowMeMlxBridge.swift:236-264`) and registers no bridge in
simulator builds (`gen_ui_inference/src/ios_mlx_ffi.rs:4-7`). KnowMe has no iOS
inference evidence on any destination (`assessment.md` → KnowMe). Its
`mlx-swift-examples` 2.29.1 is stale; the LLM libraries moved to `mlx-swift-lm`.

## Goals / Non-Goals

**Goals:** a device engine behind the same `LocalChatPort` as macOS; an explicit
simulator refusal; registration ordered before any run.

**Non-Goals:** a simulator chat lane (decision 1: no candle lane); background
generation; the iOS embedder (`local-embedder-and-mobile-store`).

## Decisions

1. **C function table, registered from Swift.** `patient-gpt-ffi` exports
   `patientgpt_register_chat_engine(const PatientGptChatEngine *table)` with
   `load(dir)`, `generate(prompt, max_tokens, on_token, ctx)`, `cancel(handle)` and
   `unload()`. Swift fills it in `AppDelegate` before the Flutter engine starts.
   Alternative: a Flutter method channel to Swift — rejected, it routes engine
   traffic through Dart and splits the host seam across two languages.
2. **Rust owns prompt formatting.** The host's onboarding prompt builder
   (`inference-contract`) supplies the message list; the Rust bridge adapter applies
   the Qwen3 chat template with thinking disabled and passes text. Swift only loads,
   generates and streams.
3. **Simulator exclusion at compile time** with `#if targetEnvironment(simulator)`
   in Swift; the Rust adapter reports `engine_unavailable` with the simulator
   reason when no table is registered on `aarch64-apple-ios-sim`.
4. **Mac destination invocation is established, not assumed.** Whether
   `flutter run` can target "My Mac (Designed for iPad)" or `xcodebuild` must be
   used is verified in task 3.1; if neither works, CHAT-2 is BLOCKED, not replaced.

## Risks / Trade-offs

- [No prior MLX iOS evidence anywhere] → the first device run is the first proof;
  failure leaves iOS chat Blocked and is reported as such.
- [Mac destination may need signing and entitlements] → listed as a prerequisite.
- [968 MB model on an 8 GB iPhone under memory pressure] → the OS can kill the app
  without an error (project rule: a simulator is not a device); the final gate
  records device RAM and model id with each run.
- [Symbol-name binding] → a renamed export compiles on both sides and fails at run
  time; task 2.2 checks the symbol in the built library.
