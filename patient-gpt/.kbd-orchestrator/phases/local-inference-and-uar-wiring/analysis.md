# Analysis — local-inference-and-uar-wiring

Project: PatientGPT · Date: 2026-10-26 · Mode: **stack specified** (Rust core,
Tauri 2 desktop, Flutter + flutter_rust_bridge mobile, Axum cloud host).
Inputs: `assessment.md`, `handoffs/assess.handoff.json`, four research passes
(engines, models/licences, UAR consumption, mobile storage). Machine contract:
`library-candidates.json`. Decisions: `decision-log.md`. Revision 2 after an
independent review (see "Review record").

## Lessons and knowledge gaps

- "External integrations require at least one real-service test" — every engine
  and UAR verdict below rests on docs, registry or source reading. Nothing was
  compiled or run. Each adopt verdict carries a spike or first-run check.
- "Ask once at phase boundary for operator-only actions" (applied by analogy) —
  `versions.toml` pins, tier-gate use and cross-repo UAR changes are listed as
  operator decisions below. None was taken.
- Knowledge gaps from prior-context.md: none recorded.

## Research budget

The cap was 8 queries per tier and 20 minutes per pass. It was not held. The
engine pass ran 16 Tier-1 GitHub searches. The UAR pass ran 23 local repository
reads in Tier 1. The model pass made about 60 Hugging Face API requests, counted
as 7 batches. Tier-4 web use was 6 calls. Every finding is cited, but the
operator should weigh the analysis knowing the budget was exceeded.

## Landscape: what exists to adopt

### Chat engines (architecture rule: engine per device, lane per turn)

