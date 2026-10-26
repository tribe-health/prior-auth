# Proposal

## Why

Goal 1 requires a local embedder on desktop, iOS and Android, and goal 6 asks for
an embedding on the iOS simulator and Android emulator. Mobile also has no durable
store: Flutter conversations live in memory and are lost when the process ends
(`crates/patient-gpt-ffi/src/host_state.rs:3-6`), and onboarding settings
(`local-onboarding`) need somewhere to persist. Decision 6 picks
snowflake-arctic-embed-xs; decision 7 picks SurrealDB embedded on mobile with an
ADR for the departure from the architecture doctrine.

## What Changes

- An `EmbedderPort` adapter in `patient-gpt-inference` (feature `embedder`) on
  `fastembed` 7.5.0 and `ort` =2.0.0-rc.15, loading the catalog's int8 ONNX and
  tokenizer files from the verified model directory, never from hf-hub at run time.
- `embed` works on desktop, iOS (device and simulator) and Android (device and
  emulator), returning 384-dimension vectors tagged with the embedder id.
- SurrealDB 3.3.0 embedded on RocksDB in the FFI host for iOS and Android, backing
  the conversation store and a settings record. **BREAKING** for the storage-lane
  table in `docs/plan/scaffold-contracts.md`: Flutter gains a local store.
- ADR `docs/architecture/adr-pgpt-001-mobile-surrealdb.md` recording the doctrine
  departure, the BSL 1.1 licence terms and the alternative (rusqlite + sqlite-vec).
- The rule for embeddings from different models (PatientGPT's embedder and UAR's
  memory embedder): vectors carry their embedder id and are never compared across
  ids. Recorded as a rule; no comparison code exists this phase.

## Capabilities

### New Capabilities
- `local-embeddings`: on-device embedding of text, its limits, its tagging and its privacy class.
- `mobile-local-store`: durable on-device storage of conversations and settings on iOS and Android.

### Modified Capabilities
- (none)

## Impact

- `crates/patient-gpt-inference`, `crates/patient-gpt-storage` (mobile build of the
  `surreal` feature, settings record), `crates/patient-gpt-ffi/src/host_state.rs`,
  `desktop/src-tauri/src/lib.rs`, `docs/plan/scaffold-contracts.md`, new `docs/architecture/`.
- New dependencies `fastembed`, `ort` (and `tokenizers` through fastembed); pins
  listed for the operator. `ort-download-binaries-rustls-tls` fetches ONNX Runtime
  from `cdn.pyke.io` at build time; offline builds need `ORT_LIB_LOCATION`.
- RocksDB C++ cross-compiles for `aarch64-apple-ios`, `aarch64-apple-ios-sim` and
  `aarch64-linux-android`.
