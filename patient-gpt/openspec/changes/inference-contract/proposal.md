# Proposal

## Why

PatientGPT has no inference seam: `RunRequest` carries no lane, `AppServices`
takes three ports, and the six-operation transport mirror has no model status,
model preparation or embedding operation (`docs/plan/scaffold-contracts.md:6-20`).
Every later change in phase `local-inference-and-uar-wiring` builds against this
contract, so it is frozen first.

## What Changes

- **BREAKING** `RunRequest` gains a required `lane` field (`"local"` or `"uar"`).
  A missing or unknown lane is rejected with a stable error code. There is no
  default lane.
- UAR mode gains the explicit value `none` (UAR not configured); the mode stays a
  required setting with no default.
- New conversation scope kind `onboarding`. The `local` lane is accepted only in
  that scope; clinical scopes (`all`, `patient`, `case`) refuse it.
- Four new mirrored operations on Axum, Tauri and FFI: `model_status`,
  `prepare_models` (streamed progress), `embed` and `cancel_operation`.
- The AG-UI subset gains one standard `CUSTOM` event, name
  `patientgpt.setup_proposal`, so a host-validated setup proposal can reach the
  shell with its id (used by `local-onboarding`).
- One onboarding prompt builder in `patient-gpt-host` owns the system prompt, the
  device's catalog ids and the in-memory onboarding transcript; engines receive
  formatted messages only.
- The mobile UAR mode is passed at build time with
  `--dart-define=PATIENTGPT_UAR_MODE=<mode>`; the Dart constant `deterministic` is removed.
- New DTOs: `Lane`, `ModelRole`, `ModelInventory`, `ModelEntryStatus`,
  `ModelState`, `PrepareModelsRequest`, `ModelOperationEvent`, `EmbedRequest`,
  `EmbedResponse`, and a stable error-code set for inference refusals.
- New host ports for the local chat engine, the embedder and the model store.
  With no adapter wired, each operation answers with an explicit refusal, never a
  canned or fallback result.
- Web (`web/src/app/transport/`) and Flutter (`mobile/lib/features/workspace/data/`)
  clients gain the new operations and send `lane` on every run.
- `docs/plan/scaffold-contracts.md` is amended with the new rows and DTOs.

## Capabilities

### New Capabilities
- `inference-lanes`: explicit per-turn lane selection, loud rejection of missing or unknown lanes, scope rules for the local lane, and refusal when a lane has no provider.
- `local-chat`: the observable behaviour of a run on the local lane — single turn, no tools, streamed AG-UI subset events, explicit refusal events.
- `model-operations`: the mirrored model status, model preparation and embedding operations and their DTOs.

### Modified Capabilities
- (none — `openspec/specs/` holds no capabilities yet)

## Impact

- Rust: `crates/patient-gpt-domain` (new DTO module), `crates/patient-gpt-host`
  (ports, `AppServices`, errors), `crates/patient-gpt-uar` (lane-aware facade
  call), `crates/patient-gpt-server` (routes, error mapping),
  `desktop/src-tauri/src/commands.rs`, `crates/patient-gpt-ffi/src/api/patient_gpt.rs`
  and regenerated `mobile/lib/bridge/generated/`.
- Web: `web/src/app/transport/*.ts`, chat run callers.
- Flutter: `mobile/lib/features/workspace/data/*_gateway.dart`, `wire_codec.dart`.
- Docs: `docs/plan/scaffold-contracts.md`.
- No new dependency.
