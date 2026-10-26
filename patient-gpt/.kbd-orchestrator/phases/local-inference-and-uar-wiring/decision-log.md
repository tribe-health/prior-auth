# Decision log — local-inference-and-uar-wiring

Append-only. Entries record analysis verdicts and who decides; operator decisions
stay open until the operator answers.

D-001 · Engine per device: mlex (macOS), llama-cpp-2 (Windows/Linux, if in scope), MLX-Swift via mlx-swift-lm (iOS), LiteRT-LM 0.18.1 (Android) [analyze · 2026-10-26]
- TL;DR: adopt the KnowMe engine split, upgraded to current releases.
- Why: each is the native engine for its device; the architecture rule forbids llama.cpp on mobile.
- Alternatives: candle as one CPU engine everywhere (reference); mistral.rs (rejected: stale crate, mobile bugs).
- Provenance: research. Status: analysis verdict; pins need operator approval in versions.toml.

D-002 · MLX cannot provide iOS simulator inference [analyze · 2026-10-26]
- TL;DR: vendor docs say the simulator lacks the Metal GPU family MLX needs.
- Why: mlx-swift `Documentation.docc/Articles/running-on-ios.md`; mlx-swift-examples #21.
- Alternatives: Mac (Designed for iPad) proxy; physical iPhone; candle CPU simulator lane.
- Provenance: research. Status: OPEN operator decision (evidence substitution).

D-003 · Chat model: Qwen3-0.6B default, Qwen3-1.7B on capable devices [analyze · 2026-10-26]
- TL;DR: only family verified in MLX, LiteRT-LM and GGUF under Apache-2.0 and ungated.
- Why: unattended first-run download; licence suitable for a healthcare practice product.
- Alternatives rejected: Gemma 3 (Prohibited Use Policy names healthcare/insurance decisions; gated); LFM2.5 (USD 10M revenue cap). Gemma 4 E2B kept as reference (size).
- Provenance: research. Status: OPEN operator confirmation.

D-004 · Embedder: fastembed 7.5.0 + ort 2.0.0-rc.15 with snowflake-arctic-embed-xs (384) [analyze · 2026-10-26]
- TL;DR: same size and dimension as MiniLM with better reported retrieval; ort ships simulator and emulator prebuilds.
- Alternatives: all-MiniLM-L6-v2 (KnowMe), bge-small-en-v1.5; EmbeddingGemma rejected (licence).
- Provenance: research. Status: OPEN operator confirmation (self-reported benchmark).

D-005 · Mobile vector store: SurrealDB embedded on RocksDB [analyze · 2026-10-26]
- TL;DR: one store engine on desktop and mobile, as KnowMe runs.
- Licence: Business Source License 1.1; use grant excludes offering it as a Database Service to third parties; converts to Apache-2.0 on 2030-01-01. App-internal use appears permitted; legal review recommended.
- Alternative: rusqlite 0.41.0 + sqlite-vec 0.1.9 (MIT/Apache-2.0).
- Provenance: research. Status: OPEN (versions.toml says the mobile store decision remains explicit).

D-006 · Sequencing: local floor first, UAR embedding spike before desktop topology [analyze · 2026-10-26]
- TL;DR: the floor does not depend on topology; iOS must embed UAR under goal 4, so the embedding cost is paid regardless; a build spike decides feasibility on stable Rust.
- Recommended topology if the spike passes: (c) PatientGPT host crate as desktop sidecar embedding UAR. If it fails: (b) uar-sidecar on desktop, local lane in-process, iOS goal 4 Blocked on UAR. (a) dominated by (c).
- Cost of (c): process supervision, localhost token handoff, per-target sidecar binaries, and a change to the in-process Tauri-command mirror rule.
- Provenance: research. Status: OPEN operator decision.

D-007 · Onboarding writes go through the host after user confirmation [analyze · 2026-10-26]
- TL;DR: the local model proposes setup steps; the trusted host executes them only after the user confirms.
- Why: capability inversion (agent kernels do not write); agent cannot affirm, sign or submit.
- Provenance: research (project rules). Status: OPEN operator decision.

