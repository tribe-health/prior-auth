PLAN: local-inference-and-uar-wiring
Project: PatientGPT
Date: 2026-10-26
OpenSpec available: YES (1.15.0, managed runner; the twelve changes were created in Spec)
Changes to implement: 12

# Plan — local-inference-and-uar-wiring

## Delta from Spec

Spec ordered the changes by dependency. The plan keeps that order and the change
set unchanged, and adds three things Spec did not decide:

1. **Task-level scheduling across two machines.** Changes 4, 6, 7, 11 and 12 span
   both machines, so the waves below schedule tasks, not whole changes. All
   Intel-runnable tasks come first, so you switch to the ARM MacBook Pro once.
2. **One relaxed dependency.** `android-local-chat` needs only `ios-local-chat` task
   1.1 (the shared Rust engine-bridge adapter), not the whole iOS change, so Android
   chat can finish on the Intel Mac's x86_64 emulator before the switch.
3. **Delivery cadence mapped to the tier guard.** The project hook blocks `tauri
   build` during implementation, so the "full Tauri build" of each even increment
   is a debug `cargo build -p patient-gpt-desktop` plus a debug launch, as the
   scaffold phase did. A bundled Tauri build happens only in the evidence batch,
   behind your tier gate.

## Lessons applied

The `plan:before` recall returned no lessons this time. The lessons recorded in
`assessment.md` still bind this plan:

- **External integrations need one real-service run:** every UAR, Hugging Face and
  engine claim stays unverified until the final gate observes it; the spike and the
  onboarding feasibility run are design inputs only (D-018).
- **Installer behaviour is tested through installer dispatch:** acquisition evidence
  comes from the app's own prepare path (ACQ-1–6), never a downloader unit call.
- **Evidence goes in a new dated folder with a README:** the boundary packet writes
  `evidence/<date>-final-gate/` and never mutates earlier receipts.
- **Ask once at the boundary for operator-only actions:** the approvals list below is
  asked once per gate, not per task.
- **Boundary gates launch the packaged artifact:** the desktop batch builds and
  launches the bundle, not the dev server (verification.md, final local gate).

## CHANGE LIST (ordered)

1. inference-contract: see `openspec/changes/inference-contract/proposal.md`
   - Scope: all (domain, host, server, Tauri, FFI, web, Flutter, docs)
   - Depends on: NONE
   - Recommended agent: Claude Code root agent with patientgpt-delivery native roles (per-task routes below)
   - Est. complexity: L (about 6 active agent hours)
   - Complexity score: High
   - Model class: frontier (project role policy: tier hard, tools)
   - Customer value: HIGH
   - Details: Freezes lanes, the onboarding scope, model and embed operations, cancellation, the setup-proposal event and the prompt builder. Every other change builds on it; refusals ship before adapters.

2. model-acquisition: see `openspec/changes/model-acquisition/proposal.md`
   - Scope: inference crate, desktop boot, FFI boot, iOS/Android platform paths
   - Depends on: inference-contract
   - Recommended agent: Claude Code root agent with patientgpt-delivery native roles (per-task routes below)
   - Est. complexity: L (about 6 active agent hours)
   - Complexity score: High
   - Model class: frontier (project role policy: tier hard, tools)
   - Customer value: HIGH
   - Details: Pinned catalog with verified, resumable downloads and RAM preflight; reuses KnowMe's pattern (adapt).

3. desktop-local-chat: see `openspec/changes/desktop-local-chat/proposal.md`
   - Scope: inference crate (mlex), desktop boot
   - Depends on: inference-contract, model-acquisition
   - Recommended agent: Claude Code root agent with patientgpt-delivery native roles (per-task routes below)
   - Est. complexity: M (about 3 active agent hours)
   - Complexity score: Medium
   - Model class: frontier (project role policy: tier hard, tools)
   - Customer value: HIGH
   - Details: First on-device reply on macOS. library: cand-001 (mlex, adopt).

4. ios-local-chat: see `openspec/changes/ios-local-chat/proposal.md`
   - Scope: FFI C table, Swift engine, Runner, inference crate
   - Depends on: inference-contract, model-acquisition (task 1.1 of this change only needs the contract)
   - Recommended agent: Claude Code root agent with patientgpt-delivery native roles (per-task routes below)
   - Est. complexity: L (about 6 active agent hours)
   - Complexity score: High
   - Model class: frontier (project role policy: tier hard, tools)
   - Customer value: HIGH
   - Details: MLX-Swift engine behind a C table; simulator refusal. library: cand-003 (mlx-swift + mlx-swift-lm, adopt).

5. android-local-chat: see `openspec/changes/android-local-chat/proposal.md`
   - Scope: JNI, Kotlin engine, Gradle
   - Depends on: inference-contract, model-acquisition, ios-local-chat:1.1 (shared engine-bridge adapter)
   - Recommended agent: Claude Code root agent with patientgpt-delivery native roles (per-task routes below)
   - Est. complexity: M (about 5 active agent hours)
   - Complexity score: Medium
   - Model class: frontier (project role policy: tier hard, tools)
   - Customer value: HIGH
   - Details: LiteRT-LM CPU engine on arm64 and x86_64. library: cand-004 (LiteRT-LM AAR, adopt).

6. local-embedder-and-mobile-store: see `openspec/changes/local-embedder-and-mobile-store/proposal.md`
   - Scope: inference crate (embedder), storage crate, FFI boot, Dart boot, ADR
   - Depends on: inference-contract, model-acquisition
   - Recommended agent: Claude Code root agent with patientgpt-delivery native roles (per-task routes below)
   - Est. complexity: L (about 6 active agent hours)
   - Complexity score: High
   - Model class: frontier (project role policy: tier hard, tools)
   - Customer value: HIGH
   - Details: On-device embeddings everywhere native; durable mobile store for conversations and settings. library: cand-012 (fastembed + ort, adapt), cand-013 (arctic-embed-xs, adopt), cand-014 (SurrealDB mobile, adopt with ADR).

