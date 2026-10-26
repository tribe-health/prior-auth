# Design

## Context

See proposal.md for motivation. Today `AppServices::new(clinical, conversations,
runtime)` (`crates/patient-gpt-host/src/services.rs:27-37`) and the six-row mirror
(`docs/plan/scaffold-contracts.md:10-17`) are the whole shell contract. `HostError`
has five variants with stable codes (`crates/patient-gpt-host/src/error.rs:6-29`);
the Axum mapping lives in `crates/patient-gpt-server/src/error.rs`. Phase operator
decisions are recorded as D-016 in the phase `decision-log.md`.

## Goals / Non-Goals

**Goals:**
- Freeze lane, scope, DTO and error-code shapes before parallel engine work.
- Make every new operation reachable on all three transports from day one, with
  explicit refusals until adapters land.

**Non-Goals:**
- No engine, downloader, embedder or store implementation (later changes).
- No onboarding setup commands (`local-onboarding`).
- No UAR embedding or service client (`agui-bridge-and-uar-service`,
  `uar-embedded-runtime`).

## Decisions

1. **Two lanes, `local` and `uar`.** `uar` covers every UAR mode (deterministic,
   service, embedded); the mode is per device and chosen at boot, the lane per turn
   (architecture rule: engine per device, lane per turn). Alternative: one lane per
   mode — rejected, it leaks device configuration into every request.
2. **One lane parser, raw wire value.** Each transport's wire DTO carries `lane`
   as an optional string (HTTP JSON, Tauri JSON value, `FfiRunRequest.lane:
   Option<String>`). Every transport calls the single
   `patient_gpt_domain::Lane::parse_wire(Option<&str>)`, which returns
   `lane_required` or `unknown_lane`; a generic deserialization failure would
   otherwise surface as `invalid_run_request`. The typed `RunRequest.lane` has no
   default and every `match` is exhaustive.
3. **`onboarding` scope gates the local lane.** The local model is excluded from
   clinical work (goal 5). Gating by scope in the host makes the refusal happen
   before the engine sees input, and keeps chart-scoped conversations free of
   replies written without chart access. Alternative: allow `local` anywhere and
   rely on the prompt — rejected, a prompt is not a control.
4. **Ports, not engine types, in the host.** New traits in `ports.rs`:
   `LocalChatPort` (stream a single-turn reply), `EmbedderPort` (embed texts),
   `ModelStorePort` (inventory, prepare with progress). `AppServices` takes them as
   `Option<Arc<dyn …>>`; `None` produces `lane_unavailable`/`engine_unavailable`.
   The host still names no engine, shell or driver.
5. **Error codes extend `HostError`.** New variants map to: `lane_required` and
   `unknown_lane` 400, `lane_not_permitted` 403, `model_not_installed` and
   `insufficient_memory` 409, `lane_unavailable` and `engine_unavailable` 503.
   `integrity_failed`, `download_failed` and `storage_failed` also appear inside
   `ModelOperationEvent` and a `failed` `ModelState`; `cancelled` appears only as a
   `RUN_ERROR` code. Codes added by later changes take these statuses so every
   transport maps them the same way: `driver_not_permitted` 403 and
   `agent_unavailable` 503 (refused before a stream starts); `uar_unavailable`,
   `uar_unauthorized`, `unsupported_event`, `protocol_mismatch` and
   `tool_not_admitted` only as `RUN_ERROR` codes inside a started stream;
   `host_unsupported` 503 for an operation this host does not offer at all (setup
   and settings on the Axum cloud host). Refusal order is fixed: lane, then scope,
   then `engine_unavailable`, then `model_not_installed`.
6. **Progress transport mirrors `start_run`.** HTTP uses `text/event-stream`,
   Tauri a `tauri::ipc::Channel<ModelOperationEvent>`, FFI a
   `StreamSink<ModelOperationEvent>`, as the existing run stream does.
7. **Embed limits are a trust-boundary guard.** 64 texts and 8,000 characters per
   text bound memory on mobile; named as constants in the domain crate. Failure
   scenario: an unbounded batch from a compromised webview exhausting device RAM.
8. **Cancellation is an operation, not only a dropped stream.** The Tauri channel
   cannot signal a webview abort (`tauri-transport.ts:38-43` ignores one), so
   `cancel_operation(operationId)` is mirrored on all three transports; the host keeps a
   cancellation handle per active run and the engine stops at the next token.
9. **Setup proposals use AG-UI's `CUSTOM` event** (`name:
   "patientgpt.setup_proposal"`), not a seventh PatientGPT-specific type. The web
   DTO union, the Dart codec and `FfiAguiEventKind` each gain the one case.
10. **The onboarding prompt has one owner.** `patient-gpt-host` builds the
   message list for a `local` run: system prompt constant, the device's catalog
   ids read from `ModelStorePort`, the in-memory transcript (constant
   `MAX_ONBOARDING_TURNS = 8`, not persisted), and the user message. Engines apply
   their model's chat template to that list and nothing else.
11. **Mobile UAR mode at build time.** `--dart-define=PATIENTGPT_UAR_MODE`
   replaces the hard-coded `deterministic` in
   `mobile/lib/features/workspace/data/ffi_patient_gpt_gateway.dart:18`; an absent
   value fails boot with the accepted values listed, as on desktop.

## Risks / Trade-offs

- [BREAKING `RunRequest`] → web and Flutter clients are updated in the same change;
  the deterministic demo path sends `lane: "uar"`.
- [Scope enum grows] → exhaustive matches in TS (`dto.ts`) and Dart (`wire_codec.dart`)
  fail to compile until handled, which is the intended signal.
- [Refusal-only operations ship before adapters] → they are real behaviour, not
  stubs; the final gate checks refusals as negative controls.

## Migration Plan

Single change across all shells; no persisted data changes shape except the new
`onboarding` scope value in conversation records, which older readers never see.
Rollback is reverting the change.
