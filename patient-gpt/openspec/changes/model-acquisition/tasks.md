# Tasks

Project testing rule: tests are authored and run only after every production
change in this phase is complete (owner `phase-integration-evidence`). Checks
below are build checkpoints. Depends on `inference-contract`.
Owner roles: rust-domain-engineer (1–3), flutter-engineer (4), tauri-engineer (3.2).

Host rule (D-018): tasks marked **[Apple Silicon]** run on-device inference or need arm64 targets; the agent stops and tells the operator to switch to the ARM MacBook Pro before starting them. Unmarked tasks can run on the Intel Mac.

## 1. Catalog

- [ ] 1.1 Create `crates/patient-gpt-inference` (workspace member) with `catalog`, `download`, `preflight` and `store` modules; verify the HTTP client and `sha2` versions against crates.io and Context7 (the HTTP client pin must equal UAR v1.3.0's `reqwest = "=0.13.5"` or resolution fails once UAR is embedded; `agui-bridge-and-uar-service` reuses this pin), add exact pins to `[workspace.dependencies]`, and list them for the operator in `docs/plan/local-inference-pins.md`; verify `cargo check -p patient-gpt-inference` passes
- [ ] 1.2 Encode the five catalog entries from design.md decision 1; download each small file at its pinned revision, compute its SHA-256 and record it in the catalog; verify the recorded large-file digests equal design.md and list the small-file digests in `docs/plan/local-inference-pins.md` for operator review

## 2. Acquisition

- [ ] 2.1 Implement streamed download with `.part` files, HTTP Range resume, local verification of a full-length `.part` (and of an HTTP 416), HTTPS-only redirects, streamed SHA-256 and atomic rename, emitting `ModelOperationEvent`s; verify `cargo check -p patient-gpt-inference` passes
- [ ] 2.2 Implement RAM preflight with the named thresholds, explicit-request refusal and `insufficient_memory`; verify `cargo check -p patient-gpt-inference` passes
- [ ] 2.3 Implement the `ModelStorePort` adapter (inventory, selection persistence, prepare) over the download and preflight modules; verify `cargo check --workspace` passes

## 3. Desktop wiring

- [ ] 3.1 Add the `PATIENTGPT_DATA_DIR` override to `desktop/src-tauri/src/config.rs` and route the conversation store and model directory through it; verify `cargo check -p patient-gpt-desktop` passes
- [ ] 3.2 Wire the `ModelStorePort` into desktop boot in `desktop/src-tauri/src/lib.rs`; verify `cargo check -p patient-gpt-desktop` passes and a debug launch with `PATIENTGPT_UAR_MODE=none` reaches the main window

## 4. Mobile wiring

- [ ] 4.1 Pass the platform model directory from Dart into FFI boot (`crates/patient-gpt-ffi/src/host_state.rs`, `mobile/lib/bridge/`): iOS Application Support from `path_provider`; Android `noBackupFilesDir` from a `patientgpt/platform` method channel in `mobile/android/app/src/main/kotlin/.../MainActivity.kt`. Read physical RAM in Rust (`sysctl hw.memsize` on Apple platforms, `MemTotal` from `/proc/meminfo` on Android) and set the backup-exclusion attribute on each iOS model file after it is renamed into place, not on the directory; verify `cargo check -p patient-gpt-ffi` and `flutter analyze` show no new errors
- [ ] 4.2 **[Apple Silicon]** Wire the `ModelStorePort` into FFI boot; verify a debug `flutter run` on the iPhone 17 simulator reaches the home view
