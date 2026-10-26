ASSESSMENT: local-inference-and-uar-wiring
Project: PatientGPT
Date: 2026-10-26
Codebase baseline: a building three-shell scaffold (Rust core + Axum, React web/Tauri, Flutter + FFI) whose only agent runtime is a deterministic stub; there is no inference, embedding, model-storage or real UAR code anywhere in PatientGPT.
Cross-tool progress: none (new phase; implementation 0 of 0).

Sources: three read-only fact-finding passes on 2026-10-26 over PatientGPT, the KnowMe
reference (`/Users/gqadonis/Projects/know-me/know-me-system`, HEAD 2026-10-11) and UAR
(`/Users/gqadonis/Projects/prometheus/universal-agent-runtime`, working tree
`eddd5508` on branch `codex/uar-1-1-1-implementation`, crate 1.1.1; `origin/main`
is `7ee9bf31`, crate 1.3.0). Paths below are relative to each repository.

## Lessons applied (from prior-context.md)

- "External integrations require at least one real-service test" — UAR and model
  hosts are external; this assessment treats every UAR/engine claim as unverified
  until a run against the real runtime and model file is observed.
- "Installer behavior tests must exercise installer dispatch" — model acquisition
  is an installer; evidence must come from the app's own download path, not a
  unit test of the downloader.
- "Preserve production evidence in dated review folders" — device/simulator
  evidence for this phase goes in a new dated folder with a README.
- "Ask once at phase boundary for operator-only actions" (recorded for another phase; extended here by analogy) — `versions.toml` pins,
  tier-gate opening, and cross-repo UAR changes are operator-only here.

Knowledge gaps: none recorded in prior-context.md.

IMPLEMENTATION STATUS
- Local chat inference (desktop, iOS, Android): MISSING — no engine dependency,
  no `InferenceProvider`/`Lane`, no catalog, downloader, SHA verification, RAM
  preflight or model directory (grep over crates/, desktop/, web/src, mobile/lib).
- Local embedder: MISSING — no embedder crate or port; `docs/design` search uses
  deterministic vectors only (`.prometheus/project-contract.md:157-158`).
- UAR runtime: STUB — `crates/patient-gpt-uar` has `UarMode {Deterministic,
  Service{url}}` (`src/mode.rs:9-14`); `Service` fails at startup
  (`src/lib.rs:22`); no `Embedded` variant; no UAR dependency in the workspace.
  Mobile hard-codes `deterministic` (`mobile/lib/features/workspace/data/ffi_patient_gpt_gateway.dart:18`).
- Host seam for inference: MISSING — `AppServices` takes three ports only
  (clinical, conversations, runtime) (`crates/patient-gpt-host/src/services.rs:27-37`).
- Transport contract for model status/download/embed/lane: MISSING — the six-op
  mirror (`docs/plan/scaffold-contracts.md:6-20`) and AG-UI subset (55-69) have
  no lane, model-status, download-progress or embedding operation; `RunRequest`
  has no lane.
- Onboarding UI: MISSING on all shells (no route/feature; seams identified in
  `web/src/app/router.tsx:11-16`, `mobile/lib/app/router.dart:15-24`).
- Desktop topology decision: NOT DECIDED (phase goal 3).
- Cloud host: PARTIAL — Axum server exists and streams AG-UI over SSE
  (`crates/patient-gpt-server/src/routes.rs`); no UAR service client.

CROSS-TOOL PROGRESS
- NONE — no cross-tool activity recorded for this phase.

## What the references actually provide

KnowMe (reuse candidate):
- Per-device engines behind one `InferenceProvider` trait
  (`rust/crates/gen_ui_types/src/inference.rs:225-305`): macOS mlx-c via `mlex`
  0.1.3; Windows/Linux `llama-cpp-2` 0.1.151 (vendored patch); iOS MLX-Swift over a
  C vtable (`mobile/ios/Runner/KnowMeMlxBridge.swift:236-264`); Android LiteRT-LM
  AAR 0.14.0 over JNI, arm64-v8a, CPU backend.
