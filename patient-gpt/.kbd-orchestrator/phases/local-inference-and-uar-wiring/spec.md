# Spec — local-inference-and-uar-wiring

Date: 2026-10-26 · Backend: OpenSpec 1.15.0 (`openspec/changes/`) · Inputs:
`assessment.md`, `analysis.md`, `library-candidates.json`, operator answers D-016
and D-018. Acceptance contract:
`openspec/changes/phase-integration-evidence/verification.md` and
`adopted-contract.json` (authored, schema-valid, not adopted).

## Delta from the analysis

The analysis proposed ten build items (B1–B10) and a spike. Spec turned them into
twelve OpenSpec changes and 51 scenarios. These things changed on the way:

1. **A `none` UAR mode was added.** "UAR absent" had no representation: the mode
   is required and accepted only `deterministic` or `service`.
2. **A desktop data-directory override was added** so evidence runs use scratch
   roots instead of the real app data directory.
3. **Vector persistence was dropped from scope.** Nothing this phase reads stored
   vectors. The mobile store still lands: mobile conversations are in memory today
   and onboarding settings need a home.
4. **Onboarding starts with a host-driven prepare step**, because the model cannot
   propose its own download before it exists.
5. **Decision 15's UAR endpoint is recorded, not connected.**
6. **Review round 1 changed the contract** (details under Review record): a
   `cancel_operation` operation, a `CUSTOM` setup-proposal event, one shared lane
   parser, one owner for the onboarding prompt, the mobile UAR mode as a build
   define, decision 14 enforced at agent installation and the facade, and the
   bridge's version check split by service and in-process paths.
7. **Evidence host.** This machine is an Intel Xeon; on-device inference evidence
   runs on your Apple Silicon MacBook Pro (D-018).

## When to switch to the ARM MacBook Pro

Every task that runs on-device inference or needs arm64 targets is marked
**[Apple Silicon]** in its `tasks.md`. I stop and tell you before the first one.
In dependency order, the work splits like this:

| Stage of work | Machine |
|---|---|
| `inference-contract`; `model-acquisition` 1–4.1; `agui-bridge-and-uar-service` (including the cloud demo); `local-embedder-and-mobile-store` 1.3, 2.x, 3.x; `uar-embedding-spike` 1.x; `ios-local-chat` 1.1 and 2.1; `android-local-chat` (all: LiteRT-LM and ort ship x86_64 Android, so the Intel Mac's x86_64 AVD works); `local-onboarding` 1.1, 2.x, 3.x, 4.1 | Intel Mac (here) |
| **First switch:** `desktop-local-chat` (mlex is Apple-Silicon-only), then every other task marked **[Apple Silicon]**: the desktop embedder, the iOS simulator and Mac-destination work, the UAR spike build and run, embedded UAR, onboarding feasibility, and the change-boundary iOS build batches | ARM MacBook Pro |
| Final gate: desktop, iOS simulator and Mac-destination batches | ARM MacBook Pro |
| Final gate: cloud and desktop-intel batches | Intel Mac |
| Final gate: Android batch and physical-iPhone batch | either |

So the practical answer: stay here for the contract, model acquisition, the UAR
service client, Android chat on the x86_64 emulator and the onboarding host logic.
Switch when `desktop-local-chat` starts. I stop and tell you before the first
**[Apple Silicon]** task.

## Changes, in dependency order

| # | Change | Build items | Depends on | Owner roles | Scenarios |
|---|---|---|---|---|---|
| 1 | `inference-contract` | B4, part of B1 | — | rust-domain, tauri, flutter, react | LANE-1–6, CHAT-6, EMB-4, ACQ-6, PAR-1 |
| 2 | `model-acquisition` | B1 | 1 | rust-domain, tauri, flutter | ACQ-1–5 |
| 3 | `desktop-local-chat` | B2 (macOS) | 1, 2 | rust-domain, tauri | CHAT-1, CHAT-7, CHAT-8, PRIV-1 |
| 4 | `ios-local-chat` | B2 (iOS) | 1, 2, 3 | rust-domain, flutter | CHAT-2–4 |
| 5 | `android-local-chat` | B2 (Android) | 1, 2, 4 | rust-domain, flutter | CHAT-5 |
| 6 | `local-embedder-and-mobile-store` | B3, B8 | 1, 2 | rust-domain, storage, flutter, tauri, docs | EMB-1–3, EMB-5, STORE-1–2 |
| 7 | `uar-embedding-spike` | spike | 1, 2, 3 | uar-agent-expert, team-lead | SPIKE-1 (design input) |
| 8 | `agui-bridge-and-uar-service` | B6, B9 | 1, 2 (HTTP client pin) | uar-agent-expert, flint-data | UAR-1–3, UAR-10, BRIDGE-1 |
| 9 | `uar-embedded-runtime` | B5 | 7 (passed), 8, 4, 6 | uar-agent-expert, rust-domain, flutter | UAR-4–7, UAR-11 |
| 10 | `desktop-uar-topology` | decision 3 | 7, 8, 9 (options a/c) | team-lead, tauri, uar-agent-expert | UAR-8–9 |
| 11 | `local-onboarding` | B7, B10 | 1, 2, 3, 6, 8; 4/5 for mobile screens | design, creative, rust-domain, storage, react, flutter | ONB-1–9 |
| 12 | `phase-integration-evidence` | final gate | all | team-lead, platform-release, critics | runs all but SPIKE-1 |

Parallel work: after change 1, change 2 runs; change 8 starts once change 2 has pinned the HTTP client. After 2, changes
3 and 6 can. Change 4 follows 3, and 5 follows 4. Change 10 is BLOCKED until
decision 3 is recorded and the change is amended. Change 11's screens wait for the
design addition in its task 1.1.

Shared files are edited by more than one change and are serialized in change order:

| File | Edited by, in order (the plan's execution order) |
|---|---|
| workspace `Cargo.toml` | 2 → 3 → 5 → 6 → 9 |
| `crates/patient-gpt-ffi/Cargo.toml` | 1 → 2 → 4 → 5 → 6 → 9 |
| `desktop/src-tauri/src/lib.rs` | 2 → 3 → 6 → 11 → 10 (10 runs last: it waits on the spike and decision 3) |
| `desktop/src-tauri/src/commands.rs` | 1 → 11 → 10 |
| `crates/patient-gpt-server/src/routes.rs` | 1 → 11 |
| `crates/patient-gpt-ffi/src/api/patient_gpt.rs` | 1 → 4 → 5 → 11 |
| `crates/patient-gpt-ffi/src/host_state.rs` | 2 → 4 → 5 → 6 → 9 |
| `mobile/lib/bridge/` (generated) | 1 → 2 → 6 → 11 |
| HTTP, Tauri and FFI error mappings | 1 → 8 → 9 |
| `docs/plan/scaffold-contracts.md` | 1 → 8 → 6 → 9 → 11 |

Plan rounds run changes in this order, one change at a time on these files
(`plan.md` → Execution round order).

Delivery cadence: not active for this phase (operator, D-020).

## Decisions taken in Spec (for operator review)

Recorded as D-017 in `decision-log.md`. The ones most likely to need your eye:

- The `local` lane is accepted only in a new `onboarding` conversation scope.
- Catalog: MLX 4-bit Qwen3 for macOS and iOS, LiteRT `dynamic_wi4b32_afp32` for
  Android, arctic-embed-xs **int8** ONNX everywhere, each pinned to a Hugging Face
  revision and SHA-256 fetched on 2026-10-26.
- RAM thresholds: Qwen3-1.7B at 7 GiB or more (phones sold as 8 GB report less
  than 8 GiB), Qwen3-0.6B below, refusal below 3 GiB.
- Proposals travel as one fenced `patientgpt-setup` block that the host withholds
  from the stream, stores, and emits as a `CUSTOM` event; Confirm carries only the id.
- Onboarding keeps at most eight turns in memory for the app session; nothing of
  the transcript is persisted.
- Embedded UAR admits no tools this phase. Clinical command names in any allowlist
  stop start-up.
- In service mode only the onboarding scope routes to a UAR agent; clinical scopes
  answer `agent_unavailable`. Deterministic mode is unchanged.

## Pins to add to versions.toml (operator only)

Each is verified against its registry at the implementing task and listed in
`docs/plan/local-inference-pins.md` then. Proposed now:

| Item | Version | Source |
|---|---|---|
| `mlex` | 0.1.3 | crates.io |
| `fastembed` | 7.5.0 | crates.io |
| `ort` | =2.0.0-rc.15 | crates.io |
| `mlx-swift` / `mlx-swift-lm` | 0.32.3 / 3.32.3 | GitHub (SPM) |
| `com.google.ai.edge.litertlm:litertlm-android` | 0.18.1 | Google Maven |
| UAR | tag v1.3.0, commit `774469746fee4de99be41dc1cd231857067e4487` | Prometheus-AGS/universal-agent-runtime |
| HTTP client, `sha2`, `jni` | verified at task time | crates.io |
| Model artifacts | five catalog entries | `openspec/changes/model-acquisition/design.md` |

## Flags for the operator

- **Decision 4's wording may not be achievable.** A Rust toolchain applies to the
  whole build that links UAR, not to UAR's crates alone. The spike reports this.
- **The embedder's licence is only in its model card** (Apache-2 at the pinned
  revision; no licence tag or LICENSE file).
- **`docs/design` has no onboarding or model-progress screen.** Change 11 adds them
  through the design-authority process and your approval before any UI code.
- **The architecture checkout is missing on this machine.** Doctrine citations
  are carried from the analysis, not re-read.

## Review record

- Sycophancy screen on this summary: score 0.0, no patterns
  (`sycophancy/spec-2026-10-26T13-22-02Z.json`).
- External multi-model review: not run. The gateway on port 4000 requires a key
  and the model preflight records no providers, so the reviewer was the in-session
  `artifact-critic` with fresh context.
- Round 1: "cannot stand", 4 CRITICAL, 8 WARNING, 1 SUGGESTION group. Addressed:
  C1 evidence host (operator answer D-018, tasks marked); C2 proposals now reach the
  shell as a `CUSTOM` event with stream withholding; C3 decision 14 enforced at
  agent installation and the facade (accepted in D-018); C4 version check split by
  path; W5 shared raw-lane parser; W6 `cancel_operation`; W7 dependencies, file order and
  Impact lists corrected; W8 one prompt owner; W9 mobile mode via build define;
  W10 missing scenarios added or listed as limitations; W11 oracles tightened
  (WebKit networking process, local listener, ABI guard, `.part` rule); W12 audit
  command replaced, transcript held in memory, cadence handed to Plan, mid-phase
  runs allowed by D-018; S13 thresholds, boundary column, invalidation keys, ADR
  name and code statuses.
- Round 2 (fresh `artifact-critic`): "cannot stand", 5 CRITICAL, 16 WARNING,
  6 SUGGESTION. Two rounds is the stage maximum, so the fixes below were not
  re-reviewed. Addressed: C1 the onboarding screen's lane now follows the host
  (`uar` when UAR is configured), giving the UAR scenarios a product entry; C2 tool
  calls are admission's decision and UAR continues after a denial, so the evidence
  is that nothing executed, and the bridge logs tool events instead of failing;
  C3 UAR is a feature-gated dependency, so the desktop harness exists under every
  topology; C4 the Android check is a debug `flutter run`, not an APK build; C5
  Android ships both ABIs and can run on the Intel Mac's x86_64 AVD. Also fixed:
  W1 desktop embedder gated to Apple Silicon (Intel answers `engine_unavailable`,
  now CHAT-8); W2 scenarios added or listed as limitations; W3 oracles tightened;
  W4 desktop gate launches the built bundle; W5 shared-file table completed and
  run callers named; W6 one base prompt, verified equal in the agent file; W7
  `seed_defaults(false)`; W8 per-role prepare and `cancel_operation`; W9
  `SetupProgressEvent`; W10 cancel on the `uar` lane defined; W11 cross-target
  checks moved to change-boundary batches; W12 Android accepts only mode `none`;
  W13 STORE-1 destinations; W14 native code named; W15 host markings corrected;
  W16 `host_unsupported`; S1 `reqwest` pin match; S2 numbering; S4 mlex risk; S5
  reasoning events.

## Unresolved review findings

- The round-2 fixes above have had no independent review (stage maximum reached).
- S3: `start_run` stores the first 60 characters of a message as the conversation
  title (`crates/patient-gpt-host/src/services.rs:78-87`). Onboarding titles are
  therefore persisted; message bodies are not.
- S6: Intel macOS could keep the embedder through `ort-tract`, as UAR does. Not
  adopted: decision 10 scopes desktop to macOS, and D-018 puts desktop evidence on
  Apple Silicon.
- The `driver_not_permitted` and tool-admission guards (UAR-5, UAR-6) are reachable
  only through an evidence harness; the shipped app cannot trigger them this phase.
- iOS chat (CHAT-2, CHAT-3) and Android emulator chat (CHAT-5) remain untried
  anywhere; they may end Blocked with every change implemented.

## The uncomfortable thing

Two of the three mobile chat proofs depend on things nobody has seen work:
MLX-Swift has produced no iOS reply in KnowMe or anywhere else we checked, and
LiteRT-LM on any emulator is untried. If either fails, goal 1's mobile floor,
your stated priority, ends Blocked for that platform even though every change is
implemented. CHAT-2, CHAT-3 and CHAT-5 carry their own verdicts, so the likely
embedding passes cannot hide that. And none of it can be observed on this Intel
machine: until you switch, every inference claim stays Build-only.
