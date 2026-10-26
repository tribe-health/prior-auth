# Production integration acceptance — local-inference-and-uar-wiring

This is the phase's acceptance contract, populated from
`acceptance.template.md`. These are requirements; no scenario has run. Every
verdict is pending until the final local gate records it.

## Execution boundary

Every production change in the phase is completed before any scenario script is
written or run. The scenarios then run once as a consolidated local batch per
target, through the shipped entry points, with real collaborators. Unit tests,
structural checks, mocks and snapshots are supplemental and cannot satisfy a
scenario. One Cargo build at a time. Hosted CI is never used. Exit 2 or a missing
prerequisite is BLOCKED.

## Fields common to every scenario

| Field | Declaration |
|---|---|
| Canonical identity | phase `local-inference-and-uar-wiring`; change and task named per scenario below |
| Source identity | the PatientGPT git revision under test (`git rev-parse HEAD` in the receipt), plus UAR tag v1.3.0 commit `774469746fee4de99be41dc1cd231857067e4487` for UAR scenarios, plus catalog digests from `model-acquisition` design.md |
| Isolation | desktop: `PATIENTGPT_DATA_DIR` set to a fresh directory under the session scratchpad, never the default app data directory; Axum: `PATIENTGPT_ADDR=127.0.0.1:<free port>`; iOS simulator: a dedicated simulator created for the run (`xcrun simctl create`) and deleted after; Mac destination and iPhone: app uninstalled before the run; Android: dedicated arm64 AVD, `adb uninstall` before the run; UAR service: its own scratch data directory and a free port. Cleanup owner: the scenario script that created the root |
| Model fixtures | ACQ scenarios download from the pinned catalog. Other scenarios may seed the model directory by copying files a passing ACQ run verified; the engine re-checks the catalog digest at load |
| Final local gate | `bash scripts/evidence/run-final-gate.sh <desktop|ios-sim|ios-mac|ios-device|android|desktop-intel|cloud>` from `patient-gpt/`, after task 1.2 approvals. The desktop batch builds the bundle with the operator's `PROMETHEUS_TIER3=1` and launches the built `.app` with the scenario environment, so the shipped `frontendDist` is exercised, not the dev server; Android uses an optimized `flutter run` under the same gate; the iOS simulator runs in debug because Flutter has no release mode there |
| Evidence | receipt per scenario under `.kbd-orchestrator/phases/local-inference-and-uar-wiring/evidence/<date>-final-gate/`: command, environment names (no secret values), source identity, exit code, observed output, verdict |
| Status vocabulary | PASS, FAIL (oracle unmet), BLOCKED (prerequisite, tool or fixture unavailable), NOT_EXERCISED |

## Prerequisites (asked once at the boundary)

0. The operator's Apple Silicon MacBook Pro (D-018) for the desktop, ios-sim and ios-mac batches; the Intel Mac runs the cloud and desktop-intel batches; the android batch runs on the ARM MacBook Pro's arm64 AVD; either machine can drive the ios-device batch.
1. Operator opens the tier gate for release-mode evidence builds (decision 11).
2. Apple development team for signing on "My Mac (Designed for iPad)" and a physical iPhone.
3. An arm64 API 36 AVD with at least 4 GiB RAM (`android-local-chat` task 3.1).
4. A local UAR v1.3.0 service per the runbook, a PAT for it, and a model provider
   on the UAR side used with synthetic data only.
5. Network access to `huggingface.co` for ACQ scenarios.
6. Decision 3 recorded and `desktop-uar-topology` amended (UAR-8, UAR-9).

## Scenario matrix

Owner task format: `<change>:<task>`. "Desktop" means macOS on Apple Silicon.