- Pinned catalog (HF repo + revision + bytes + SHA-256) with `.part` Range resume,
  streamed verify, atomic rename (`gen_ui_inference/src/llama.rs:195-298`,
  `mlx_download.rs:100-171`); RAM preflight before download with downgrade
  (`memory.rs`); `ModelOperationState` progress machine (`gen_ui_types/src/lifecycle.rs:104-123`).
- Embedder: fastembed 5.17.3, all-MiniLM-L6-v2, 384 dims, SurrealDB HNSW + BM25 +
  RRF (`gen_ui_db_graph/src/embed.rs`, `schema.rs:37-43,74-103`).
- KnowMe embeds UAR on iOS/Android/macOS via `UarEmbeddedRuntime::build_local`,
  wrapping its local provider as UAR's LLM driver (`gen_ui_agent/src/uar.rs:872-929`),
  and uses a UAR HTTP service client on Windows/Linux (`uar.rs:1657`).
- Known defects not to copy: `qwen3.5-*` ids that hold Qwen3 artifacts; legacy
  9B GGUF iOS default; downloads not OS-background; models not excluded from iOS
  backup; fastembed weights not SHA-pinned; UAR memory embedding model defaults to
  `text-embedding-3-small` (vendor `config.rs:886-888`, probable two-embedder bug);
  version drift between its `versions.toml` and manifests.
- KnowMe device evidence: Android SM8750 certified (a physical device; no
  emulator run is recorded); macOS release ~13.4 tok/s; **iOS has no
  physical-device inference proof.** KnowMe's own simulator builds register no MLX
  bridge and "degrade to a clean 'not available'" (`gen_ui_inference/src/ios_mlx_ffi.rs:4-7`).
  That is KnowMe's design choice; whether MLX-Swift itself can run in the iOS
  simulator is UNKNOWN (no MLX or Apple source checked). The embedder (fastembed,
  ONNX) is a separate engine and nothing cited prevents it from running there.
- Onboarding driven by the local model: design doc only
  (`docs/strategies/local-models/README.md:35-77`); no code.

UAR (consumption target):
- One package; embedding entry `EmbeddedRuntime::builder()` (`src/embedded.rs:131`),
  which **requires the host to supply** an `LlmDriver` + `ProviderConfig`,
  persistence, `GovernanceEngine` and `HostToolAdmissionPort` (493-597). UAR ships
  **no local chat engine** (no llama.cpp/MLX/LiteRT in `src/`); local embeddings
  exist via fastembed behind `local-models`, but embedded builds default to an
  unavailable backend (527-534).
- Sidecar: `uar-sidecar` binary (stdin launch token, `READY:{port}`, exit on stdin
  EOF; `src/bin/uar-sidecar.rs`); full HTTP/SSE AG-UI at
  `/api/uar/ag-ui/agents/{id}`.
- No public composed-Router builder; sub-routers `uar::api::router()` and
  `agui::build_router()` need `RunApiState` (`src/uar/api/routes.rs:23-28`).
- AG-UI profile `uar.agui/1`, AG-UI 1.0 (`@ag-ui/core` 1.0.2 per `docs/AGUI_V1.md:3-8`).
- A2UI catalog ids are hard-coded; anything other than `urn:uar:a2ui:catalog:1`
  or the basic v0_9 catalog is rejected (`src/uar/a2ui/protocol.rs:264-266`).
- Status: desktop Preview; the mobile *platform* row is Experimental with gate
  "none" (`docs/product-support-matrix.json:72-73`; "Mobile is Experimental",
  `docs/product-support-matrix.md:56`). The `embedded-mobile` *feature profile*
  (android/ios, "Transport-free library profile", `Cargo.toml:245-248`) does have a
  gate: `cargo check --locked --no-default-features --features embedded-mobile`
  (`docs/product-support-matrix.json:9`), and UAR's `rust-toolchain.toml` lists
  `aarch64-apple-ios`, `aarch64-apple-ios-sim` and `aarch64-linux-android` targets.
  Compile checks for iOS and Android are recorded as passing; no runtime or size
  evidence on mobile was found. "The Rust embedding/library API are not public
  compatibility contracts" for 1.0 (`docs/compatibility-policy.md:36-39`).
