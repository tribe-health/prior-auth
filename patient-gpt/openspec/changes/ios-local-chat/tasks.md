# Tasks

Project testing rule: tests are authored and run only after every production
change in this phase is complete (owner `phase-integration-evidence`). Checks
below are build checkpoints. Depends on `inference-contract`, `model-acquisition`
and `desktop-local-chat` (shared prompt and adapter shape).
Owner roles: rust-domain-engineer (1), flutter-engineer (2–3).

Host rule (D-018): tasks marked **[Apple Silicon]** run on-device inference or need arm64 targets; the agent stops and tells the operator to switch to the ARM MacBook Pro before starting them. Unmarked tasks can run on the Intel Mac.

## 1. Rust bridge adapter

- [ ] 1.1 Define the C engine table and `patientgpt_register_chat_engine` export in `crates/patient-gpt-ffi`, and the `engine-bridge` `LocalChatPort` adapter in `crates/patient-gpt-inference` that formats the prompt and streams tokens from the table; verify `cargo check -p patient-gpt-ffi` passes on the host; the iOS cross-build happens in the Xcode and `flutter run` builds below
- [ ] 1.2 **[Apple Silicon]** Return `engine_unavailable` with the simulator reason when no table is registered on `aarch64-apple-ios-sim`; verify it in the simulator run of task 2.2

## 2. Swift engine

- [ ] 2.1 Verify `mlx-swift` 0.32.3 and `mlx-swift-lm` 3.32.3 APIs (model directory load, streaming generate, cancel) against their sources, add them to the Runner via Swift Package Manager, and list the pins for the operator; verify an Xcode debug build of `Runner` for a device destination succeeds
- [ ] 2.2 **[Apple Silicon]** Implement `mobile/ios/Runner/PatientGptMlxEngine.swift` filling the table, excluded under `#if targetEnvironment(simulator)`, and register it in `AppDelegate.swift` before the Flutter engine starts; verify the built library exports `patientgpt_register_chat_engine` (`nm` on the built framework) and the simulator build still launches to the home view

## 3. Destinations

- [ ] 3.1 **[Apple Silicon]** Establish the exact command that runs the app on "My Mac (Designed for iPad)" (Flutter CLI or `xcodebuild`), with the operator's development team for signing; record it in `docs/plan/local-inference-runbook.md`, or record CHAT-2 as BLOCKED with the observed error
- [ ] 3.2 **[Apple Silicon]** Record the physical iPhone model, iOS version and signing prerequisite in the runbook; if no device is available, record CHAT-3 as BLOCKED rather than substituting another destination
