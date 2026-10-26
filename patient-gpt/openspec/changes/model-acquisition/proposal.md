# Proposal

## Why

Goal 2 requires the local chat model and embedder to be acquired the KnowMe way:
a device-appropriate artifact, a pinned source, an integrity check and a runtime
choice made from the device's memory. PatientGPT has none of this today
(`assessment.md`, IMPLEMENTATION STATUS).

## What Changes

- New crate `crates/patient-gpt-inference` holding the model catalog, downloader,
  integrity verification, RAM preflight and the `ModelStorePort` adapter.
- A pinned catalog: Qwen3-0.6B and Qwen3-1.7B as MLX 4-bit (macOS, iOS) and
  LiteRT-LM (Android), and snowflake-arctic-embed-xs int8 ONNX on every platform.
  Each file is pinned by repository, revision, byte size and SHA-256.
- Resumable downloads (`.part` files and HTTP Range), streamed SHA-256, atomic
  rename, and progress events through `prepare_models`.
- RAM preflight: Qwen3-1.7B on devices with at least 7 GiB physical RAM, Qwen3-0.6B
  otherwise, refusal below 3 GiB.
- Per-platform model locations; iOS files excluded from backup, Android files in
  the no-backup directory.
- `PATIENTGPT_DATA_DIR` override on desktop so evidence runs use scratch roots.

## Capabilities

### New Capabilities
- `model-catalog`: which model files each platform may install, how they are fetched, verified, selected by memory and stored.

### Modified Capabilities
- (none)

## Impact

- New crate; desktop boot (`desktop/src-tauri/src/lib.rs`), FFI boot
  (`crates/patient-gpt-ffi/src/host_state.rs`), iOS and Android native code for
  the backup exclusion and RAM query.
- New dependencies, exact pins for the operator to record in `versions.toml`:
  an HTTP client (`reqwest` with rustls, version verified at task 1.1) and `sha2`.
- Network: HTTPS to `huggingface.co` and its download CDN at prepare time only.