- Consumption guidance found, which points in different directions:
  - UAR, bossfang-specific: recommends a supervised local service/sidecar over
    linking the monolithic crate; a library option "can make sense for
    offline/mobile packaging" after UAR extracts a narrow, dependency-light kernel
    (`docs/librefang-integration.md:132-164`). Whether this applies to PatientGPT
    is UNKNOWN.
  - Architecture skill, project-relevant: `LANE_UAR = "uar" // embedded-library on
    mobile, never a sidecar` (`references/rust/inference-lanes.md:103`), which
    supports goal 4.
  - Neither source evaluates PatientGPT's desktop options (a)/(b)/(c).
- Build coupling: pins `surrealdb =3.3.0` with a `[patch.crates-io]` overlay that
  dependents must replicate (`Cargo.toml:30-37`); `rust-toolchain.toml` pins
  `nightly-2026-07-18`; every profile compiles tokio `process`, child-process MCP,
  liter-llm `full` and reqwest; no recorded mobile binary size.

SPEC GAP SUMMARY
- Lane/mode rules conflict: PatientGPT has no default UAR mode and treats
  Deterministic as a demo mode; the architecture skill makes `Embedded` the default
  and Deterministic test-only (`references/rust/patterns.md:210-240`); KnowMe makes
  the on-device model its explicit unset default ("Unset ⇒ the on-device local
  model", KnowMe `gen_ui_agent/src/uar.rs:38-43`; not a UAR source). The phase goal's
  "inference works when UAR is not configured" must be an explicit lane, not a
  silent fallback, under the lane rule (`references/rust/inference-lanes.md:99-110`).
- Protocol version split: web pins `@ag-ui/core` 0.0.59 (peer of a2ui-react 4.2.0);
  UAR speaks AG-UI 1.0 / `@ag-ui/core` 1.0.2. Whatever routes UAR to the shells
  must translate, or the web pin must move (a2ui-react's peer range forbids 1.x).
- A2UI catalog conflict: PatientGPT's `urn:patientgpt:a2ui:catalog:basic:v1` is
  not an id UAR accepts today.
- Vector storage: the architecture's client-RAG matrix expects pglite-oxide/pgvector
  on desktop and sqlite-vec on mobile; PatientGPT has SurrealDB 3.3.0 on desktop
  (HNSW available) and **no mobile store** (`versions.toml` storage_target:
  "Mobile store decision remains explicit"). Mobile embeddings have nowhere to live.
- `versions.toml` has no `[inference]` table and agents may not edit it.
- Goals 1/6 and goal 4 conflict on iOS: goal 4 says "iOS always embeds UAR";
  goals 1 and 6 require inference and evidence "with UAR absent" / "even when UAR
  is not configured". On iOS, "UAR absent" is undefined (not linked, linked but
  unconfigured, or deterministic mode). That choice decides whether the iOS floor
  can be built before goal 4.
- Android's UAR mode is not stated in the goals (goal 4 covers iOS and cloud only);
  KnowMe embeds UAR on Android (KnowMe `gen_ui_agent/src/uar.rs:872-929`).
- Toolchain conflict: PatientGPT has no `rust-toolchain.toml` and declares
  `rust-version = "1.94"` on stable (`Cargo.toml:33`); UAR pins
  `nightly-2026-07-18` (UAR `rust-toolchain.toml:10-18`). Embedding UAR (desktop
  options a/c, iOS, possibly Android) would put PatientGPT's build on nightly or
  require UAR to build on stable — untested either way.
- Praxis pglite-oxide vs SurrealDB on desktop remains open (`docs/plan/scaffold-plan.md:137-141`).

BUILD HEALTH
- build check: PASS — `cargo check --workspace` (Finished in 5.23s);
  `pnpm --dir web typecheck` (no errors); `flutter analyze` ("No issues found!").
- known violations: NONE observed by these commands.
- test coverage: NONE — by project policy tests run only at full-phase end.
- Tree state: ~120 uncommitted paths under `patient-gpt/` (icons, Android build
  fix, A2UI on both shells, Tailwind/shadcn, parity work). Inference work would land
  on top of unreviewed changes.

CONSTRAINT CHECK
- AGENTS.md violations: NONE in current code. Constraints that bind this phase:
  no competing agent loop (UAR owns execution); PHI stays local or goes only to a
  BAA-covered, zero-retention, US endpoint gated by policy (parent `AGENTS.md:305-309`,
  Texas SB 1188); an embedding of local data is itself local (parent `AGENTS.md:290-301`);
  unknown lane rejected loudly.
- constraints.md violations: NONE. Binding items: cross-repository UAR changes need
  a lead-scoped handoff (`constraints.md:17`); tests only at full-phase end; model
  selection/initialisation does not prove runtime binding (line 105).
- Tier gate: release builds, `tauri build` and `flutter build ios|apk` are blocked
  while status is not a release boundary (`.claude/hooks/tier-guard.sh:27,44`).
  Operator-controlled, reversible opt-ins exist: `PROMETHEUS_TIER3=1` per command
  or `.kbd-orchestrator/tier3.allow` per session (`tier-guard.sh:34-35`). Without
  them, evidence comes from debug runs, where on-device inference is slow.
- (All `constraints.md` line references above are the project-level
  `.kbd-orchestrator/constraints.md`.)

## Risks and friction (S-03)

1. **iOS chat evidence on the simulator is unproven.** The phase goal names "iOS
   simulator" evidence. KnowMe's MLX path has never produced iOS inference
   evidence, on device or simulator, and its simulator build deliberately
   registers no bridge. Whether MLX-Swift runs in the simulator is UNKNOWN; the
   architecture skill forbids llama.cpp on iOS. The embedder half of the iOS
   evidence is not affected by this.
2. **Android emulator evidence is unproven.** KnowMe's Android proof is a physical
   SM8750 device; no emulator run is recorded. The candidate LiteRT model is
   ~2.6 GB on the CPU backend, inside an emulator image whose default RAM may be
   smaller. Emulator feasibility is UNKNOWN.
3. **UAR embedding stability is partly unproven.** Its library API is not a
   compatibility contract for 1.0; the mobile platform is Experimental, though the
   `embedded-mobile` profile has a compile gate and iOS/Android targets; no mobile
   runtime or size evidence exists; the checkout is on an older branch and 1.3.0
   is "verification pending"; it pins a nightly toolchain (vs PatientGPT's stable
   1.94) and a SurrealDB patch overlay. How much of this blocks goal 4 is UNKNOWN
   until analysis measures it.
4. **Two-embedder risk: UNKNOWN for PatientGPT.** KnowMe's vendored, older UAR
   defaults memory to `text-embedding-3-small` (KnowMe
   `rust/vendor/universal-agent-runtime/src/config.rs:886-888`). In the target UAR
   checkout, embedded builds default to `UnavailableEmbeddingBackend`
   (`src/embedded.rs:527-534`); the only related hit is a comment at
   `src/config.rs:1656`. Whether the split recurs depends on how PatientGPT
   configures UAR memory.
5. **No owner** for an inference crate, embedder or model acquisition:
   `.agent-team/patientgpt-delivery/team.json` lists 17 roles covering UAR, FFI,
   desktop, storage and host; none covers engines or model acquisition.
6. **Model licensing: UNKNOWN.** KnowMe records no licence in code; its strategy
   doc lists Qwen and Gemma 4 as Apache-2.0 (KnowMe
   `docs/strategies/local-models/README.md:169-178`), which this assessment has not
   verified against the model cards. For a product used by a clinical practice, the
   licence of every shipped model must be confirmed before release.
7. **Model size vs the use case.** KnowMe's catalog sizes: Qwen3-4B MLX 4-bit
   2,278,969,756 B (KnowMe `gen_ui_inference/src/catalog.rs:193-265`); Gemma 4
   E2B LiteRT 2,588,147,712 B (`catalog.rs:85-96`). Onboarding may not need a
   model this size; size and RAM budget per target are open.
8. **Compliance surface of onboarding.** The local model must never receive PHI
   bound for egress. Texas TRAIGA/HB 149 AI-use disclosure is listed in the
   parent's compliance strategy (parent `docs/compliance/HIPAA-compliance-strategy.md:14-17`);
   whether it applies to the onboarding UI is UNKNOWN. Model download is not PHI
   egress but its host and integrity must be pinned.
10. **Goal 5 meets capability inversion.** Goal 5 has the local model "set up the
   decentralized deployment", which implies configuration writes driven by model
   output. Project rules say agent kernels do not write and mutations are gated in
   the trusted host layer (`CLAUDE.md`, Capability inversion), and the agent cannot
   affirm, sign or submit. How a model-driven onboarding performs setup (proposals
   the host executes after user confirmation, or something else) is an open,
   design-changing decision.
9. **Debug-build inference speed** and the tier gate make the "streamed reply"
   evidence slow to produce; a profile override for the engine crate is likely
   needed.

GOAL PROGRESS
- G1 local inference floor on desktop/iOS/Android without UAR: NOT MET — no code.
- G2 local model + embedder via the KnowMe pattern: NOT MET — pattern located and
  mapped; nothing ported.
- G3 desktop topology decided through the KBD cycle: NOT MET — options (a) UAR in
  the Tauri process, (b) UAR sidecar, (c) PatientGPT Axum host sidecar embedding
  UAR can each be assembled from UAR primitives: (a) `EmbeddedRuntime` or
  in-process `start_server`; (b) the `uar-sidecar` binary; (c) `EmbeddedRuntime`
  plus mounting `uar::api` sub-routers with `RunApiState`. None has PatientGPT-
  specific guidance in UAR; the only guidance found is bossfang-specific. No option
  is preferred by this assessment. Analysis pending.
- G4 iOS embeds, cloud by URL with the same host code: NOT MET — no Embedded mode,
  no service client.
- G5 local model drives onboarding, not clinical work: NOT MET — no onboarding.
- G6 evidence on desktop, iOS simulator, Android emulator: NOT MET. Feasibility of
  the chat half is UNKNOWN on both mobile targets (risks 1 and 2); the embedding
  half has no identified blocker.

## Adopted-outcome contract inputs

- User operation (one useful shipped operation): on a fresh install, a practice user
  opens PatientGPT on desktop, iOS or Android, the app acquires the local chat
  model and embedder with visible progress, and the local model drives the
  onboarding that sets up the decentralized deployment, while UAR is absent. The
  smallest observable slice of that is a streamed local reply plus an embedding;
  the full operation includes the setup itself (goal 5). Source: operator instruction
  2026-10-26 ("ensuring that regardless of other parts being set up, we at least
  have inference available and working for desktop and mobile even if the UAR is
  not yet configured").
- Observed baseline: no inference anywhere; deterministic stub only; build green.
  UNKNOWN: chosen chat and embedding models; RAM budgets per target; whether a
  physical iPhone is available; which UAR version is the target (baseline read against 1.1.1);
  UAR binary size on mobile; acceptable download size for onboarding.
- Desired observable results, per goal:
  - G1/G2/G6 (goals.md:3-4,8): a streamed local reply and an embedding on desktop,
    the iOS simulator and the Android emulator, with UAR absent.
  - G3: a recorded topology decision with its rationale, and the UAR path shown
    on desktop through that topology once UAR is configured (goals.md:8).
  - G4: iOS running UAR embedded; the cloud host reaching a running UAR by URL,
    using the same host routing code as desktop.
  - G5: the local model driving onboarding through to a completed deployment setup.
- Environments as stated in goals.md: desktop (Tauri), iOS simulator, Android
  emulator, and cloud (UAR as a service by URL). Observed, not stated: macOS host,
  iPhone 17 / iOS 26.4 simulator booted, API 35/36 emulator images. UNKNOWN,
  operator to decide: which desktop OSes are in scope; whether physical iPhone and
  Android devices are required if a simulator/emulator cannot run the chat model.
- Open operator decisions raised by this assessment (not decided here):
  1. If the chat model cannot run in the iOS simulator or Android emulator, is
     the goal met by a physical device, by a simulator-capable engine, or reported
     Blocked?
  2. What "UAR absent" means on iOS given "iOS always embeds UAR".
  3. Android's UAR mode (embedded, service, or none).
  4. Acceptance of a nightly toolchain if UAR is embedded anywhere.
  5. How goal 5's model-driven setup performs writes under capability inversion.
  6. Which UAR version is the target. This baseline was read against 1.1.1 (the
     checkout); `origin/main` is 1.3.0 ("verification pending"); 1.2.3 is the
     latest tagged release. `versions.toml` has no UAR pin. Findings may not carry
     over between versions.
- Required safety/security checks: no PHI to the local model's egress (it has
  none) and none to any cloud lane without BAA/zero-retention/US gating; embeddings
  of local data stay local; model artifacts SHA-256 + revision pinned; lane parsed
  loudly with no default arm; RAM preflight before load; agent cannot affirm, sign
  or submit.
- Exclusions stated by the operator: agentic clinical work on the local model
  (goals.md:7). Exclusions implied by project policy: a cloud lane carrying PHI
  without BAA/zero-retention/US gating. Everything else (device certification,
  release bundles, Windows/Linux, OS-background downloads) is UNKNOWN, not excluded.
- Risk acceptance: UNKNOWN — operator to accept or reject UAR's non-contract
  embedding API, Experimental mobile status and nightly toolchain before analysis
  weighs any option that embeds UAR (desktop a/c, iOS, Android).

- Decision owner: the operator (Travis James) for topology, model choice,
  `versions.toml` pins, tier-gate opening and the open decisions above;
  uar-agent-expert for UAR-side changes (cross-repo, lead-scoped handoff).

## The uncomfortable thing

This phase can finish with working inference on desktop only, and with a chat demo
standing in for goal 5's deployment setup. If the chat model cannot run in the iOS
simulator or Android emulator and no physical devices are used, both mobile targets
end Build-only or Blocked; iOS-embedded UAR has compile evidence but no runtime
evidence anywhere; the cloud host path has not been exercised. Unless the open
decisions above are taken explicitly, the phase could report progress on every goal
while the mobile floor in goal 1, the operator's stated priority, is never met and
nobody decided to drop it.

## Review record

- Sycophancy screen: score 0.0, no patterns
  (`sycophancy/assess-2026-10-26T11-07-46Z.json`; run on a condensed summary).
- Independent review (artifact-critic, fresh context), round 1: 1 CRITICAL (the
  contract narrowed iOS evidence to "device or Blocked" and excluded device work
  by default), 9 WARNING. All addressed.
- Round 2: no CRITICAL; verdict "stands, provided warnings 1-5 are corrected";
  W1 (embedded-mobile profile omitted), W2 (bossfang caveat stated as applying),
  W3 (contract narrowed goals 1, 4, 5 and cloud), W4 (two-embedder citation from a
  vendored copy), W5 (goal 5 vs capability inversion) and suggestions 1-3 applied.
- External multi-model adversarial review: not run; model preflight returned
  `degraded` with no providers configured, so the reviewer was the in-session
  artifact-critic, not a different model.

ASSESSMENT COMPLETE
