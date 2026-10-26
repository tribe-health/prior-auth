# Tasks

Project testing rule: tests are authored and run only after every production
change in this phase is complete (owner `phase-integration-evidence`). Checks
below are build checkpoints. Depends on `inference-contract` and `model-acquisition`.
Owner roles: rust-domain-engineer (1), storage-engineer (2), flutter-engineer (2.3),
tauri-engineer (1.4), documentation-engineer with team-lead (3).

Host rule (D-018): tasks marked **[Apple Silicon]** run on-device inference or need arm64 targets; the agent stops and tells the operator to switch to the ARM MacBook Pro before starting them. Unmarked tasks can run on the Intel Mac.

## 1. Embedder

- [ ] 1.1 **[Apple Silicon]** Verify `fastembed` 7.5.0 and `ort` 2.0.0-rc.15 APIs and feature names against crates.io and Context7, add them under feature `embedder` with default features off, and list pins for the operator; verify `cargo check -p patient-gpt-inference --features embedder` passes on the host
- [ ] 1.2 **[Apple Silicon]** Implement the `EmbedderPort` adapter loading the catalog's int8 ONNX and tokenizer files, the purpose prefix from the model card, and the embed limits; verify `cargo check -p patient-gpt-inference --features embedder` passes
- [ ] 1.3 Document the two-embedder rule (vectors carry an embedder id; vectors from different ids, including UAR memory vectors, are never compared) in the `patient-gpt-inference` crate docs and the ADR; verify both state it
- [ ] 1.4 **[Apple Silicon]** Register the embedder in FFI boot, and in desktop boot only under `cfg(all(target_os = "macos", target_arch = "aarch64"))` because ort ships no `x86_64-apple-darwin` runtime (an Intel desktop answers `embed` with `engine_unavailable`); verify `cargo check -p patient-gpt-desktop` and `-p patient-gpt-ffi` pass on the host

## 2. Mobile store

- [ ] 2.1 Add a settings record type with privacy `local` to `patient-gpt-storage` and enable its `surreal` feature for the FFI crate; verify `cargo check -p patient-gpt-storage --features surreal` passes on the host
- [ ] 2.2 Replace the in-memory conversation store in `crates/patient-gpt-ffi/src/host_state.rs` with the SurrealDB store at the app data directory passed from Dart, failing boot with `storage_failed` when it cannot open; verify `cargo check -p patient-gpt-ffi` passes
- [ ] 2.3 **[Apple Silicon]** Pass the store directory from Dart boot (`mobile/lib/bridge/`, app start) and show the storage error state if boot fails; verify `flutter analyze` shows no new errors and a debug run on the iPhone 17 simulator reaches the home view

## 3. Records

- [ ] 3.1 Write `docs/architecture/adr-pgpt-001-mobile-surrealdb.md` per design.md decision 5; verify it cites decision 7 / D-016, the doctrine row and the BSL terms
- [ ] 3.2 Amend the storage-lanes table in `docs/plan/scaffold-contracts.md` for Flutter's local store; verify the table names the store, path and record classes

## 4. Change-boundary build batch

- [ ] 4.1 **[Apple Silicon]** Once tasks 1–3 are done, run the debug `flutter run` builds on the iPhone 17 simulator and the Android emulator (the cross-builds of fastembed, ort, tokenizers and RocksDB) and record any `onig`, ort or RocksDB failure in the runbook