| ID | Behaviour | Owner task | Production entry | Real collaborators | Oracle (observable result) | Negative control | Boundary |
|---|---|---|---|---|---|---|---|
| LANE-1 | Missing lane rejected | inference-contract:2.3 | `POST /api/runs`; Tauri `start_run`; FFI `start_run` (`FfiRunRequest.lane` absent) | Axum server, Tauri app, FFI host | Each answers `lane_required` (HTTP 400); no event, no conversation record | A request with `lane: "local"` in scope `onboarding` is accepted on desktop | transport (HTTP, Tauri IPC, FFI) |
| LANE-2 | Unknown lane rejected | inference-contract:2.3 | `POST /api/runs`; Tauri `start_run`; FFI `start_run` (`lane: "cloud"`) | same | `unknown_lane` for `lane: "cloud"`, no event | `lane: "uar"` accepted in deterministic mode | transport (HTTP, Tauri IPC, FFI) |
| LANE-3 | Local lane refused in clinical scope | inference-contract:2.3 | Tauri `start_run` | desktop app, mlex engine | `lane_not_permitted`; engine log shows no generate call | Same message in scope `onboarding` streams a reply | transport (HTTP, Tauri IPC, FFI) |
| LANE-4 | Cloud host has no local inference | inference-contract:3.1 | `POST /api/runs`, `POST /api/embeddings`, `POST /api/models/prepare` on Axum | Axum server | Each answers `lane_unavailable` (503); `GET /api/models` returns an empty catalog and a null engine; deterministic runtime not invoked | `uar` run in deterministic mode answers the deterministic text | transport (HTTP, Tauri IPC, FFI) |
| LANE-5 | Desktop "UAR absent" mode | inference-contract:2.2 | desktop app launch | desktop app | With `PATIENTGPT_UAR_MODE=none`: `uar` run refused `lane_unavailable`, `local` onboarding run streams | Mode unset: startup fails naming `none`, `deterministic`, `service:<url>` | transport (HTTP, Tauri IPC, FFI) |
| LANE-6 | Onboarding scope round-trips | inference-contract:1.2 | `GET /api/conversations?scope=onboarding`; Tauri and FFI `list_conversations` | Axum, desktop app, FFI host | Only onboarding conversations, each with scope kind `onboarding` | `scope=onboarding:x` rejected as malformed, never defaulted to `all` | transport (HTTP, Tauri IPC, FFI) |
| ACQ-1 | Fresh acquisition with progress | model-acquisition:2.3 | Tauri `prepare_models` from the onboarding prepare control | desktop app, huggingface.co, filesystem | Before prepare, `model_status` shows every entry `absent` and null selections; then increasing `downloading` bytes, `verifying`, `installing`, `ready`; every request the app itself issues to huggingface.co (before redirects) names the pinned revision; files exist only under the scratch `PATIENTGPT_DATA_DIR` with catalog sizes and digests, and nothing is written under the default app data directory | — (see ACQ-2) | network (HTTPS) and filesystem |
| ACQ-2 | Corrupted file rejected | model-acquisition:2.1 | Tauri `prepare_models` | desktop app, filesystem | A `.part` file pre-seeded at full catalog length with wrong bytes is hashed locally without a request; the event and `model_status` both show `failed` `integrity_failed`; no file in place; chat run refused `model_not_installed` | Untampered prepare ends `ready` | network (HTTPS) and filesystem |
| ACQ-3 | Resume after interruption | model-acquisition:2.1 | Tauri `prepare_models`, stopped with `cancel_operation` on its operation id, then started again | desktop app, huggingface.co | Second prepare's first `downloading` event reports received bytes > 0; ends `ready` with matching digest | — | network (HTTPS) and filesystem |
| ACQ-4 | Memory picks the model | model-acquisition:2.2 | FFI `prepare_models` on the 4 GiB AVD; Tauri on desktop | Android app, desktop app | AVD `preflight` names `qwen3-0.6b-litertlm`; desktop with ≥ 8 GiB names `qwen3-1.7b-mlx-4bit` | Explicit `qwen3-1.7b-litertlm` on the 4 GiB AVD refused `insufficient_memory` before download | network (HTTPS) and filesystem |
| ACQ-5 | Models out of backups | model-acquisition:4.1 | FFI `prepare_models` on iOS and Android | iOS app, Android app, OS file APIs | iOS: model file's `isExcludedFromBackup` is true; Android: files under `noBackupFilesDir` | — | network (HTTPS) and filesystem |
| ACQ-6 | Unknown catalog id refused | inference-contract:2.3 | Tauri `prepare_models` with `qwen3-1.7b-litertlm` on desktop | desktop app | `invalid_input` before any download | A desktop catalog id prepares (ACQ-1) | network (HTTPS) and filesystem |
| CHAT-1 | Desktop streamed reply, UAR absent | desktop-local-chat:1.2 | Tauri window onboarding screen, app started with `PATIENTGPT_UAR_MODE=none` | desktop app, mlex, Qwen3 MLX model | Exactly one `TEXT_MESSAGE_START`/`TEXT_MESSAGE_END` pair; ≥ 2 `TEXT_MESSAGE_CONTENT` before the end; `RUN_FINISHED`; reply has no `<think>` markers | CHAT-6 | engine and shell IPC |
| CHAT-2 | iOS reply on Mac (Designed for iPad) | ios-local-chat:2.2 | iOS app onboarding screen on the Mac destination | iOS app, MLX-Swift, Qwen3 MLX model | Exactly one `TEXT_MESSAGE_START`/`TEXT_MESSAGE_END` pair; ≥ 2 `TEXT_MESSAGE_CONTENT` before the end; `RUN_FINISHED`; no `<think>` markers | CHAT-4 | engine and shell IPC |
| CHAT-3 | iOS reply on a physical iPhone | ios-local-chat:2.2 | iOS app onboarding screen on the device | iOS app, MLX-Swift, model | Exactly one `TEXT_MESSAGE_START`/`TEXT_MESSAGE_END` pair; ≥ 2 `TEXT_MESSAGE_CONTENT` before the end; `RUN_FINISHED`; no `<think>` markers; a run started as soon as the home view appears is not refused `engine_unavailable`; receipt records device model and reported RAM | CHAT-4 | engine and shell IPC |
| CHAT-4 | iOS simulator states no engine | ios-local-chat:1.2 | iOS app onboarding screen in the simulator | iOS app | Run refused `engine_unavailable` (checked before `model_not_installed`, so the result does not depend on whether a model was prepared); UI says the model does not run in the simulator; no reply text | — | engine and shell IPC |
| CHAT-5 | Android emulator reply | android-local-chat:2.2 | Android app onboarding screen on the arm64 API 36 AVD, mode `none` | Android app, LiteRT-LM CPU, model | Streamed reply, `RUN_FINISHED` | `uar` run refused `lane_unavailable` | engine and shell IPC |
| CHAT-6 | Chat before model installed | inference-contract:2.3 | Tauri onboarding screen on a fresh data directory | desktop app | Refused `model_not_installed`; UI says the chat model is not installed | — | engine and shell IPC |
| CHAT-7 | Cancel frees the engine | desktop-local-chat:1.2 | Tauri onboarding screen | desktop app, mlex | `cancel_operation` ends the first stream with `RUN_ERROR` `cancelled`; the second run's first content arrives before the first reply's token limit would have elapsed | `cancel_operation` with an unknown id is refused `not_found` | engine and shell IPC |
| CHAT-8 | Intel desktop has no engine or embedder | desktop-local-chat:2.1 | debug Tauri app on the Intel Mac, mode `none` | desktop app | `local` onboarding run and `embed` both refused `engine_unavailable`; the window stays usable | On the ARM MacBook Pro the same calls succeed (CHAT-1, EMB-1) | engine and shell IPC |
| PRIV-1 | No egress during local run or embed | desktop-local-chat:1.2 | Tauri onboarding run and `embed` | desktop app, macOS `nettop` sampling of the app PID and its WebKit networking process | No new non-loopback outbound connection from the app PID or its WebKit networking process between `RUN_STARTED` and `RUN_FINISHED`, or during `embed` (loopback to the dev server is excluded) | A `prepare_models` run in the same session shows connections to huggingface.co (proves the sampler sees traffic) | network |
| EMB-1 | Desktop embedding | local-embedder-and-mobile-store:1.2 | Tauri `embed` | desktop app, fastembed, ort, int8 ONNX | 2 vectors × 384 finite numbers, id `arctic-embed-xs-int8`; repeat call cosine ≥ 0.9999; one `query`-purpose call also returns 384 numbers | EMB-4 | engine and shell IPC |
| EMB-5 | Embedder loads only verified files | local-embedder-and-mobile-store:1.2 | Tauri `embed` after deleting the embedder's `tokenizer.json` from the scratch model directory | desktop app, filesystem, `nettop` | `model_not_installed`; no outbound connection during the call | Intact files embed (EMB-1) | engine and shell IPC |
| EMB-2 | iOS simulator embedding | local-embedder-and-mobile-store:1.4 | FFI `embed` from the iOS app | iOS app, ort sim build | As EMB-1 for 2 texts | Before prepare: `model_not_installed` | engine and shell IPC |
| EMB-3 | Android emulator embedding | local-embedder-and-mobile-store:1.4 | FFI `embed` from the Android app | Android app, ort | As EMB-1 for 1 text | Before prepare: `model_not_installed` | engine and shell IPC |
| EMB-4 | Embed limits | inference-contract:2.3 | Tauri `embed` | desktop app | 65 texts refused `invalid_input`, nothing computed | 64 texts accepted | engine and shell IPC |
| STORE-1 | Mobile conversations and settings survive restart | local-embedder-and-mobile-store:2.2 | Onboarding conversation on the iOS simulator (conversations only), and conversation plus a confirmed `set_uar_endpoint` proposal on the Android emulator and the iOS Mac destination | apps, SurrealDB RocksDB | After force-quit and relaunch, scope `onboarding` lists the conversation and `get_settings` returns the recorded URL | — | database (SurrealDB RocksDB) and filesystem |
| STORE-2 | Store open failure is loud | local-embedder-and-mobile-store:2.2 | iOS simulator app launch | app, filesystem | With the store path replaced by a file in the app container, boot fails `storage_failed` and the UI says local storage could not be opened | Normal launch opens the store | database (SurrealDB RocksDB) and filesystem |
| UAR-1 | Cloud host reaches UAR by URL | agui-bridge-and-uar-service:2.1 | Web shell onboarding screen against the Axum server in service mode (`uar` lane, scope `onboarding`) | Axum server, UAR v1.3.0 service, UAR's provider | Browser receives streamed text from UAR and `RUN_FINISHED` | UAR-2 | process, network and AG-UI protocol |
| UAR-2 | UAR failures visible | agui-bridge-and-uar-service:2.1 | same as UAR-1 | Axum, UAR service | Service stopped: `RUN_ERROR` `uar_unavailable` within the connect timeout; wrong token: `uar_unauthorized` | Correct token and running service: UAR-1 | process, network and AG-UI protocol |
| UAR-3 | Unrouted scope refused | agui-bridge-and-uar-service:2.2 | Axum `POST /api/runs`, `uar`, case scope, service mode | Axum, UAR service request log | `agent_unavailable` (503); UAR request log shows no request | Onboarding scope reaches UAR | process, network and AG-UI protocol |
| UAR-4 | iOS embedded onboarding on local driver | uar-embedded-runtime:1.2 | iOS app onboarding screen on the Mac destination, mode `embedded` | iOS app, embedded UAR, MLX-Swift, model | Subset events end `RUN_FINISHED` with synthesized message boundaries; text produced by the local model; UAR persistence files exist only inside the app container's data directory | UAR-5 | process, network and AG-UI protocol |
| UAR-5 | Local driver refuses other agents (classification: boundary guard; the shipped app routes only the onboarding agent, so this runs through the production `UarMode::Embedded` builder in a `scripts/evidence/` harness built on macOS with feature `embedded`, whatever decision 3 chooses) | uar-embedded-runtime:2.1 | production embedded builder with a synthetic non-onboarding agent | embedded UAR | `driver_not_permitted`; engine log shows no generate call | Onboarding agent runs (UAR-4) | process, network and AG-UI protocol |
| UAR-6 | Tool admission denies (classification: boundary guard, same harness as UAR-5) | uar-embedded-runtime:2.2 | production embedded builder running the onboarding agent id with a synthetic definition that adds a tool named `sign_letter` described as read-only and safe | embedded UAR, admission port | Admission denies the call and logs agent id and tool name; the tool body never executes; no host state changes; UAR returns the denial to the model and the run ends `RUN_FINISHED` or `RUN_ERROR` | Host start with a clinical command in an allowlist fails start-up | process, network and AG-UI protocol |
| UAR-7 | iOS UAR linked, not configured | uar-embedded-runtime:3.1 | iOS app onboarding screen on the Mac destination, mode `none` | iOS app | `uar` refused `lane_unavailable`; `local` onboarding run streams | — | process, network and AG-UI protocol |
| UAR-8 | Desktop UAR path | desktop-uar-topology:3.1 | Tauri window onboarding screen with UAR configured for the chosen topology | desktop app and the topology's UAR | Streamed reply ending `RUN_FINISHED` | UAR-9 | process, network and AG-UI protocol |
| UAR-10 | Service mode start-up checks | agui-bridge-and-uar-service:2.1 | `cargo run -p patient-gpt-server` with service mode | Axum server binary | No `PATIENTGPT_UAR_TOKEN`: start-up fails naming it; `service:http://uar.example.test`: fails stating remote URLs must use https | `service:http://127.0.0.1:<port>` with a token starts | process, network and AG-UI protocol |
| UAR-11 | Android links no UAR (classification: structural, supplemental) | uar-embedded-runtime:3.1 | `cargo tree -p patient-gpt-ffi --target aarch64-linux-android -i universal-agent-runtime` | Cargo dependency resolver | UAR not found in the Android dependency tree; Android app built with another mode fails boot naming `none` | The same command for `aarch64-apple-ios` with feature `embedded` lists UAR | process, network and AG-UI protocol |
| BRIDGE-1 | Bridge surfaces unsupported events and version mismatch (classification: supplemental) | agui-bridge-and-uar-service:1.1 | production bridge fed streams captured from a real UAR v1.3.0 run, including an interrupt and a rewritten protocol version | bridge, captured streams with recorded digests | Interrupt → `RUN_ERROR` `unsupported_event`; version ≠ 1.0 → `protocol_mismatch` before text | Unmodified captured text stream → subset events ending `RUN_FINISHED` | AG-UI protocol |
| UAR-9 | Desktop UAR failure contained | desktop-uar-topology:2.1 | Tauri window onboarding screen | desktop app, UAR | UAR made unavailable: `uar` run ends `uar_unavailable`, window stays open, next `local` run streams | — | process, network and AG-UI protocol |
| ONB-1 | First-run onboarding | local-onboarding:4.1 | Tauri app on a fresh data directory | desktop app, huggingface.co, engine | Prepare control → progress → ready → onboarding reply streams | CHAT-6 | UI, shell IPC and local store |
| ONB-2 | Confirmed proposal executes once | local-onboarding:2.2 | Tauri onboarding screen, real model reply carrying a valid proposal (up to 5 prompts from the feasibility set) | desktop app, engine, host proposal store | Confirm downloads the proposed entry to `ready`; second apply with the same id refused `invalid_input` | ONB-3 | UI, shell IPC and local store |
| ONB-3 | Declined proposal changes nothing | local-onboarding:2.2 | same as ONB-2 | same | Decline: no download, settings unchanged, gate shows declined | — | UI, shell IPC and local store |
| ONB-4 | Invalid proposal has no control | local-onboarding:2.2 | same as ONB-2, real model reply carrying an invalid block | same | Reply shown with the "could not be used" notice and no Confirm control | If the model produces no invalid block in the feasibility set and the gate run, the production scenario is NOT_EXERCISED; a replay of a recorded real reply through `AppServices` is supplemental only | UI, shell IPC and local store |
| ONB-5 | UAR endpoint recorded, not connected | local-onboarding:2.2 | same as ONB-2, proposal with `set_uar_endpoint` | desktop app, settings store, a local TCP listener on 127.0.0.1 that logs every connection | The proposal sets `http://127.0.0.1:<listener port>`; after Confirm, `get_settings` returns that URL and the listener logs no connection | A URL with credentials fails validation | UI, shell IPC and local store |
| ONB-6 | Mobile onboarding parity | local-onboarding:5.1 | Flutter onboarding screen on Android emulator and iOS Mac destination | apps, engines | Prepare → reply → proposal gate behave as ONB-1/2 | iOS simulator: CHAT-4 refusal shown on the onboarding screen | UI, shell IPC and local store |
| ONB-7 | Cloud host refuses setup | local-onboarding:3.1 | Axum `GET /api/settings`, apply/decline routes | Axum server | `host_unsupported` (503) | — | UI, shell IPC and local store |
| ONB-8 | Onboarding has no clinical input (classification: structural, supplemental) | local-onboarding:2.2 | host onboarding prompt builder source | source | The builder takes no clinical port and no patient, case or document type | A clinical-scope run never reaches the builder (LANE-3) | UI, shell IPC and local store |
| ONB-9 | Raw setup block never displayed | local-onboarding:2.2 | Tauri onboarding screen, real model reply carrying a proposal | desktop app, engine, host withholder | The thread and the shell's received deltas contain no part of the ` ```patientgpt-setup ` marker or its JSON; text before the block is complete; then the `patientgpt.setup_proposal` event arrives before `RUN_FINISHED` | A reply with no block streams unchanged | UI, shell IPC and local store |
| PAR-1 | Transport parity (classification: structural, supplemental) | inference-contract:5.1 | contract table vs `routes.rs`, `commands.rs`, FFI API | source files | Every row present on all three with identical codes | A deliberately removed command is detected, then restored | source |
| SPIKE-1 | Spike results (classification: design input, not acceptance) | uar-embedding-spike:4.1 | spike workspace | UAR v1.3.0, toolchains | Report exists with every item and verdict | — | build and in-process runtime |