7. uar-embedding-spike: see `openspec/changes/uar-embedding-spike/proposal.md`
   - Scope: throwaway spike workspace, report
   - Depends on: inference-contract, model-acquisition, desktop-local-chat
   - Recommended agent: Claude Code root agent with patientgpt-delivery native roles (per-task routes below)
   - Est. complexity: M (about 4 active agent hours)
   - Complexity score: High
   - Model class: frontier (project role policy: tier hard, tools)
   - Customer value: MEDIUM
   - Details: Measures whether UAR v1.3.0 embeds on stable Rust and on iOS targets; feeds decisions 3 and 4. library: cand-015 (UAR EmbeddedRuntime, adopt, operator-gated).

8. agui-bridge-and-uar-service: see `openspec/changes/agui-bridge-and-uar-service/proposal.md`
   - Scope: UAR crate (bridge, client, routing), error mappings, UAR agent definition
   - Depends on: inference-contract, model-acquisition:1.1 (HTTP client pin)
   - Recommended agent: Claude Code root agent with patientgpt-delivery native roles (per-task routes below)
   - Est. complexity: L (about 5 active agent hours)
   - Complexity score: High
   - Model class: frontier (project role policy: tier hard, tools)
   - Customer value: HIGH
   - Details: AG-UI 1.0 bridge and the cloud host's UAR service client (B6, B9; build, no Rust AG-UI crate per cand-017 reject).

9. uar-embedded-runtime: see `openspec/changes/uar-embedded-runtime/proposal.md`
   - Scope: UAR crate (embedded), workspace patch overlay, FFI boot
   - Depends on: uar-embedding-spike (passed), agui-bridge-and-uar-service, ios-local-chat, local-embedder-and-mobile-store
   - Recommended agent: Claude Code root agent with patientgpt-delivery native roles (per-task routes below)
   - Est. complexity: L (about 7 active agent hours)
   - Complexity score: High
   - Model class: frontier (project role policy: tier hard, tools)
   - Customer value: HIGH
   - Details: Embedded UAR on iOS with the decision-14 driver rule and deny-by-default admission. library: cand-015 (adopt, operator-gated).

10. desktop-uar-topology: see `openspec/changes/desktop-uar-topology/proposal.md`
   - Scope: desktop shell
   - Depends on: uar-embedding-spike (decision 3), agui-bridge-and-uar-service, uar-embedded-runtime (options a/c)
   - Recommended agent: Claude Code root agent with patientgpt-delivery native roles (per-task routes below)
   - Est. complexity: M (about 3 active agent hours)
   - Complexity score: Medium
   - Model class: frontier (project role policy: tier hard, tools)
   - Customer value: MEDIUM
   - Details: Desktop reaches UAR through the chosen topology; failures contained. BLOCKED until decision 3. library: cand-016 (uar-sidecar) only under option b.

11. local-onboarding: see `openspec/changes/local-onboarding/proposal.md`
   - Scope: host (proposals, setup), storage, all transports, React and Flutter screens, docs/design
   - Depends on: inference-contract, model-acquisition, desktop-local-chat, local-embedder-and-mobile-store, agui-bridge-and-uar-service; ios/android chat for mobile screens
   - Recommended agent: Claude Code root agent with patientgpt-delivery native roles (per-task routes below)
   - Est. complexity: L (about 8 active agent hours)
   - Complexity score: High
   - Model class: frontier (project role policy: tier hard, tools)
   - Customer value: HIGH
   - Details: The user-visible goal-5 flow: prepare, chat, confirm setup proposals executed by the host.

12. phase-integration-evidence: see `openspec/changes/phase-integration-evidence/proposal.md`
   - Scope: evidence scripts and receipts
   - Depends on: all eleven
   - Recommended agent: Claude Code root agent with patientgpt-delivery native roles (per-task routes below)
   - Est. complexity: L (about 8 active agent hours)
   - Complexity score: High
   - Model class: frontier (project role policy: tier hard, tools)
   - Customer value: HIGH
   - Details: Authors and runs the 50 scenarios locally once at the phase boundary; independent review.

## EXECUTION ROUND ORDER

Rounds run in order; items inside a round can run in parallel with disjoint file
ownership (`spec.md` → shared files). One Cargo build at a time on each machine.

**On the Intel Mac (now)**

| Round | Work | Notes |
|---|---|---|
| 1 | `inference-contract` (all) | Freezes shapes for everyone |
| 2 | `model-acquisition` 1.1–4.1; `agui-bridge-and-uar-service` 1.1; `ios-local-chat` 1.1, 2.1; `uar-embedding-spike` 1.1, 1.2; `local-onboarding` 1.1 (design draft) | agui 2.x waits for model-acquisition 1.1's HTTP client pin |
| 3 | `agui-bridge-and-uar-service` 2.1–4.1; `local-embedder-and-mobile-store` 1.3, 2.1, 2.2, 3.1, 3.2; `android-local-chat` (all) | Android chat runs on the x86_64 AVD |
| 4 | `desktop-uar-topology` 2.1; `local-onboarding` 2.1–3.1, then 4.1 after you approve the design addition | Host-side onboarding and web screens |

**Switch to the ARM MacBook Pro here.** I stop and tell you before round 5.

| Round | Work | Notes |
|---|---|---|
| 5 | `desktop-local-chat` (all); `model-acquisition` 4.2; `local-embedder-and-mobile-store` 1.1, 1.2, 1.4 | First on-device inference |
| 6 | `ios-local-chat` 1.2, 2.2, 3.1, 3.2; `local-embedder-and-mobile-store` 2.3, 4.1; `uar-embedding-spike` 2.1–4.1; `local-onboarding` 1.2 (feasibility) | Spike and feasibility are design inputs (D-018) |
| 7 | `uar-embedding-spike` 4.2 (decision 3, and 4 if needed) | Operator decision |
| 8 | `uar-embedded-runtime` 1.1, 1.2, 2.1, 2.2, then 3.1, 3.2, 4.1; `local-onboarding` 4.2, 5.1 | |
| 9 | `desktop-uar-topology` 1.1, 1.2 (amendment, your review), 3.1 | BLOCKED until decision 3 |
| 10 | `phase-integration-evidence` (all) | Final gate: ARM batches, then cloud and desktop-intel on the Intel Mac; Android on either |

