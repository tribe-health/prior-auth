# Tasks

Project testing rule: tests are authored and run only after every production
change in this phase is complete (owner `phase-integration-evidence`). Checks
below are build checkpoints. Depends on `inference-contract` and `model-acquisition`.
Owner roles: rust-domain-engineer (1), tauri-engineer (2).

Host rule (D-018): tasks marked **[Apple Silicon]** run on-device inference or need arm64 targets; the agent stops and tells the operator to switch to the ARM MacBook Pro before starting them. Unmarked tasks can run on the Intel Mac.

## 1. Engine adapter

- [ ] 1.1 **[Apple Silicon]** Verify `mlex` 0.1.3's API (model load from a directory, token streaming, cancellation) against its source and docs, record the exact pin in `docs/plan/local-inference-pins.md`, and add it under feature `engine-mlex` with `cfg(all(target_os = "macos", target_arch = "aarch64"))`; verify `cargo check -p patient-gpt-inference --features engine-mlex` passes
- [ ] 1.2 **[Apple Silicon]** Implement the `LocalChatPort` adapter: load the selected `ready` MLX entry, apply the Qwen3 chat template with thinking disabled to the message list the host's onboarding prompt builder supplies, generate on a blocking worker with named limits (`MAX_NEW_TOKENS`, temperature), stream deltas, stop on `cancel_operation` or stream drop; verify `cargo check -p patient-gpt-inference --features engine-mlex` passes

## 2. Desktop wiring

- [ ] 2.1 **[Apple Silicon]** Register the adapter in desktop boot (`desktop/src-tauri/src/lib.rs`) when the feature is compiled, otherwise register none; verify `cargo check -p patient-gpt-desktop` passes
- [ ] 2.2 **[Apple Silicon]** Launch the debug desktop app with `PATIENTGPT_UAR_MODE=none` and a scratch `PATIENTGPT_DATA_DIR`, call `prepare_models`, then `start_run` (lane `local`, scope `onboarding`), then `cancel_operation` on a second run, from the webview devtools console, because the onboarding screen arrives in `local-onboarding`; record the observed events in the phase's `evidence/build-stage/` folder as a build-stage demo (not acceptance)