## Evidence invalidation keys per change

A scenario's receipt is invalid when any path of its owner change below differs
from the receipt's recorded revision, when the catalog digests change (ACQ, CHAT,
EMB, ONB), or when the UAR pin changes (UAR, BRIDGE).

| Owner change | Paths |
|---|---|
| inference-contract | `crates/patient-gpt-domain/`, `crates/patient-gpt-host/`, `crates/patient-gpt-uar/src/mode.rs`, `crates/patient-gpt-server/src/`, `desktop/src-tauri/src/commands.rs`, `crates/patient-gpt-ffi/src/api/`, `web/src/app/transport/`, `mobile/lib/features/workspace/data/` |
| model-acquisition | `crates/patient-gpt-inference/src/{catalog,download,preflight,store}*`, `desktop/src-tauri/src/{config,lib}.rs`, `crates/patient-gpt-ffi/src/host_state.rs` |
| desktop-local-chat | `crates/patient-gpt-inference` engine-mlex module, `desktop/src-tauri/src/lib.rs` |
| ios-local-chat | `mobile/ios/Runner/`, `crates/patient-gpt-ffi` engine registration, `crates/patient-gpt-inference` engine-bridge module |
| android-local-chat | `mobile/android/app/`, `crates/patient-gpt-ffi` JNI entry points, `crates/patient-gpt-inference` engine-bridge module |
| local-embedder-and-mobile-store | `crates/patient-gpt-inference` embedder module, `crates/patient-gpt-storage/`, `crates/patient-gpt-ffi/src/host_state.rs` |
| agui-bridge-and-uar-service | `crates/patient-gpt-uar/src/`, `crates/patient-gpt-host/src/error.rs`, the three error mappings, `uar/agents/onboarding/` |
| uar-embedded-runtime | `crates/patient-gpt-uar/src/` embedded module, workspace `Cargo.toml` patch overlay, `crates/patient-gpt-ffi` boot |
| desktop-uar-topology | `desktop/src-tauri/` |
| local-onboarding | `crates/patient-gpt-host/` onboarding modules, `crates/patient-gpt-storage/` settings, setup routes and commands, `web/src/features/onboarding/`, `mobile/lib/features/onboarding/` |

