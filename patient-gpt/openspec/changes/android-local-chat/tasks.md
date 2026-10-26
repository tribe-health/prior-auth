# Tasks

Project testing rule: tests are authored and run only after every production
change in this phase is complete (owner `phase-integration-evidence`). Checks
below are build checkpoints. Depends on `inference-contract`, `model-acquisition`
and `ios-local-chat` (shared `engine-bridge` adapter).
Owner roles: rust-domain-engineer (1), flutter-engineer (2–3).

Host rule (D-018): tasks marked **[Apple Silicon]** run on-device inference or need arm64 targets; the agent stops and tells the operator to switch to the ARM MacBook Pro before starting them. Unmarked tasks can run on the Intel Mac.

## 1. Rust JNI adapter

- [ ] 1.1 Verify the `jni` crate version and API against crates.io and Context7, add the Android-only JNI entry points to `crates/patient-gpt-ffi` that receive the Kotlin engine object, and extend the `engine-bridge` adapter to call it; verify `cargo check -p patient-gpt-ffi` passes on the host (the Android cross-build happens in `flutter run`, the change's integration gate)

## 2. Kotlin engine

- [ ] 2.1 **[Apple Silicon]** Verify the LiteRT-LM 0.18.1 Android API (engine creation from a `.litertlm` path, CPU backend, streaming generation, cancel) against its source and docs, add the Maven dependency to `mobile/android/app/build.gradle.kts`, set `abiFilters` to `arm64-v8a` and `x86_64`, and list the pin for the operator; verify `flutter run --debug` on the arm64 API 36 AVD reaches the home view with the cargokit patches intact
- [ ] 2.2 **[Apple Silicon]** Implement the Kotlin engine class and register it with Rust from `MainActivity` before the Flutter UI can start a run; verify a debug run on the arm64 API 36 AVD reaches the home view

## 3. Emulator

- [ ] 3.1 **[Apple Silicon]** On the ARM MacBook Pro, configure an arm64 API 36 AVD with at least 4 GiB RAM (the contract's evidence environment; an x86_64 AVD on the Intel Mac is optional extra coverage, not evidence); record its name and settings in `docs/plan/local-inference-runbook.md`; verify `emulator -list-avds` lists it
