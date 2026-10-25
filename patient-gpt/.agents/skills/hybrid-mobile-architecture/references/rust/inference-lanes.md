# Inference lanes and per-device engines

> Reference for `gen_ui_inference` and `gen_ui_agent::lane`. Current version
> values live in `versions.toml` `[inference]` — read them there, never copy them
> into code or docs.

## Two orthogonal choices

| Choice | Scope | Where |
|---|---|---|
| **Engine** | per **device** | `gen_ui_inference`, selected at build time by feature flag |
| **Lane** | per **turn** | `gen_ui_agent::lane`, selected at runtime by the user |

They are frequently conflated. The `local` lane means "run on this device"; which
engine that implies depends entirely on what device it is.

## Engines

| Surface | Engine | Feature flag | Shape |
|---|---|---|---|
| Desktop | llama-cpp-2 | `local-llama` (+ `-metal` / `-opencl` / `-mtmd`) | In-process, GGUF |
| Android | LiteRT-LM | `local-litert-lm` | Rust + Kotlin bridge over JNI |
| iOS | MLX-Swift | `local-mlx` | Rust + Swift bridge over a C vtable |
| macOS | MLX-C (`mlex`) | `local-mlxc` | In-process, Apple mlx-c (no Python) |
| Web | WebLLM | — (TypeScript surface) | MLC WebGPU |
| Desktop (opt.) | mistral.rs | `local-mistral` | Experimental |

All implement `gen_ui_types::inference::InferenceProvider`. Callers depend on the
trait; only this crate depends on an engine. That is what makes a lane swap a
one-crate change instead of an app-wide refactor.

### Why Android is not llama.cpp

llama.cpp builds for Android, which makes it look like the obvious single mobile
engine. Its GPU path (OpenCL/Adreno) is **device-specific** in practice: it works
on the device you tested and fails on the next one. For a correctness baseline
that is the worst failure shape available, because it passes your CI and fails
your users.

LiteRT-LM runs everywhere on CPU, so it is the Android default. llama.cpp stays
out of Android production.

### Why iOS is not llama.cpp either

MLX reaches Metal without llama.cpp's build surface, and the iOS lane needs a
native bridge regardless (see below). Note that `versions.toml` in an older
revision said `ios = "llama-cpp-2"` while the code shipped MLX — if a doc and the
code disagree about an engine, the code is the fact.

## The native-bridge contract

Android and iOS lanes are split across languages:

- **Rust owns** catalog, download, verification, RAM preflight, tool policy, and
  event normalization.
- **The bridge owns** only the vendor SDK's generation call.

The halves bind by **symbol name**:

| Lane | Binding | Failure if mismatched |
|---|---|---|
| Android | JNI fully-qualified class path | `ClassNotFoundException` at first use |
| iOS | `@_silgen_name` FFI symbol | Missing symbol at link, or a null vtable at runtime |

Both are generated from the same `__APP_*__` placeholders precisely so they
cannot drift (`references/generator-placeholders.md`).

Two traps worth stating explicitly:

- The JNI package path must be a **legal Java identifier**. `com.example.my-app`
  is not — hyphens are illegal in Java/Kotlin package names. Rust holds it as a
  plain string, so nothing complains until class resolution fails on device.
- A Swift file present on disk but absent from `project.pbxproj` **is not
  compiled**. The symptom is a missing symbol, not a missing file.

## Model acquisition

Implemented in `catalog.rs` (plus `mlx_download.rs` for the multi-file MLX
layout). The requirements exist because each has a distinct failure:

| Requirement | Failure it prevents |
|---|---|
| Resumable | A dropped connection at 90% of a multi-GB file restarting from zero |
| Revision-pinned | "Latest" silently changing weights under a cached path |
| SHA-256 verified | A truncated or corrupted file loading as a broken model |
| Small files first | Discovering a bad revision after gigabytes instead of seconds |
| No partial file at the final path | A resumed run treating an incomplete file as done |

## Memory preflight

`memory.rs`. On iOS an over-budget load is a **jetsam process kill** — no
exception, no log, no chance to recover. The gate therefore runs *before* the
load, not around it.

Compute the budget from physical memory and keep the fraction conservative: the
OS and the app's own non-model allocations draw on the same pool. An
`<APP>_DEVICE_MEMORY_BUDGET_BYTES` override exists for testing and device tuning.

## Lanes

```rust
pub const LANE_CLOUD: &str = "cloud";  // BYOK remote; cannot be zero-config default
pub const LANE_LOCAL: &str = "local";  // on-device; model_id, no provider_id
pub const LANE_UAR:   &str = "uar";    // embedded-library on mobile, never a sidecar
```

Parse through the `Lane` enum. `FromStr` rejects unknown values with a message
naming the valid ones — **never** a `_ => default` arm. A silent fallback runs
the turn somewhere the user did not choose, and on `cloud` that means data
leaving the device.

## Verification

Host checks keep feature-gated modules from rotting:

```bash
cargo check -p gen_ui_inference --features local-litert-lm
cargo check -p gen_ui_inference --features local-mlx
```

They prove nothing about whether a lane works. Local lanes fail at model load,
on device, after every host check passes:

```bash
node scripts/android/verify-native-inference-gates.mjs   # arm64-only APK, required .so
node scripts/android/verify-device-runtime-gates.mjs     # no JNI/dlopen failure in logcat
```

Record the result in `docs/platform-support.md`.