D-008 · No Rust AG-UI crate; build a small AG-UI 1.0 → subset bridge [analyze · 2026-10-26]
- TL;DR: crates.io AG-UI crates are unofficial and low-health; a2ui-react 4.2.0 pins @ag-ui/core <0.1.0.
- Provenance: research. Status: analysis verdict.

## Revision 2 (2026-10-26, after independent review round 1)

D-006 is SUPERSEDED by D-009 (its "(a) dominated by (c)" verdict and the claim that (c) reuses the cloud host code were wrong). D-005 is amended by D-010. D-007 is amended by D-011.

D-009 · Desktop topology is a trade-off, decided after the UAR embedding spike [analyze · 2026-10-26]
- TL;DR: (a) in-process keeps the mirror rule, no crash isolation; (b) uar-sidecar avoids build coupling but gives UAR no local model and shares nothing with iOS; (c) host-crate sidecar gives isolation and matches the cloud host shape, at the cost of a process and a mirror-rule change.
- Why: floor and spike are topology-independent, so the choice can wait for the spike result.
- Provenance: research + review. Status: OPEN operator decision 3.

D-010 · SurrealDB on mobile departs from the architecture doctrine [analyze · 2026-10-26]
- TL;DR: doctrine names SQLite + sqlite-vec on iOS/Android (references/sync/doctrine.md:33); adopting SurrealDB needs operator approval and an ADR.
- Provenance: research. Status: OPEN operator decision 7.

D-011 · Onboarding runs single turns; no local agent loop [analyze · 2026-10-26]
- TL;DR: one message, one local reply, optional structured proposal executed by the host after user confirmation; the model never calls tools.
- Why: "no competing agent loop" — UAR owns agent execution.
- Provenance: project rules. Status: OPEN operator decision 8.

D-012 · Build a UAR HTTP service client and shared AG-UI routing layer (B9) [analyze · 2026-10-26]
- TL;DR: no Rust UAR client crate exists; the cloud half of goal 4 needs one; the routing layer is shared by cloud host, desktop host crate and iOS embedding.
- Provenance: research + review. Status: OPEN operator decision 13 (in this phase or deferred).

D-013 · Risk acceptance precondition for embedding UAR [analyze · 2026-10-26]
- TL;DR: embedding API is not a stability contract, mobile embedding is Experimental, nightly pin; no default.
- Provenance: assessment + review. Status: OPEN operator decision 12.

## Revision 3 (2026-10-26, after independent review round 2)

D-003 is amended: the rationale "only family in all three formats" was wrong (SmolLM2 and Gemma 4 E2B also are); the discriminators are size and stated tool use.

D-014 · UAR driver policy when embedded [analyze · 2026-10-26]
- TL;DR: proposed: local driver registered for the onboarding agent only; clinical runs refused without a BAA-covered cloud driver, enforced by the host tool admission port.
- Why: goal 5 excludes agentic clinical work on the local model; on iOS the local model would otherwise be the only UAR driver.
- Provenance: review round 2. Status: OPEN operator decision 14.

D-015 · Onboarding setup commands must be built (B10) [analyze · 2026-10-26]
- TL;DR: the frozen transport mirror has no setup writes; B10 builds them across HTTP/Tauri/FFI in the trusted host.
- Provenance: review round 2. Status: OPEN operator decision 15 (what onboarding sets up).

## Operator answers (2026-10-26, collected after analyze; recorded verbatim)

Answers are the option the operator selected, quoted exactly, with the question as asked. Each resolves the OPEN status of the entry named.