## Limitations

- iOS chat has no simulator evidence by design (decision 1); CHAT-4 proves the refusal only.
- An operating-system memory kill on iOS raises no error; receipts record device RAM and model id so a silent exit is attributable.
- UAR-1 depends on a UAR-side provider; its text proves routing and streaming, not answer quality.
- ONB-2..5 depend on the real model emitting proposals; counts from the feasibility run are reported with the verdicts.
- UAR's own denial handling continues the run (v1.3.0 `src/llm/orchestrator.rs:2858-2861`), so UAR-6 proves only that nothing executed, not how the model replied.
- UAR-5 and UAR-6 exercise guards the shipped app cannot reach this phase; they use real UAR and the real engine with synthetic agent definitions, and are reported as boundary-guard evidence, not user-operation evidence.
- Not exercised by any local run: the HTTPS-only redirect rule (the catalog cannot be pointed at a test server without changing pinned URLs). Both are reviewed in source at the boundary and reported NOT_EXERCISED.
- Also not exercised: `cancel_operation` over HTTP and FFI (CHAT-7 covers Tauri), the `MAX_NEW_TOKENS` bound, a UAR service stream that ends early (`runtime_failed`), and an engine error after streaming starts (`runtime_failed` mid-reply), and iOS engine re-registration being ignored; neither can be triggered from the shipped app without a fault-injection seam this phase does not add.
- Windows and Linux are out of scope (decision 10).
