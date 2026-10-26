# Proposal

## Why

Goal 1 needs a streamed local reply on Android with UAR absent, and goal 6 asks
for it on the Android emulator. Decision 2 keeps UAR out of Android this phase.
D-001 picks LiteRT-LM; the maintainer advises CPU only on emulators
(LiteRT-LM #1448), and emulator chat is unverified anywhere.

## What Changes

- A Kotlin engine using `com.google.ai.edge.litertlm:litertlm-android` 0.18.1 on
  the CPU backend, called from Rust over JNI.
- A Rust `LocalChatPort` adapter (the `engine-bridge` feature, Android side) that
  formats the prompt and streams tokens from the Kotlin engine.
- `arm64-v8a` and `x86_64`, both shipped by the LiteRT-LM AAR (D-018); the evidence
  emulator is an x86_64 image on the Intel Mac or an arm64 image on the ARM
  MacBook Pro, with at least 4 GiB.
- No UAR on Android: `uar` runs are refused with `lane_unavailable`.

## Capabilities

### New Capabilities
- `local-chat-android`: the Android engine's observable behaviour on devices and emulators (arm64-v8a and x86_64).

### Modified Capabilities
- (none)

## Impact

- `mobile/android/app/` (Kotlin engine class, Gradle dependency, ABI filter),
  `crates/patient-gpt-ffi` (JNI entry points), `crates/patient-gpt-inference`.
- New Maven dependency (Apache-2.0) and Rust `jni` crate; pins listed for the operator.
- The vendored cargokit patches (Gradle 9 `ExecOperations`, compileSdk 36) must be preserved.