D-016 · Operator answers to the analysis open decisions [operator · 2026-10-26]
- Decision 1 (resolves D-002) — "Decision 1: MLX cannot run in the iOS simulator (vendor docs). How is iOS chat evidence produced?" → "Mac + iPhone (Recommended)"
- Decision 2 — "Decision 2: what does 'UAR absent' mean on iOS, and what is Android's UAR mode this phase?" → "Linked, unconfigured (Recommended)"
- Decision 5 (resolves D-003) — "Decision 5: which local chat model drives onboarding?" → "Qwen3 0.6B / 1.7B (Recommended)"
- Decision 8 (resolves D-011) — "Decision 8: how does onboarding run conversation turns, and how do its writes happen?" → "Single turns (Recommended)"
- Decision 12 (resolves D-013) — "Decision 12: do you accept the risk of embedding UAR? Its embedding API is not a stability contract, and mobile embedding is marked Experimental. The analysis offers no default." → "Accept the risk"
- Decision 13 (resolves D-012) — "Decision 13: is the cloud half of goal 4 (B9: UAR HTTP service client plus shared AG-UI routing layer) built this phase?" → "Build B9 now (Recommended)"
- Decision 14 (resolves D-014) — "Decision 14: when UAR is embedded, which model may drive its runs?" → "Onboarding agent only (Recommended)"
- Decision 15 (resolves D-015) — "Decision 15: what does onboarding set up (which host setup commands B10 builds)? The analysis offers no default; the two options below are my reading of goals 2 and 4, not analysis text. Use Other to name the steps." → "Models + UAR connection" (option text: choose and download the local chat model and embedder (goal 2), and record a UAR endpoint URL when one exists (goal 4))
- Decision 7 (resolves D-005, D-010) — "Decision 7: which mobile vector store? SurrealDB departs from the architecture doctrine (SQLite + sqlite-vec on iOS/Android) and is BSL 1.1 licensed." → "SurrealDB + ADR"
- Decision 10 — "Decision 10: which desktop operating systems are in scope this phase?" → "macOS only (Recommended)"
- Decision 11 — "Decision 11: engines run far slower in debug builds. May evidence runs use release-mode builds behind your tier gate?" → "Open for evidence only (Recommended)"
- Decisions 3, 4, 6, 9 (resolve D-009, D-004 and the analysis defaults for 4 and 9) — "Decisions 3, 4, 6, 9 have defaults: (3) desktop topology decided after the UAR spike; (4) nightly pin for UAR crates only if stable fails, recorded in versions.toml by you; (6) snowflake-arctic-embed-xs (384); (9) UAR tag v1.3.0 with every citation re-checked at the tag, and the A2UI catalog-id request filed with UAR. Accept all four?" → "Accept all four"
- Provenance: operator, via AskUserQuestion in the session that resumed from docs/plan/handoff-2026-10-26.md. Status: DECIDED. Readiness for Spec: no open operator decision remains; /kbd-spec runs only on operator instruction.
- Follow-ons the answers create for Spec (not decided here): an ADR for SurrealDB on mobile (decision 7); BSL 1.1 legal review stays recommended (D-005); any nightly pin under decision 4 and every new engine pin are listed for the operator to add to versions.toml.

## Spec stage (2026-10-26)

D-017 · Decisions taken while writing the change specs [spec · 2026-10-26]
- TL;DR: twelve OpenSpec changes; fifty scenarios; contract authored, not adopted. Full list in `spec.md` → "Decisions taken in Spec".
- Lanes: `local` and `uar` only, no default; UAR mode gains explicit `none` for "UAR absent"; `local` accepted only in the new `onboarding` scope.
- Catalog: pinned Hugging Face revisions and SHA-256 (model-acquisition design.md); int8 arctic-embed-xs on every platform; LiteRT `dynamic_wi4b32_afp32` files; RAM thresholds 8 GiB / 3 GiB.
- Two-embedder rule: separate vector spaces keyed by embedder id; no vector persistence or comparison code this phase.
- Mobile SurrealDB store backs conversations and settings (amends the storage-lane table).
- Onboarding: host-driven first prepare; proposals as one fenced `patientgpt-setup` block, stored host-side, confirmed by id; recorded UAR endpoint is not connected this phase.
- Embedded UAR: onboarding-only local driver checked in UAR and in the host; deny-by-default tool admission with an empty allowlist.
- Service mode routes only the onboarding scope; clinical scopes answer `agent_unavailable`.
- Desktop topology change is BLOCKED until decision 3 is recorded and the change is amended.
- `PATIENTGPT_DATA_DIR` override for scratch evidence roots.
- Provenance: spec. Status: for operator review at the Spec stage boundary.
- Flagged: decision 4's per-crate nightly wording is not achievable as stated (toolchain is per build); arctic-embed-xs licence evidence is the model card only; `docs/design` lacks onboarding screens.