If the spike fails (round 6), desktop takes option (b), `uar-embedded-runtime` is
Blocked, and the iOS half of goal 4 is reported Blocked on UAR.

## Delivery cadence

The blocking `visible-two-hour-delivery` constraint applies to execution:

- **Every 120 minutes:** `pnpm -C web build` and a short human demo of what changed.
- **Every even increment:** also `cargo build -p patient-gpt-desktop` (debug) and a
  debug desktop launch. The project hook blocks `tauri build` during implementation;
  the bundled build happens once, in the evidence batch, behind your tier gate.
- A build or demo is not a test and closes nothing (`docs/plan/patientgpt-delivery-cadence.md`).

## Effort and waiting

| Measure | Estimate |
|---|---|
| Active coding-agent hours | about 67 |
| External waiting (not agent time) | model downloads (0.4–1 GB per chat model), first native builds of mlx-c, RocksDB, ort and UAR, the UAR service build, and your approvals |
| Operator decision points | design addition, decision 3 (and 4), tier gate, device and signing, UAR provider and PAT, `versions.toml` pins, filing the A2UI catalog request |

## Contract binding

| Item | Value |
|---|---|
| Contract | `.kbd-orchestrator/phases/local-inference-and-uar-wiring/adopted-contract.json` |
| Candidate digest | `b4fd9caf9f70fef633127346b190cb2e31fa8157ecb2bb0402826b1e7ad0d633` |
| Normalization | `jq -S -c 'del(.identity.contractDigest) \| del(.identity.planRevision)' \| shasum -a 256` |
| Adoption status | **PENDING operator instruction.** Adoption binds the phase in canonical state; a later digest change then needs a signed amendment manifest. The Plan→Execute gate rejects an unadopted contract. |
| Worker routes | Claude Code 2.1.310 root agent; native role subagents with per-task model overrides (table below) |
| Budgets | 2,700 active minutes, 4,000 tool calls, 3 repair attempts per scenario, no-progress limit 3, tokens UNKNOWN with checkpoint fallback (contract `budgets`) |
| Freshness keys | per-change source paths, catalog digests, UAR pin, plan revision (verification.md → Evidence invalidation keys) |
| Boundary packet | contract `boundaryPacket`: one post-implementation run of `scripts/evidence/run-final-gate.sh <target>` for seven targets, approvals asked once, receipts in a new dated folder, cleanup and stop conditions listed |

## Scenario coverage

| Scenario | Owner task (implements) | Executed by |
|---|---|---|
| LANE-1 | `inference-contract:2.3` | phase-integration-evidence:2.2, phase-integration-evidence:2.3, phase-integration-evidence:2.5 |
| LANE-2 | `inference-contract:2.3` | phase-integration-evidence:2.2, phase-integration-evidence:2.3, phase-integration-evidence:2.5 |
| LANE-3 | `inference-contract:2.3` | phase-integration-evidence:2.2 |
| LANE-4 | `inference-contract:3.1` | phase-integration-evidence:2.5 |
| LANE-5 | `inference-contract:2.2` | phase-integration-evidence:2.2 |
| LANE-6 | `inference-contract:1.2` | phase-integration-evidence:2.2, phase-integration-evidence:2.3 |
| ACQ-1 | `model-acquisition:2.3` | phase-integration-evidence:2.2 |
| ACQ-2 | `model-acquisition:2.1` | phase-integration-evidence:2.2 |
| ACQ-3 | `model-acquisition:2.1` | phase-integration-evidence:2.2 |
| ACQ-4 | `model-acquisition:2.2` | phase-integration-evidence:2.2, phase-integration-evidence:2.4 |
| ACQ-5 | `model-acquisition:4.1` | phase-integration-evidence:2.3, phase-integration-evidence:2.4 |
| ACQ-6 | `inference-contract:2.3` | phase-integration-evidence:2.2 |
| CHAT-1 | `desktop-local-chat:1.2` | phase-integration-evidence:2.2 |
| CHAT-2 | `ios-local-chat:2.2` | phase-integration-evidence:2.3 |
| CHAT-3 | `ios-local-chat:2.2` | phase-integration-evidence:2.3 |
| CHAT-4 | `ios-local-chat:1.2` | phase-integration-evidence:2.3 |
| CHAT-5 | `android-local-chat:2.2` | phase-integration-evidence:2.4 |
| CHAT-6 | `inference-contract:2.3` | phase-integration-evidence:2.2 |
| CHAT-7 | `desktop-local-chat:1.2` | phase-integration-evidence:2.2 |
| CHAT-8 | `desktop-local-chat:2.1` | phase-integration-evidence:2.5 |
| PRIV-1 | `desktop-local-chat:1.2` | phase-integration-evidence:2.2 |
| EMB-1 | `local-embedder-and-mobile-store:1.2` | phase-integration-evidence:2.2 |
| EMB-5 | `local-embedder-and-mobile-store:1.2` | phase-integration-evidence:2.2 |
| EMB-2 | `local-embedder-and-mobile-store:1.4` | phase-integration-evidence:2.3 |
| EMB-3 | `local-embedder-and-mobile-store:1.4` | phase-integration-evidence:2.4 |
| EMB-4 | `inference-contract:2.3` | phase-integration-evidence:2.2 |
| STORE-1 | `local-embedder-and-mobile-store:2.2` | phase-integration-evidence:2.3, phase-integration-evidence:2.4 |
| STORE-2 | `local-embedder-and-mobile-store:2.2` | phase-integration-evidence:2.3 |
| UAR-1 | `agui-bridge-and-uar-service:2.1` | phase-integration-evidence:2.5 |
| UAR-2 | `agui-bridge-and-uar-service:2.1` | phase-integration-evidence:2.5 |
| UAR-3 | `agui-bridge-and-uar-service:2.2` | phase-integration-evidence:2.5 |
| UAR-4 | `uar-embedded-runtime:1.2` | phase-integration-evidence:2.3 |
| UAR-5 | `uar-embedded-runtime:2.1` | phase-integration-evidence:2.2 |
| UAR-6 | `uar-embedded-runtime:2.2` | phase-integration-evidence:2.2 |
| UAR-7 | `uar-embedded-runtime:3.1` | phase-integration-evidence:2.3 |
| UAR-8 | `desktop-uar-topology:3.1` | phase-integration-evidence:2.2 |
| UAR-10 | `agui-bridge-and-uar-service:2.1` | phase-integration-evidence:2.5 |
| UAR-11 | `uar-embedded-runtime:3.1` | phase-integration-evidence:2.4 |
| BRIDGE-1 | `agui-bridge-and-uar-service:1.1` | phase-integration-evidence:2.2 |
| UAR-9 | `desktop-uar-topology:2.1` | phase-integration-evidence:2.2 |
| ONB-1 | `local-onboarding:4.1` | phase-integration-evidence:2.2 |
| ONB-2 | `local-onboarding:2.2` | phase-integration-evidence:2.2 |
| ONB-3 | `local-onboarding:2.2` | phase-integration-evidence:2.2 |
| ONB-4 | `local-onboarding:2.2` | phase-integration-evidence:2.2 |
| ONB-5 | `local-onboarding:2.2` | phase-integration-evidence:2.2 |
| ONB-6 | `local-onboarding:5.1` | phase-integration-evidence:2.3, phase-integration-evidence:2.4 |
| ONB-7 | `local-onboarding:3.1` | phase-integration-evidence:2.5 |
| ONB-8 | `local-onboarding:2.2` | phase-integration-evidence:2.2 |
| ONB-9 | `local-onboarding:2.2` | phase-integration-evidence:2.2 |
| PAR-1 | `inference-contract:5.1` | phase-integration-evidence:2.2 |
| SPIKE-1 | `uar-embedding-spike:4.1` | uar-embedding-spike:4.1 (design input) |

