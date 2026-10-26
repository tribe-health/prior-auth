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