D-018 · Operator answers to Spec review round 1 (recorded verbatim) [operator · 2026-10-26]
- Evidence host — "This machine is an Intel Xeon (x86_64) with only x86_64 Android images. MLX (macOS desktop chat), the iOS 'Designed for iPad' Mac destination and arm64 Android emulators cannot run on it, and ort has no prebuilt ONNX Runtime for Intel macOS or the Intel iOS simulator. LiteRT-LM 0.18.1 does ship x86_64. Which machine produces the phase's chat evidence?" → "Apple Silicon Mac (Recommended)"
- Operator follow-up message, verbatim: "Tell me when we need to do inference testing, and I will switch to the ARM macbook pro for this work."
- Mid-phase runs — "The UAR spike (20 in-process runs) and the onboarding feasibility check (20 Qwen3-0.6B generations) execute runtime behaviour mid-phase, before the end-of-phase test boundary. Allow them as design inputs?" → "Allow as design inputs (Recommended)"
- Decision 14 enforcement — "Decision 14 said the tool admission port enforces 'local driver for the onboarding agent only'. UAR v1.3.0 gives one driver per runtime and its requests carry no agent id, so admission cannot see it. The spec moves enforcement to (i) installing only the onboarding agent in a local-driver runtime and (ii) a host check on the agent id before start_run. Accept?" → "Accept the move (Recommended)"
- Consequence: tasks that run on-device inference are marked "Host: Apple Silicon" and the agent tells the operator before reaching them. D-014's enforcement point is amended (intent unchanged).

D-019 · Spec revisions after review round 2 [spec · 2026-10-26]
- TL;DR: fixes for 5 CRITICAL and 16 WARNING findings; not re-reviewed (stage maximum of two rounds).
- The onboarding screen's lane follows the host: `uar` when `model_status` reports UAR available, `local` otherwise; web against the cloud host in service mode sends `uar`.
- Tool admission: deny by default; UAR v1.3.0 returns a denial to the model and continues, so evidence is that nothing executed (no `tool_not_admitted` run error); the bridge logs tool, reasoning and step events instead of failing.
- UAR is an optional `embedded` feature (iOS FFI, the macOS evidence harness, desktop only under options a/c); `seed_defaults(false)`.
- Android ships `arm64-v8a` and `x86_64` (both in the LiteRT-LM AAR and ort); Android work and evidence can run on the Intel Mac's x86_64 AVD; Android boot accepts only UAR mode `none`.
- Desktop embedder gated to Apple Silicon; Intel desktop answers `engine_unavailable` (CHAT-8).
- `cancel_run` renamed `cancel_operation` (runs and prepares); `prepare_models` takes `skip | preflight | catalog id` per role; new `host_unsupported` code; refusal order lane → scope → engine → model.
- Cross-target compiler checks moved to one change-boundary batch per change (project Rust rule).
- Provenance: spec + review round 2. Status: for operator review at the Spec boundary.

D-020 · Delivery cadence is not active for this phase (operator, verbatim) [operator · 2026-10-26]
- Operator message during /kbd-plan, verbatim: "what is going on?  We should not be working in a cadence right now"
- Effect: the blocking constraint `visible-two-hour-delivery` (`.kbd-orchestrator/constraints.md`) and `docs/plan/patientgpt-delivery-cadence.md` are not applied to local-inference-and-uar-wiring. No two-hour increments, cut receipts or even-increment Tauri builds are planned. The constraint file itself is unchanged; this is a phase-scoped operator override.
- Resolves plan review round 1 finding C6 by operator instruction.