## Task model assignments

Routes are recommendations dated 2026-10-26; the executor rechecks each before
dispatch and records the actual route in `execution.md`. Evidence for every row:
the Claude Code Agent tool in this session exposes model overrides `opus`, `sonnet`,
`haiku` and `fable`; the 17 role definitions in `.claude/agents/` pin no model and
`.agent-team/patientgpt-delivery/team.json` sets every role to tier `hard` with tool
use. No route has been exercised for these tasks yet. Model choice is task fit first:
Fable 5.1 for the highest-uncertainty and trust-boundary tasks, Opus 5.5 for most
implementation, Sonnet 5.5 for records and documentation, Haiku 5.5 for one
mechanical status read. Reviewers run on Fable so they differ from the Opus builders.

Reasoning effort is left unset in every row: this session's Agent tool sets effort
only on an explicit operator instruction, so each worker inherits its default.
liter-llm is unavailable (MCP connection closed; the port-4000 gateway needs a key),
so no row uses it. The team's declared target harness is Codex; its native role
files `.codex/agents/<role>.toml` are the documented alternative, not inspected in
this session.

| Phase path | Change ID | Backend task ID | Requirements | Provider/model | Reasoning effort | Rationale and dated evidence | Harness and route | Worker launch and handoff | Native alternative | Availability and verification | Prerequisites |
|---|---|---|---|---|---|---|---|---|---|---|---|
| local-inference-and-uar-wiring | inference-contract | 1.1 | High: frozen cross-shell contract; serde wire shapes; Rust; small context | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "rust-domain-engineer", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | none |
| local-inference-and-uar-wiring | inference-contract | 1.2 | High: frozen cross-shell contract; serde wire shapes; Rust; small context | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "rust-domain-engineer", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | none |
| local-inference-and-uar-wiring | inference-contract | 2.1 | High: host ports and mode parsing; Rust; crate-local | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "rust-domain-engineer", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | none |
| local-inference-and-uar-wiring | inference-contract | 2.2 | High: host ports and mode parsing; Rust; crate-local | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "rust-domain-engineer", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | none |
| local-inference-and-uar-wiring | inference-contract | 2.3 | Very high: lane/scope authority gate before any engine call, cancellation handles; security boundary; cross-crate | anthropic/claude-fable-5-1 | not set (inherit) | Highest uncertainty or a trust/clinical boundary; most capable available model (2026-10-26) | Claude Code 2.1.310, native | `Agent(subagent_type: "rust-domain-engineer", model: "fable")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | none |
| local-inference-and-uar-wiring | inference-contract | 2.4 | Medium-high: prompt builder with no PHI and no clinical instruction; Rust | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "rust-domain-engineer", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | none |
| local-inference-and-uar-wiring | inference-contract | 3.1 | High: Axum routes, SSE, error mapping; Rust; one crate | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "flint-data-engineer", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | none |
| local-inference-and-uar-wiring | inference-contract | 3.2 | High: Tauri commands and channels mirroring HTTP; Rust | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "tauri-engineer", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | none |
| local-inference-and-uar-wiring | inference-contract | 3.3 | High: FFI API and frb codegen; Rust + Dart; codegen tool | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "flutter-engineer", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | none |
| local-inference-and-uar-wiring | inference-contract | 4.1 | Medium-high: TS DTO unions, transports, abort to cancel; TypeScript 7 | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "react-engineer", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | none |
| local-inference-and-uar-wiring | inference-contract | 4.2 | Medium-high: Dart codec, gateway, dart-define boot; Dart | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "flutter-engineer", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | none |
| local-inference-and-uar-wiring | inference-contract | 5.1 | Low-medium: contract table edit cross-checked against three files; Markdown + grep | anthropic/claude-sonnet-5-5 | not set (inherit) | Bounded record or documentation work; lower cost at adequate quality | Claude Code 2.1.310, native | `Agent(subagent_type: "documentation-engineer", model: "sonnet")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | none |
| local-inference-and-uar-wiring | model-acquisition | 1.1 | Medium: new crate, registry pin checks (Context7, crates.io); Rust | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "rust-domain-engineer", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | none |
| local-inference-and-uar-wiring | model-acquisition | 1.2 | Medium: digest computation at pinned revisions; network; correctness-critical | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "rust-domain-engineer", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | none |
| local-inference-and-uar-wiring | model-acquisition | 2.1 | Very high: resumable verified download, HTTPS-only redirects, atomic rename; integrity control | anthropic/claude-fable-5-1 | not set (inherit) | Highest uncertainty or a trust/clinical boundary; most capable available model (2026-10-26) | Claude Code 2.1.310, native | `Agent(subagent_type: "rust-domain-engineer", model: "fable")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | none |
| local-inference-and-uar-wiring | model-acquisition | 2.2 | High: preflight thresholds and store port adapter; Rust | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "rust-domain-engineer", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | none |
| local-inference-and-uar-wiring | model-acquisition | 2.3 | High: preflight thresholds and store port adapter; Rust | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "rust-domain-engineer", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | none |
| local-inference-and-uar-wiring | model-acquisition | 3.1 | Medium: data-dir override and boot wiring; Rust; debug launch | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "tauri-engineer", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | none |
| local-inference-and-uar-wiring | model-acquisition | 3.2 | Medium: data-dir override and boot wiring; Rust; debug launch | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "tauri-engineer", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | none |
| local-inference-and-uar-wiring | model-acquisition | 4.1 | High: Dart/Kotlin/Rust platform paths, backup exclusion, RAM read; three languages | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "flutter-engineer", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | none |
| local-inference-and-uar-wiring | model-acquisition | 4.2 | Medium: FFI boot wiring; simulator debug run | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "flutter-engineer", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | ARM MacBook Pro (D-018) |
| local-inference-and-uar-wiring | desktop-local-chat | 1.1 | High: mlex API discovery, chat template, blocking worker, cancellation; Rust + C++ build | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "rust-domain-engineer", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | ARM MacBook Pro (D-018) |
| local-inference-and-uar-wiring | desktop-local-chat | 1.2 | High: mlex API discovery, chat template, blocking worker, cancellation; Rust + C++ build | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "rust-domain-engineer", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | ARM MacBook Pro (D-018) |
| local-inference-and-uar-wiring | desktop-local-chat | 2.1 | Medium: boot registration; devtools build-stage demo | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "tauri-engineer", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | ARM MacBook Pro (D-018) |
| local-inference-and-uar-wiring | desktop-local-chat | 2.2 | Medium: boot registration; devtools build-stage demo | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "tauri-engineer", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | ARM MacBook Pro (D-018) |
| local-inference-and-uar-wiring | ios-local-chat | 1.1 | High: C vtable FFI and exported symbol; Rust unsafe boundary | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "rust-domain-engineer", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | none |
| local-inference-and-uar-wiring | ios-local-chat | 1.2 | High: C vtable FFI and exported symbol; Rust unsafe boundary | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "rust-domain-engineer", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | ARM MacBook Pro (D-018) |
| local-inference-and-uar-wiring | ios-local-chat | 2.1 | High: MLX-Swift SPM integration, Swift engine, AppDelegate ordering; Swift + Xcode | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "flutter-engineer", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | none |
| local-inference-and-uar-wiring | ios-local-chat | 2.2 | High: MLX-Swift SPM integration, Swift engine, AppDelegate ordering; Swift + Xcode | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "flutter-engineer", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | ARM MacBook Pro (D-018) |
| local-inference-and-uar-wiring | ios-local-chat | 3.1 | High uncertainty: Mac (Designed for iPad) invocation discovery; Xcode signing | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "flutter-engineer", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | ARM MacBook Pro (D-018) |
| local-inference-and-uar-wiring | ios-local-chat | 3.2 | Low: record device facts in runbook | anthropic/claude-sonnet-5-5 | not set (inherit) | Bounded record or documentation work; lower cost at adequate quality | Claude Code 2.1.310, native | `Agent(subagent_type: "flutter-engineer", model: "sonnet")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | ARM MacBook Pro (D-018) |
| local-inference-and-uar-wiring | android-local-chat | 1.1 | High: JNI entry points and GlobalRef lifetime; Rust unsafe boundary | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "rust-domain-engineer", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | none |
| local-inference-and-uar-wiring | android-local-chat | 2.1 | High: LiteRT-LM API discovery, Kotlin engine, Gradle with patched cargokit; Kotlin | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "flutter-engineer", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | none |
| local-inference-and-uar-wiring | android-local-chat | 2.2 | High: LiteRT-LM API discovery, Kotlin engine, Gradle with patched cargokit; Kotlin | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "flutter-engineer", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | none |
| local-inference-and-uar-wiring | android-local-chat | 3.1 | Low: AVD configuration and runbook entry | anthropic/claude-sonnet-5-5 | not set (inherit) | Bounded record or documentation work; lower cost at adequate quality | Claude Code 2.1.310, native | `Agent(subagent_type: "flutter-engineer", model: "sonnet")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | none |
| local-inference-and-uar-wiring | local-embedder-and-mobile-store | 1.1 | High: fastembed/ort feature set, user-defined model loading; native runtime download | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "rust-domain-engineer", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | ARM MacBook Pro (D-018) |
| local-inference-and-uar-wiring | local-embedder-and-mobile-store | 1.2 | High: fastembed/ort feature set, user-defined model loading; native runtime download | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "rust-domain-engineer", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | ARM MacBook Pro (D-018) |
| local-inference-and-uar-wiring | local-embedder-and-mobile-store | 1.3 | Low: crate docs and ADR text | anthropic/claude-sonnet-5-5 | not set (inherit) | Bounded record or documentation work; lower cost at adequate quality | Claude Code 2.1.310, native | `Agent(subagent_type: "documentation-engineer", model: "sonnet")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | none |
| local-inference-and-uar-wiring | local-embedder-and-mobile-store | 1.4 | Medium: cfg-gated registration on desktop and FFI | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "tauri-engineer", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | ARM MacBook Pro (D-018) |
| local-inference-and-uar-wiring | local-embedder-and-mobile-store | 2.1 | High: SurrealDB settings record, FFI store replacement, no fallback; Rust | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "storage-engineer", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | none |
| local-inference-and-uar-wiring | local-embedder-and-mobile-store | 2.2 | High: SurrealDB settings record, FFI store replacement, no fallback; Rust | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "storage-engineer", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | none |
| local-inference-and-uar-wiring | local-embedder-and-mobile-store | 2.3 | Medium: Dart boot path and storage error state | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "flutter-engineer", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | ARM MacBook Pro (D-018) |
| local-inference-and-uar-wiring | local-embedder-and-mobile-store | 3.1 | Low-medium: ADR and contract table, cited facts | anthropic/claude-sonnet-5-5 | not set (inherit) | Bounded record or documentation work; lower cost at adequate quality | Claude Code 2.1.310, native | `Agent(subagent_type: "documentation-engineer", model: "sonnet")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | none |
| local-inference-and-uar-wiring | local-embedder-and-mobile-store | 3.2 | Low-medium: ADR and contract table, cited facts | anthropic/claude-sonnet-5-5 | not set (inherit) | Bounded record or documentation work; lower cost at adequate quality | Claude Code 2.1.310, native | `Agent(subagent_type: "documentation-engineer", model: "sonnet")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | none |
| local-inference-and-uar-wiring | local-embedder-and-mobile-store | 4.1 | Medium: mobile cross-build batch and failure triage | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "platform-release-engineer", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | ARM MacBook Pro (D-018) |
| local-inference-and-uar-wiring | uar-embedding-spike | 1.1 | Medium: citation re-check at a git tag; read-only; many files | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "uar-agent-expert", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | none |
| local-inference-and-uar-wiring | uar-embedding-spike | 1.2 | Low: quote extraction at a tag | anthropic/claude-sonnet-5-5 | not set (inherit) | Bounded record or documentation work; lower cost at adequate quality | Claude Code 2.1.310, native | `Agent(subagent_type: "uar-agent-expert", model: "sonnet")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | none |
| local-inference-and-uar-wiring | uar-embedding-spike | 2.1 | Very high uncertainty: foreign workspace build, patch overlay, toolchain, cross targets, size | anthropic/claude-fable-5-1 | not set (inherit) | Highest uncertainty or a trust/clinical boundary; most capable available model (2026-10-26) | Claude Code 2.1.310, native | `Agent(subagent_type: "uar-agent-expert", model: "fable")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | ARM MacBook Pro (D-018) |
| local-inference-and-uar-wiring | uar-embedding-spike | 2.2 | Very high uncertainty: foreign workspace build, patch overlay, toolchain, cross targets, size | anthropic/claude-fable-5-1 | not set (inherit) | Highest uncertainty or a trust/clinical boundary; most capable available model (2026-10-26) | Claude Code 2.1.310, native | `Agent(subagent_type: "uar-agent-expert", model: "fable")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | ARM MacBook Pro (D-018) |
| local-inference-and-uar-wiring | uar-embedding-spike | 2.3 | Very high uncertainty: foreign workspace build, patch overlay, toolchain, cross targets, size | anthropic/claude-fable-5-1 | not set (inherit) | Highest uncertainty or a trust/clinical boundary; most capable available model (2026-10-26) | Claude Code 2.1.310, native | `Agent(subagent_type: "uar-agent-expert", model: "fable")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | ARM MacBook Pro (D-018) |
| local-inference-and-uar-wiring | uar-embedding-spike | 2.4 | Very high uncertainty: foreign workspace build, patch overlay, toolchain, cross targets, size | anthropic/claude-fable-5-1 | not set (inherit) | Highest uncertainty or a trust/clinical boundary; most capable available model (2026-10-26) | Claude Code 2.1.310, native | `Agent(subagent_type: "uar-agent-expert", model: "fable")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | ARM MacBook Pro (D-018) |
| local-inference-and-uar-wiring | uar-embedding-spike | 3.1 | Very high: in-process EmbeddedRuntime with host driver, event race measurement | anthropic/claude-fable-5-1 | not set (inherit) | Highest uncertainty or a trust/clinical boundary; most capable available model (2026-10-26) | Claude Code 2.1.310, native | `Agent(subagent_type: "uar-agent-expert", model: "fable")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | ARM MacBook Pro (D-018) |
| local-inference-and-uar-wiring | uar-embedding-spike | 3.2 | Very high: in-process EmbeddedRuntime with host driver, event race measurement | anthropic/claude-fable-5-1 | not set (inherit) | Highest uncertainty or a trust/clinical boundary; most capable available model (2026-10-26) | Claude Code 2.1.310, native | `Agent(subagent_type: "uar-agent-expert", model: "fable")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | ARM MacBook Pro (D-018) |
| local-inference-and-uar-wiring | uar-embedding-spike | 4.1 | Medium: evidence report with commands and outputs | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "uar-agent-expert", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | ARM MacBook Pro (D-018) |
| local-inference-and-uar-wiring | uar-embedding-spike | 4.2 | Operator decision: put decision 3/4 with the report; record verbatim | anthropic/claude-opus-5-5 | not set (inherit) | Operator-facing decision or gate; stays with the session model | Claude Code 2.1.310, native | Not delegated: the root agent does it in-session and records the result in `decision-log.md` / `execution.md` | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | none |
| local-inference-and-uar-wiring | agui-bridge-and-uar-service | 1.1 | High: AG-UI 1.0 to subset mapping, boundary synthesis, refusal rules | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "uar-agent-expert", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | none |
| local-inference-and-uar-wiring | agui-bridge-and-uar-service | 2.1 | Very high: token exchange and refresh, SSE client, secret handling; trust boundary | anthropic/claude-fable-5-1 | not set (inherit) | Highest uncertainty or a trust/clinical boundary; most capable available model (2026-10-26) | Claude Code 2.1.310, native | `Agent(subagent_type: "flint-data-engineer", model: "fable")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | none |
| local-inference-and-uar-wiring | agui-bridge-and-uar-service | 2.2 | High: routing table and error-code mappings across three transports | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "flint-data-engineer", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | none |
| local-inference-and-uar-wiring | agui-bridge-and-uar-service | 2.3 | High: routing table and error-code mappings across three transports | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "flint-data-engineer", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | none |
| local-inference-and-uar-wiring | agui-bridge-and-uar-service | 3.1 | High uncertainty: UAR agent definition and installation at v1.3.0; local service runbook | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "uar-agent-expert", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | none |
| local-inference-and-uar-wiring | agui-bridge-and-uar-service | 3.2 | Low: lead-scoped handoff document | anthropic/claude-sonnet-5-5 | not set (inherit) | Bounded record or documentation work; lower cost at adequate quality | Claude Code 2.1.310, native | `Agent(subagent_type: "uar-agent-expert", model: "sonnet")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | none |
| local-inference-and-uar-wiring | agui-bridge-and-uar-service | 4.1 | Medium: local UAR service plus server build-stage demo | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "flint-data-engineer", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | local UAR v1.3.0 service, PAT, synthetic-data provider |
| local-inference-and-uar-wiring | uar-embedded-runtime | 1.1 | High: optional UAR dependency, workspace patch overlay | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "uar-agent-expert", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | ARM MacBook Pro (D-018); spike passed |
| local-inference-and-uar-wiring | uar-embedded-runtime | 1.2 | Very high: EmbeddedRuntime builder with explicit host components, in-process streaming | anthropic/claude-fable-5-1 | not set (inherit) | Highest uncertainty or a trust/clinical boundary; most capable available model (2026-10-26) | Claude Code 2.1.310, native | `Agent(subagent_type: "uar-agent-expert", model: "fable")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | ARM MacBook Pro (D-018); spike passed |
| local-inference-and-uar-wiring | uar-embedded-runtime | 2.1 | Very high: decision-14 driver rule and deny-by-default admission; clinical-authority boundary | anthropic/claude-fable-5-1 | not set (inherit) | Highest uncertainty or a trust/clinical boundary; most capable available model (2026-10-26) | Claude Code 2.1.310, native | `Agent(subagent_type: "uar-agent-expert", model: "fable")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | ARM MacBook Pro (D-018); spike passed |
| local-inference-and-uar-wiring | uar-embedded-runtime | 2.2 | Very high: decision-14 driver rule and deny-by-default admission; clinical-authority boundary | anthropic/claude-fable-5-1 | not set (inherit) | Highest uncertainty or a trust/clinical boundary; most capable available model (2026-10-26) | Claude Code 2.1.310, native | `Agent(subagent_type: "uar-agent-expert", model: "fable")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | ARM MacBook Pro (D-018); spike passed |
| local-inference-and-uar-wiring | uar-embedded-runtime | 3.1 | Medium: iOS mode wiring, Android none-only boot | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "flutter-engineer", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | spike passed |
| local-inference-and-uar-wiring | uar-embedded-runtime | 3.2 | Medium: iOS mode wiring, Android none-only boot | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "flutter-engineer", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | ARM MacBook Pro (D-018); spike passed |
| local-inference-and-uar-wiring | uar-embedded-runtime | 4.1 | Medium: cross-target batch and dependency-tree check | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "platform-release-engineer", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | ARM MacBook Pro (D-018); spike passed |
| local-inference-and-uar-wiring | desktop-uar-topology | 1.1 | Operator decision 3 recorded; spec amendment and re-validation | anthropic/claude-opus-5-5 | not set (inherit) | Operator-facing decision or gate; stays with the session model | Claude Code 2.1.310, native | Not delegated: the root agent does it in-session and records the result in `decision-log.md` / `execution.md` | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | none |
| local-inference-and-uar-wiring | desktop-uar-topology | 1.2 | Operator decision 3 recorded; spec amendment and re-validation | anthropic/claude-opus-5-5 | not set (inherit) | Operator-facing decision or gate; stays with the session model | Claude Code 2.1.310, native | Not delegated: the root agent does it in-session and records the result in `decision-log.md` / `execution.md` | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | none |
| local-inference-and-uar-wiring | desktop-uar-topology | 2.1 | High: failure containment keeping the local floor in-process | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "tauri-engineer", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | decision 3 recorded |
| local-inference-and-uar-wiring | desktop-uar-topology | 3.1 | High: option-specific wiring (rows replaced by the amendment) | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "tauri-engineer", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | ARM MacBook Pro (D-018); decision 3 recorded |
| local-inference-and-uar-wiring | local-onboarding | 1.1 | High: design-authority addition in docs/design, both themes, labelled states; HTML/CSS | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "design-expert", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | none |
| local-inference-and-uar-wiring | local-onboarding | 1.2 | Medium: 20 local-lane generations, counts and transcripts; design input | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "rust-domain-engineer", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | ARM MacBook Pro (D-018) |
| local-inference-and-uar-wiring | local-onboarding | 2.1 | Medium: setup DTOs | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "rust-domain-engineer", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | none |
| local-inference-and-uar-wiring | local-onboarding | 2.2 | Very high: streaming block withholder, validator, host-side proposal store; write path from model output | anthropic/claude-fable-5-1 | not set (inherit) | Highest uncertainty or a trust/clinical boundary; most capable available model (2026-10-26) | Claude Code 2.1.310, native | `Agent(subagent_type: "rust-domain-engineer", model: "fable")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | none |
| local-inference-and-uar-wiring | local-onboarding | 2.3 | Medium: settings record on two stores | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "storage-engineer", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | none |
| local-inference-and-uar-wiring | local-onboarding | 3.1 | High: three setup commands across three transports | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "flint-data-engineer", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | none |
| local-inference-and-uar-wiring | local-onboarding | 4.1 | High: React screens from approved design, entity graph, Zustand; no query cache | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "react-engineer", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | operator-approved design addition (task 1.1) |
| local-inference-and-uar-wiring | local-onboarding | 4.2 | High: React screens from approved design, entity graph, Zustand; no query cache | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "react-engineer", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | ARM MacBook Pro (D-018); operator-approved design addition (task 1.1) |
| local-inference-and-uar-wiring | local-onboarding | 5.1 | High: Flutter screens with Riverpod parity | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "flutter-engineer", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | ARM MacBook Pro (D-018); operator-approved design addition (task 1.1) |
| local-inference-and-uar-wiring | phase-integration-evidence | 1.1 | Low: read all_done per change; mechanical | anthropic/claude-haiku-5-5 | not set (inherit) | Mechanical read of task state; lowest cost | Claude Code 2.1.310, native | `Agent(subagent_type: "team-lead", model: "haiku")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | none |
| local-inference-and-uar-wiring | phase-integration-evidence | 1.2 | Operator approvals asked once; verbatim record | anthropic/claude-opus-5-5 | not set (inherit) | Operator-facing decision or gate; stays with the session model | Claude Code 2.1.310, native | Not delegated: the root agent does it in-session and records the result in `decision-log.md` / `execution.md` | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | none |
| local-inference-and-uar-wiring | phase-integration-evidence | 2.1 | High: 50 scenario scripts with scratch roots, oracles, negative controls | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "platform-release-engineer", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | none |
| local-inference-and-uar-wiring | phase-integration-evidence | 2.2 | High: run batches on real devices and services; receipts | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "platform-release-engineer", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | ARM MacBook Pro (D-018); boundary approvals (task 1.2) |
| local-inference-and-uar-wiring | phase-integration-evidence | 2.3 | High: run batches on real devices and services; receipts | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "platform-release-engineer", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | ARM MacBook Pro (D-018); boundary approvals (task 1.2) |
| local-inference-and-uar-wiring | phase-integration-evidence | 2.4 | High: run batches on real devices and services; receipts | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "platform-release-engineer", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | boundary approvals (task 1.2) |
| local-inference-and-uar-wiring | phase-integration-evidence | 2.5 | High: run batches on real devices and services; receipts | anthropic/claude-opus-5-5 | not set (inherit) | Multi-file implementation with moderate-to-high uncertainty; current session model | Claude Code 2.1.310, native | `Agent(subagent_type: "platform-release-engineer", model: "opus")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | boundary approvals (task 1.2) |
| local-inference-and-uar-wiring | phase-integration-evidence | 3.1 | Independence: reviewer model differs from the opus builders; fresh context, artifacts only | anthropic/claude-fable-5-1 | not set (inherit) | Highest uncertainty or a trust/clinical boundary; most capable available model (2026-10-26) | Claude Code 2.1.310, native | `Agent(subagent_type: "artifact-critic", model: "fable")` and `Agent(subagent_type: "ui-critic", model: "fable")`, artifacts and contract only; findings return to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | none |
| local-inference-and-uar-wiring | phase-integration-evidence | 4.1 | Medium: verdict table and goal status in four words | anthropic/claude-sonnet-5-5 | not set (inherit) | Bounded record or documentation work; lower cost at adequate quality | Claude Code 2.1.310, native | `Agent(subagent_type: "team-lead", model: "sonnet")`, cwd `patient-gpt/`, `isolation: "worktree"` when another writer is active; role skills per its definition; result (changed files, build output) returns to the root agent | Codex `.codex/agents/` role (documentation only) | configured (model override exposed); unverified for this task | none |

## Operator approvals during execution

Asked once each, at the point they block work:

1. Contract adoption (before Execute starts).
2. The `docs/design` onboarding addition (`local-onboarding` 1.1), before UI code.
3. Pins for `versions.toml`, collected in `docs/plan/local-inference-pins.md` as they are verified.
4. Switching to the ARM MacBook Pro (before round 5).
5. Tier gate for the spike's release-size measurement (optional; otherwise UNKNOWN).
6. Decision 3, and decision 4 if stable Rust fails (round 7).
7. Filing `docs/plan/uar-a2ui-catalog-request.md` with UAR.
8. Boundary approvals: tier gate for evidence builds, Apple signing team, physical iPhone, UAR provider and PAT.

## Trade-offs and scope cuts

- **Scheduling by task, not change:** five changes are split across machines. That
  saves a second switch but means those changes stay open across rounds, and a
  half-done change cannot be reviewed as a unit until round 8.
- **Fable on 14 tasks costs more** than running everything on Opus. It is limited to
  the spike, the trust boundaries and the download integrity path.
- **Desktop topology may cost a second amendment cycle**, because its tasks are
  written only after decision 3.
- **Cut, as Spec recorded:** vector persistence, connecting to the recorded UAR
  endpoint, Windows/Linux, Android UAR, a simulator chat lane, clinical UAR agents.

## COMMANDS TO RUN

No `/opsx:new` is needed: Spec created all twelve changes. Each change's `tasks.md`
gains a prose reference to this table (no checkbox or title changes). The runtime
records the changes and tasks with `prometheus kbd change register` and
`prometheus kbd task register`, using the OpenSpec task ids as backend ids.

PLAN COMPLETE