| Target | Candidate | Latest | Verdict | Why |
|---|---|---|---|---|
| macOS desktop | `mlex` (statically links mlx-c) | 0.1.3 (2026-07-06), MIT | **adopt** | In KnowMe use; official mlx-c underneath; macOS Apple Silicon only |
| Windows/Linux desktop | `llama-cpp-2` | 0.1.160 (2026-10-15), MIT/Apache-2.0 | **adopt if in scope** | KnowMe on 0.1.151; GGUF. Scope is open decision 10 |
| iOS device | `mlx-swift` 0.32.3 + `mlx-swift-lm` 3.32.3 (2026-09-30), MIT | — | **adopt** | KnowMe's `mlx-swift-examples` 2.29.1 is a year stale; the LLM libraries moved to `mlx-swift-lm` |
| iOS simulator | MLX | — | **reject for inference** | mlx-swift docs: "It isn't possible to use the iOS simulator for developing MLX applications" (`Documentation.docc/Articles/running-on-ios.md`). The vendor suggests the "Mac (Designed for iPad)" destination |
| Android device / emulator | LiteRT-LM AAR `com.google.ai.edge.litertlm:litertlm-android` | 0.18.1 (2026-10-20), Apache-2.0, Google Maven | **adopt** | KnowMe on 0.14.0. Maintainer says non-CPU backends are not recommended on emulators (LiteRT-LM #1448). CPU on the arm64 emulator is plausible and unverified |
| Cross-target CPU | `candle` 0.11.0 (pure Rust) | MIT/Apache-2.0 | **reference** | The only plausible single engine for simulator chat. Issue #2823 (Android emulator via frb) is closed; Android support is not confirmed. Its build cost is partly paid already if UAR is embedded (see "Two embedders") |
| Cross-target | `mistralrs` | crates.io 0.8.1 vs GitHub 0.9.5 | **reject** | Stale crate; open iOS/Android correctness bugs (#1590, #1903, #1934) |

### Chat model (onboarding only)

Sizes are the files the research pass measured: MLX 4-bit, LiteRT-LM
`.litertlm`, and one GGUF file. The GGUF quantization behind the 397 MB and
1107 MB figures was not recorded. Smaller GGUF quantizations exist (the reviewer
reports an IQ1_S file of about 214 MB for Qwen3-0.6B; not checked here). The quantization is pinned in the
model catalog during Spec, with the same file's SHA-256.

| Model | MLX / LiteRT-LM / GGUF (MB) | Licence | Gated | Verdict |
|---|---|---|---|---|
| **Qwen3-0.6B** | 335 / 345 / 397 | Apache-2.0 | No | **adopt as default** — smallest Apache-2.0, ungated family in all three formats with tool calling stated (SmolLM2's tool use is unverified; Gemma 4 E2B is too large); 32K context. Fitness for structured setup proposals is unmeasured |
| Qwen3-1.7B | 968 / 977 / 1107 | Apache-2.0 | No | **adopt for capable devices** (selected by RAM preflight) |
| Gemma 4 E2B | 3551 / 2008–2588 / 3107 | Apache-2.0 | No | reference — too large for onboarding |
| Gemma 3 1B / 270M | — | Gemma Terms + Prohibited Use Policy | yes | **reject** — the policy lists automated decisions in healthcare and insurance, and unlicensed medical practice; gated downloads block an unattended first run |
| LFM2.5-350M | 377 / 248 / 229 | LFM Open License 1.0 | No | **reject** — commercial use capped at USD 10M annual revenue |
| SmolLM2-360M | 724 / 374 / 386 | Apache-2.0 | No | reference — tool use unverified |

### Embedder

| Candidate | Dims | Size | Licence | fastembed | Verdict |
|---|---|---|---|---|---|
| **snowflake-arctic-embed-xs** | 384 | 90 MB fp32 / 23 MB int8 ONNX | Apache-2.0 | yes | **adopt** — same size and dimension as MiniLM; higher self-reported retrieval score (50.15 vs 41.95, Snowflake model card) |
| all-MiniLM-L6-v2 | 384 | 90 / 23 MB | Apache-2.0 | yes | reference — KnowMe's choice; fallback |
| bge-small-en-v1.5 | 384 | 133 MB | MIT | yes | reference |
| EmbeddingGemma-300M | 768 | ~197 MB q4 | Gemma Terms + policy | yes | reject — licence, as Gemma 3 |
| EmbeddingGemma-2 (text 270M) | 768 | 165 MB `.litertlm` | Apache-2.0 | no | reference — no ONNX, not in fastembed |

Runtime: **`fastembed` 7.5.0 + `ort` =2.0.0-rc.15** (adapt). ort ships prebuilt
ONNX Runtime 1.31.0 for `aarch64-apple-ios`, `aarch64-apple-ios-sim`,
`aarch64-linux-android` and `x86_64-linux-android`
(`ort-sys/build/download/dist.tsv`). Disable fastembed's default features and
re-enable `ort-download-binaries-rustls-tls`, as KnowMe does
(`rust/Cargo.toml:122`); without it ort has no runtime to link. Unlike KnowMe,
do not enable `hf-hub-rustls-tls`. Load model files
from the app's own verified catalog, never from hf-hub at run time.

Supply chain: that feature makes the build download ONNX Runtime from
`cdn.pyke.io`. The archives are hash-pinned in `dist.tsv`, but it is a network
fetch at build time and an offline or air-gapped build fails. Spec records it and
names the alternative (a vendored ONNX Runtime with `ORT_LIB_LOCATION`).

Other risks: ort release-candidate breakage history (#545, #514); the
`tokenizers` `onig` C build in iOS and Android cross-compiles is unverified.

### Two embedders when UAR is embedded

UAR `origin/main` makes `surreal-memory` mandatory with `local-embeddings`, which
pulls candle 0.9.2 (`Cargo.toml:455-461`; a comment there says Cargo resolves it
alongside UAR's own candle 0.11.0). Any shell that embeds UAR therefore carries a
candle embedder in addition to fastembed. Consequences: larger mobile binaries,
two embedding models unless they are made to agree, and a smaller extra cost for
the candle chat lane (cand-005) than "a fifth engine" suggested. Spec must decide
whether PatientGPT embeddings and UAR memory embeddings share one model and one
vector space. Until it does, a vector from one may not be compared with a vector
from the other.

### Vector storage

- Desktop: SurrealDB 3.3.0 (already in the workspace) with HNSW, as KnowMe runs.
  `versions.toml:25` names SurrealDB as the desktop target. The doctrine names
  pglite-oxide/pgvector on desktop (`doctrine.md:31`); `docs/plan/scaffold-plan.md`
  records that difference as open for the operator.
- Mobile: no store today. KnowMe runs embedded SurrealDB on RocksDB on iOS and
  Android (`gen_ui_ffi/src/api/boot.rs:200`). Alternative: `rusqlite` 0.41.0 +
  `sqlite-vec` 0.1.9 (MIT/Apache-2.0).
- Verdict: **adopt SurrealDB embedded on mobile**, for one store engine across
  desktop and mobile. This **departs from the hybrid-mobile-architecture
  standard**, which names SQLite with sqlite-vec for iOS and Android
  (`references/sync/doctrine.md:33`, `references/sync/client-rag.md:13`). The
  same doctrine allows SurrealDB as a derived graph/RAG index (`doctrine.md:38`),
  but not as the primary mobile store. The departure needs
  the operator's approval and an ADR; `versions.toml` already says the mobile
  store decision stays explicit.
- Licence: SurrealDB 3.x is **Business Source License 1.1**. The additional use
  grant permits use except as a "Database Service" offered to third parties; it
  converts to Apache-2.0 on 2030-01-01 (crate `LICENSE`). Embedded, app-internal
  use appears permitted. Legal review is recommended.

### Model acquisition

**Adapt** KnowMe's pattern (`gen_ui_inference`): pinned catalog (repository,
revision, bytes, SHA-256), `.part` files resumed with Range requests, streamed
verification, atomic rename, RAM preflight before download with a downgrade path,
and a `ModelOperationState` progress stream. Do not copy: `qwen3.5-*` ids that
hold Qwen3 weights, the legacy 9B GGUF iOS default, unpinned fastembed weights,
and model files in iOS Documents without backup exclusion.

### UAR consumption

Version facts, read from the UAR repository on 2026-10-26: tag **v1.3.0** exists
(2026-10-24, commit 77446974). `origin/main` (7ee9bf31) is ahead of the tag. The
CHANGELOG on main still reads "1.3.0 — unreleased (verification pending)". The
local checkout is branch `codex/uar-1-1-1-implementation` at 1.1.1. The
statements below were read from `origin/main`; at the tag only the
`surreal-memory` lines were re-checked (`git diff --stat v1.3.0 origin/main`: 16
files, +752/−5).

- UAR has **no local engine**. Embedding requires a host `LlmDriver` /
  `ExternalLlmDriver` (`src/llm/mod.rs:384-405`, `src/llm/external_driver.rs`),
  registered by `EmbeddedRuntimeBuilder::local_provider` (`src/embedded.rs:315`).
- In-process AG-UI is supported (ADR 0012): `run_manager().start_run` →
  `subscribe` → `adapters::to_agui_spec_event` + `enrich_agui_spec_payload`. The
  host must synthesize TEXT_MESSAGE_START/END; only the server loop does
  (`src/server.rs:7063-7125`). A start/subscribe race is unverified.
- Embedding puts UAR's build inside PatientGPT's: a nightly toolchain pin (UAR's
  own source has no `#![feature]`, so stable is plausible and unverified), a
  `[patch.crates-io]` SurrealDB overlay that Cargo applies only from the root
  workspace (it would also replace PatientGPT's own desktop `surrealdb` 3.3.0),
  11 vendored path dependencies, and mandatory `surreal-memory`.
- Embedded UAR refuses to build without four host components: a persistence
  layer, an explicit governance engine, an explicit tool admission port, and a
  driver (`src/embedded.rs:493-595`). B5 supplies all four.
- The sidecar (`uar-sidecar`) keeps all of that out of PatientGPT's build. It
  cannot take a host-supplied driver, so UAR in the sidecar has no local model,
  and it cannot run on iOS.
- A2UI catalog ids are hard-coded `pub(crate)`; an app catalog id needs a UAR change.
- AG-UI: UAR requires `protocolVersion "1.0"`. Web is on `@ag-ui/core` 0.0.59
  because `@prometheus-ags/a2ui-react` 4.2.0 (latest) peers `<0.1.0`. A
  field-level bridge for PatientGPT's subset looks small; unverified.
- No Rust UAR HTTP client crate exists. The cloud host needs one (B9).

## Who owns the agent loop

The project rule is "no competing application agent loop": UAR owns agent
execution. With UAR absent, the onboarding floor still has to run conversation
turns, so the rule has to be applied, not assumed.

Reading taken by this analysis, for the operator to confirm (decision 8): the
floor runs **single turns, never a loop**. One user message produces one local
model reply. A reply may contain a structured setup proposal. The host shows it,
and only after the user confirms does the trusted host execute it through a host
setup command. Those commands do not exist yet: the frozen transport mirror
(`docs/plan/scaffold-contracts.md:10-17`) has six read and run operations and no
setup writes. They are built in this phase (B10), and what they configure is
decision 15. The model never calls a tool, never sees a tool
result and never takes a second step on its own. That is a chat completion, and
it does not compete with UAR.

The other reading is a small local loop (model → tool → model). It would be a
second agent loop, contrary to the rule, and it would need the operator to waive
the rule for onboarding. This analysis does not recommend it.

Under either reading the agent cannot affirm, sign, submit or record outcomes,
and onboarding touches no clinical record.

### Which model drives UAR runs

The single-turn rule above covers the floor only. Once UAR is embedded (B5), UAR
runs agent loops with tool calls, and the driver registered with
`local_provider` is whatever the host supplies. On iOS, and on desktop under (a)
or (c), the only driver available with no cloud configured is the local Qwen3
model. That would make the local model drive agent loops, which goal 5 excludes
("not used for agentic clinical work").

This analysis proposes, for decision 14: the local driver is registered for the
onboarding agent only. Clinical agents require a BAA-covered cloud driver, and
UAR refuses to start a clinical run when only the local driver is present. The
host's tool admission port (B5) enforces it. The operator may instead choose to
not register the local driver with UAR at all in this phase.

## Build-vs-adopt calls and readiness effect

| # | Need | Call | Contract section satisfied | Needs new runtime code |
|---|---|---|---|---|
| B1 | `patient-gpt-inference` crate: `InferenceProvider`, `Lane` enum (no default arm), catalog, downloader, RAM preflight, progress | **build, adapting KnowMe** | G1, G2 | yes |
| B2 | Engines per device (mlex, llama-cpp-2, MLX-Swift bridge, LiteRT-LM JNI bridge) | **adopt** libraries, **build** bridges | G1, G2 | yes |
| B3 | Embedder (fastembed + arctic-embed-xs) and embed port | **adapt** | G1, G2, G6 | yes |
| B4 | Host port + transport mirror: lane on `RunRequest`, model status/progress, prepare, embed — HTTP, Tauri and FFI together | **build** (contract change) | G1, G5 | yes |
| B5 | UAR embedded facade: `ExternalLlmDriver`, persistence layer, governance engine, tool admission port (agent cannot affirm, sign or submit; clinical runs refused on the local driver), in-process AG-UI | **adopt UAR**, **build** facade and host components | G3, G4, G5 | yes, after spike |
| B6 | AG-UI 1.0 → PatientGPT subset bridge | **build** (small) | G3, G4 | yes |
| B7 | Onboarding flow: single turns; model proposes, host executes on user confirmation | **build** | G5 | yes; design gated by decision 8 |
| B8 | Mobile store (SurrealDB embedded) | **adopt** | G1 (mobile embeddings) | yes; gated by decision 7 |
| B10 | Host setup commands for onboarding, mirrored across HTTP, Tauri and FFI, executed by the trusted host after user confirmation | **build** | G5 | yes; scope is decision 15 |
| B9 | UAR HTTP service client for the cloud host, plus the shared AG-UI routing layer (UAR vs host-local handlers) used by the cloud host, the desktop host crate and the iOS embedding | **build** | G3, G4 (cloud half) | yes |

Every call needs new runtime code; no goal is reachable by configuration.

## Desktop topology: trade-offs (operator decision 3)

| | (a) UAR in the Tauri process | (b) `uar-sidecar` | (c) PatientGPT host crate as sidecar, embedding UAR |
|---|---|---|---|
| Build coupling to UAR | full (in Tauri crate) | none | full (in host crate) |
| UAR can use the local model driver (limits: decision 14) | yes | no | yes |
| Shares code with iOS embedding | yes | no | yes |
| Shares routing with the cloud host | routing in-process; same B9 layer | no | same B9 layer, closest in shape to cloud |
| Crash isolation from the window | none | yes | yes |
| Transport mirror rule (Tauri commands mirror HTTP routes in-process) | kept | kept for host routes | changed: the webview talks HTTP to the sidecar |
| Extra machinery | none | sidecar supervision, token handoff | sidecar supervision, localhost token handoff, per-target sidecar binaries |

(a) is the simplest to run and keeps the mirror rule; it gives up crash
isolation. (c) gives isolation and the closest match to the cloud host; it costs
a process and a rule change. (b) avoids build coupling; it leaves UAR without a
local model on desktop and shares nothing with iOS.

The floor (B1–B4, B8) is topology-independent, and the UAR embedding spike
(below) is needed for iOS whatever the desktop choice. So the topology can be
decided after the spike without delaying either.

## Recommended sequencing (the operator decides)

1. **Floor first.** B1–B4 and B8 live in the shared host and run in-process on
   every shell (Tauri commands, FFI, Axum) with UAR absent. The lane is explicit
   (`local`), never a fallback.
2. **UAR embedding spike.** Prove in the PatientGPT workspace, on stable Rust:
   UAR `embedded-mobile` + `ExternalLlmDriver` over B1, the SurrealDB patch set,
   and one in-process AG-UI run. iOS must embed under goal 4, so the cost is paid
   regardless of the desktop choice.
3. **Topology, then B5/B6/B9.** Chosen from the table above with the spike's
   result in hand. If the spike fails, (b) is the only desktop option that needs
   no embedding, and iOS goal 4 becomes Blocked on UAR.

## Evidence plan feasibility

Goal 6 asks for streamed local replies and embeddings with UAR absent on desktop,
iOS simulator and Android emulator, and the UAR path shown separately once
configured.

| Evidence | Feasibility |
|---|---|
| Desktop (macOS) chat + embedding, UAR absent | achievable |
| Desktop Windows/Linux | depends on decision 10 |
| iOS simulator chat | **not achievable with MLX** (vendor docs). Options: run on the "Mac (Designed for iPad)" destination, run on a physical iPhone, or add a candle CPU lane for the simulator (decision 1). Results are recorded under the destination actually used, in the project's four words |
| iOS simulator embedding | plausible (ort simulator prebuilds) |
| Android emulator chat | plausible on LiteRT CPU, arm64 emulator; first spike checks it |
| Android emulator embedding | plausible (ort prebuilds) |
| Goal 2: acquisition, integrity and runtime selection | achievable on every target. Evidence comes through the app's own download path (assessment lesson: installer evidence must exercise the installer's dispatch), including a corrupted-file run that the integrity check rejects |
| Goal 5: onboarding proposals | unknown. A 0.6B model's ability to produce valid structured setup proposals is unmeasured; Spec includes a feasibility spike before B7 |
| UAR path, shown separately | desktop: after the spike and topology choice; iOS: after the spike; cloud: needs a running UAR service and B9. Each is its own run, never folded into the UAR-absent evidence |

## Assessment risks: disposition

| Risk from the assessment | Disposition |
|---|---|
| Texas TRAIGA / compliance of AI in a healthcare product | Carried to Spec as a review item. Onboarding uses no PHI and makes no clinical decision; Spec states that boundary and records it for legal review. Not resolved here |
| Privacy class of mobile embeddings | Embeddings of local data are local (project rule). Spec assigns the `local` privacy class to every vector store record, including UAR's own surreal-memory store when UAR is embedded; the sync boundary refuses them |
| No team owner for inference work | Carried to Plan: the `patientgpt-delivery` team has rust-domain-engineer, flutter-engineer, tauri-engineer and uar-agent-expert; Plan assigns ownership |
| Debug-build speed and the tier gate | Engines run far slower in debug builds. Evidence runs need release-mode engine crates or a release build, which is behind the operator's tier gate. Open: decision 11 |
| Mobile binary size and RAM | RAM preflight (B1) selects the model. Binary size grows with fastembed, ort and, if UAR is embedded, candle and SurrealDB; Spec sets a size budget and the first spike measures it |
| Two embedders when UAR is embedded | See "Two embedders"; Spec decides shared or separate vector spaces |

## Open decisions (operator decisions; none taken here)

| # | Decision | Default proposed by this analysis |
|---|---|---|
| 1 | iOS simulator chat evidence | "Mac (Designed for iPad)" run plus physical iPhone; no candle lane |
| 2 | "UAR absent" on iOS (not linked / linked but unconfigured / deterministic stub) and Android's UAR mode | iOS: UAR linked, no provider configured, local lane only; Android: no UAR in this phase, local lane only |
| 3 | Desktop topology | decide after the spike, from the trade-off table |
| 4 | Toolchain if UAR does not build on stable | accept the nightly pin for the UAR crates only, recorded in `versions.toml` |
| 5 | Chat model | Qwen3-0.6B default, Qwen3-1.7B on capable devices |
| 6 | Embedder | snowflake-arctic-embed-xs (384) |
| 7 | Mobile store | SurrealDB embedded, with an ADR for the departure from sqlite-vec |
| 8 | Onboarding loop and writes | single turns; host executes proposals after user confirmation |
| 9 | UAR version target (including whether a tag whose CHANGELOG still says "verification pending" is acceptable) and the A2UI catalog-id change request | tag v1.3.0, re-checking every citation at the tag; file the catalog-id request with UAR |
| 10 | Desktop OS scope | macOS only this phase |
| 11 | Release-mode builds for evidence runs (tier gate) | operator opens the gate for evidence runs only |
| 12 | Risk acceptance for embedding UAR: the embedding API is not a stability contract, and mobile embedding is marked Experimental (the toolchain is decision 4) | no default; the operator accepts or rejects |
| 13 | Cloud scope this phase: is B9 (UAR service client) built now, or is the cloud half of goal 4 deferred | build B9 now against a local UAR service |
| 14 | Which model drives UAR runs when UAR is embedded | local driver for the onboarding agent only; clinical runs refused without a BAA-covered cloud driver |
| 15 | What onboarding sets up ("the decentralized deployment"): which setup commands B10 builds | no default; the operator names the setup steps |

## Readiness

**BLOCKED** for Spec. Minimal missing items:

- Decisions **1, 2, 5, 8, 12, 13, 14, 15**: each changes which changes are
  written (simulator lane, whether mobile links UAR, catalog entries, onboarding
  design, whether UAR embedding is written at all, cloud scope, UAR driver
  policy, setup commands).
- Decisions **7, 10, 11** cannot be spec assumptions: 7 departs from the doctrine
  and needs an ADR, 10 narrows goal 1's desktop scope, 11 is an operator-only
  tier-gate action without which goal 6's evidence may not be producible.
- Decisions **3, 4, 6, 9** have defaults above. One operator answer accepting
  those defaults is enough; otherwise they are decided individually. Decision 3
  can wait for the spike either way.

## Review record

Round 1 (independent `artifact-critic`, artifact only): "cannot stand", 2
CRITICAL, 7 WARNING, 4 SUGGESTION. Revision 2 addressed all of them.

Round 2 (independent `artifact-critic`): "cannot stand", 2 CRITICAL, 9 WARNING, 4
SUGGESTION. Most cited facts were confirmed against the sources. Revision 3
addressed: setup commands (B10, decision 15), UAR driver policy (decision 14),
UAR host components in B5, operator-gated verdicts in `library-candidates.json`,
the chat-model rationale, the decision 4/12 overlap, the readiness split,
evidence rows for goals 2 and 5, UAR memory in the privacy disposition, tag
versus main citations, the KnowMe `hf-hub` difference, the desktop doctrine note,
the patch overlay effect and the sidecar verdict. Two review rounds is the stage
maximum, so revision 3 was not re-reviewed.

## Unresolved review findings

- **C1 / C2 (round 2) are scoped, not resolved.** The setup write path and the
  rule for which model drives UAR are now named build items and open decisions
  (14, 15), but neither is designed. Spec cannot start until the operator answers
  them.
- Revision 3 itself has had no independent review.
- `library-candidates.json` has no "pending" verdict value in its schema; operator
  gating is carried as an `OPERATOR-GATED (decision N)` prefix in
  `decision_rationale`. A consumer that reads only `verdict` will miss it.
