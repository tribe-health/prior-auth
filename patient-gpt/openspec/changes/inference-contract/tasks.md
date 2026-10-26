# Tasks

Project testing rule (overrides the generic per-group test guidance): tests are
authored and run only after every production change in this phase is complete,
locally, never in CI. Task checks below are build checkpoints. Behavioural
acceptance for these tasks is owned by `phase-integration-evidence`.
Owner roles: rust-domain-engineer (1–2), tauri-engineer (3.2), flutter-engineer
(3.3, 4.2), react-engineer (4.1); team-lead integrates.

Host rule (D-018): tasks marked **[Apple Silicon]** run on-device inference or need arm64 targets; the agent stops and tells the operator to switch to the ARM MacBook Pro before starting them. Unmarked tasks can run on the Intel Mac.

## 1. Domain contract

- [ ] 1.1 Add `Lane` with the shared `Lane::parse_wire(Option<&str>)`, `cancelled` code, the `CUSTOM` setup-proposal event variant, `ModelRole`, `ModelState`, `ModelInventory`, `ModelEntryStatus`, `PrepareModelsRequest`, `ModelOperationEvent`, `EmbedRequest`, `EmbedResponse` and the embed limit constants to a new `crates/patient-gpt-domain/src/inference.rs`; add required `lane` to `RunRequest`; verify `cargo check -p patient-gpt-domain` passes
- [ ] 1.2 Add `ConversationScope::Onboarding` with query form `onboarding` and malformed-form rejection in `crates/patient-gpt-domain/src/conversation.rs`; verify `cargo check -p patient-gpt-domain` passes and every `match` on the scope is exhaustive without a wildcard arm

## 2. Host seam

- [ ] 2.1 Add `LocalChatPort`, `EmbedderPort` and `ModelStorePort` to `crates/patient-gpt-host/src/ports.rs` and the new `HostError` variants and codes to `error.rs`; verify `cargo check -p patient-gpt-host` passes
- [ ] 2.2 Add `UarMode::None` (text form `none`) to `crates/patient-gpt-uar/src/mode.rs` so `build_runtime` returns no runtime for it, and update the accepted-values messages in `desktop/src-tauri/src/config.rs`, `crates/patient-gpt-server/src/main.rs` and the FFI boot path; verify `cargo check --workspace` passes and an unset mode still fails startup
- [ ] 2.3 Extend `AppServices` with optional inference ports, lane routing in `start_run` (scope gate before any port call), per-run cancellation handles and `cancel_operation`, and `model_status` / `prepare_models` / `embed` methods that refuse when a port is absent; verify `cargo check --workspace` passes
- [ ] 2.4 Add the onboarding prompt builder to `crates/patient-gpt-host` (system prompt constant with no PHI and no clinical instruction, catalog ids from `ModelStorePort`, in-memory transcript bounded by `MAX_ONBOARDING_TURNS`); verify `cargo check -p patient-gpt-host` passes and `rg` finds the system prompt constant defined once

## 3. Rust transports

- [ ] 3.1 Add `GET /api/models`, `POST /api/models/prepare` (SSE), `POST /api/embeddings` and `POST /api/operations/{operationId}/cancel` to `crates/patient-gpt-server/src/routes.rs`, map new codes in `error.rs`, and parse the raw lane with `Lane::parse_wire` in the run route; verify `cargo check -p patient-gpt-server` passes
- [ ] 3.2 Add `model_status`, `prepare_models` (Channel), `embed` and `cancel_operation` commands and raw-lane parsing to `desktop/src-tauri/src/commands.rs`, and the new codes to `desktop/src-tauri/src/error.rs`; verify `cargo check -p patient-gpt-desktop` passes
- [ ] 3.3 Add the four FFI functions, `FfiRunRequest.lane: Option<String>` parsed with `Lane::parse_wire`, and the `Custom` case of `FfiAguiEventKind` to `crates/patient-gpt-ffi/src/api/patient_gpt.rs`, regenerate `mobile/lib/bridge/generated/` with flutter_rust_bridge_codegen 2.12.0; verify `cargo check -p patient-gpt-ffi` and `flutter analyze` (mobile) show no new errors

## 4. Shell clients

- [ ] 4.1 Add the DTOs (including lane availability and per-role prepare choices), the `CUSTOM` event case, `lane` on run requests and the four operations (aborting a Tauri run calls `cancel_operation`) to `web/src/app/transport/{dto,transport,http-transport,tauri-transport,agui-parse}.ts`, and send `lane: "uar"` from the existing run caller `web/src/features/chat/data/run-store.ts`; verify `pnpm -C web typecheck` passes
- [ ] 4.2 Add the same to `mobile/lib/features/workspace/data/{wire_codec,http_patient_gpt_gateway,ffi_patient_gpt_gateway}.dart`, and `mobile/lib/features/workspace/domain/patient_gpt_gateway.dart` and the run caller `mobile/lib/features/conversation/presentation/providers/thread_controller.dart` (sending `lane: "uar"`), and replace the hard-coded `_uarMode` with `String.fromEnvironment('PATIENTGPT_UAR_MODE')` failing boot when empty; verify `flutter analyze` shows no new errors

## 5. Contract document

- [ ] 5.1 Amend `docs/plan/scaffold-contracts.md` with the four new mirror rows, the `CUSTOM` setup-proposal event, the DTOs, the `onboarding` scope and the error-code table; verify every operation in the table appears in routes.rs, commands.rs and the FFI API by name
