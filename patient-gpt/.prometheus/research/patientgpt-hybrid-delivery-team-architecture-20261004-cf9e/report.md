---
type: research-report
title: PatientGPT delivery team and hybrid architecture
query: "PatientGPT hybrid delivery team architecture and two-hour flow cadence"
date: 2026-10-04
confidence: 0.473
verification_status: partial
feynman_grade: null
misconceptions_absent: null
sources_count: 82
contradictions_resolved: 4
package_id: patientgpt-hybrid-delivery-team-architecture-20261004-cf9e
job_id: job-1791125242-d301b7d3
okf_version: '0.1'
---

# PatientGPT delivery team and architecture

Create a development team with explicit ownership of product scope, delivery, creative direction, interaction design, shared React, native shells, shared Rust, data, identity, and UAR agent authoring. This is an architectural recommendation, inferred from the boundaries below. It does not establish that a team export, model connection, application build, or deployed runtime is active.

The strongest inspected reuse seam is `aso_host::AppServices`, which exposes clinical repositories, authority and sessions to shell adapters [src-001]. The browser PGlite clinical materializer has an explicit recorded adoption block; the parent's native baseline also withholds production approval [src-007, src-008]. Fabric resolves SurrealDB 3.1.5, so the requested embedded 3.3.0 cannot be assumed present [src-012]. UAR distinguishes immutable definitions, private bindings and effective receipts; schema validity alone does not admit a run [src-032]. Its narrower team execution profile retains unsupported context and crash-recovery conditions [src-035]. These are verified static-source statements, not runtime results.

The complete registered UAR component set remains a product goal. The first useful increment may complete a small workflow, but it cannot replace the eventual full catalog with a permanently reduced primitive set. Two-hour increments are delivery checkpoints. They are never automatic phase boundaries, and they never trigger tests or independent review by themselves. This timing interpretation follows the operator's instruction and supersedes conflicting two-hour-phase language in the UAR research dossier.

## Ownership and handoff design — inferred recommendation

| Role | Exclusive decision/write responsibility | Required handoff |
|---|---|---|
| Team lead / architect | Dependency order, shared contracts, ownership ledger, one build writer, phase closure | Exact scoped slice, prerequisite receipts, no overlapping generated-file ownership |
| Product manager | Storyboard acceptance, workflow inventory, missing behavior and authority questions | Expected user action, persisted state, source evidence and usable exit condition |
| Creative director | Preserve prototype brand, spatial hierarchy and per-surface intent | Brief mapped to existing design; no replacement visual language |
| Design expert / token owner | Component behavior, accessibility, responsive states, one semantic token source and generator | State inventory and generated CSS/Dart contract |
| Shared React engineer | All reusable web/Tauri feature presentation and hooks | One implementation with injected shell transport; entity joins for durable state |
| Desktop engineer | Tauri native configuration, capabilities, custom window chrome and native host boundary | Desktop-only chrome, real minimize/maximize/restore/close/drag behavior, shared React consumption |
| Flutter engineer | Native mobile presentation and providers | Same domain intents, content hierarchy and token roles; no assumed replica |
| Rust core / bridge engineer | Shared domain rules, typed HTTP/Tauri/FFI contracts, generated TS/Dart outputs | Single authority-aware command surface, explicit errors and revisions |
| Storage / Fabric engineer | Forge/Postgres authority, scoped replication, PGlite and native storage adapters | Lane/privacy table, transactional cursor and session-scoped lifecycle contract |
| Identity / gateway engineer | Kratos credentials, Gate/Cedar, trusted headers and Envoy integration | One explicit browser/native session tuple and policy trace |
| UAR agent-building expert | Immutable product agents, governed tools, effective bindings, protocol/catalog compatibility | Versioned agent/package references and admitted component/action contracts |
| Release / documentation engineer | Root monorepo workflows, serial build coordination, docs package, publication recipe | Build receipts, docs artifact and public URL derivation; no CI tests |
| Artifact critic / verifier | Independent completed-phase review and actual local integration evidence | Dormant during partial implementation; findings against final artifacts and real application path |

These are reservations to reconcile with the eventual scaffold, not invented existing application directories. The development team and the product agents remain separate. A development role markdown file is not a deployed UAR AgentDefinition. An exported native harness artifact proves file generation; execution requires the intended installed harness to consume it. The three dossiers do not provide native-harness invocation receipts, so native agent support remains source/configuration evidence only.

Creative and design roles should compose existing bounded skills: project UI routing, portable Impeccable context, focused Pro Max lookup and stack-specific craft. The UI worker found no standalone creative-director or design-expert skill identifier; do not invent one. Its source inventory and summaries support a candidate binding plan but are not installed-engine activation proof [src-062, src-064, src-066]. Backend owners need no UI skill loading.

## Shared application and storage boundaries

Keep clinical truth in the ASO command/record system. Forge's `DatabaseBackend` supplies server Postgres access under transaction-local RLS context; the port explicitly requires mutation commits [src-002, src-003]. Fabric's `EntityStore` supplies tenant-scoped read/watch projections and atomic state/cursor advancement; its Surreal adapters serve projection and CRDT checkpoint purposes [src-009, src-010, src-011]. Neither is evidence that a native PatientGPT clinical database already exists.

The browser adapter opens PGlite memory or explicit IndexedDB storage. Current policy blocks persistent experimental clinical materialization; graph scope includes deployment, schema generation, principal, practice, identity, session and authority revision [src-004, src-005, src-006]. The recorded parent decision includes a memory measurement above its fixed limit. Reusing source must carry that block, not erase it [src-007]. The user-selected native SurrealDB 3.3.0 direction needs a deliberate PatientGPT decision over the inherited SQLite preference. Official release availability is reported in the worker evidence; exact 3.3.0 native feature/API compatibility remains unverified and the attempted version-specific docs endpoint was inaccessible [src-008, src-012, src-026, src-027].

The proposed PatientGPT data model scopes conversations by owner/coordinator and uses web/Tauri replicas while Flutter reads through the API [src-016]. Assign each new record a lane and privacy class before schema implementation. Persisted local data and derived embeddings retain their privacy classification. An inference lane or storage failure must not silently select a different destination. These are required design constraints, not newly implemented safeguards.

## Identity, Envoy and clinical authority

Kratos identity, Gate request enforcement and Envoy ingress are separately owned seams. The parent host adapter sends native `x-session-token`; the inspected Gate authenticator selects Authorization or Cookie [src-013, src-014]. A single explicit credential translation contract is needed before claiming web/native parity. A clinician's user identity never grants an agent clinical authority by association; host source explicitly creates a User principal and requires another provider for delegated agents [src-014].

Read-only selected-field cluster observations in the storage dossier show ready Envoy and Flint resources in `know-me`. Its only listed SecurityPolicy uses IPFS basic authentication. That observation does not establish ext_authz coverage for PatientGPT or clinical authorization [src-021]. Current official documentation summaries describe Envoy external authorization and header forwarding, but raw page captures are not in this package [src-030, src-031]. The source checkout search did not find a Gate Envoy check implementation. Resolve deployed revision and actual endpoint ownership before choosing the integration, rather than inferring it from Oathkeeper analogy.

## UAR agent and complete component contracts

Use immutable AgentDefinition/package identities, exact skills, private DeploymentBinding references and EffectiveBindingReceipt diagnostics. Package registration and a valid schema do not prove activation [src-032]. The narrow team profile describes required-unsupported context selections, nested-team limits, and missing external crash-exclusion proof; do not silently discard declared semantics to obtain a runnable-looking binding [src-035].

UAR's documented wire selection is `stream_mode: "agui_spec"` with profile `uar.agui/1`, stable logical event identity, sequencing and replay semantics [src-036]. The worker records a gap between the prototype's custom A2UI catalog and UAR's current closed component schemas; those claims remain conservatively labeled unverified here because assembly retained local excerpts without independently adjudicating every schema variant [src-038, src-039, src-044]. They require explicit ownership, not an assumption of compatibility.

The final scope is the full registered component catalog required by the product. The UAR expert and bridge owner must specify each component's catalog/version/type, props and binding schema, source ownership, action schema/effect, Rust type, generated TS/Dart mirrors, React renderer, Flutter renderer, accessibility, unavailable/denied/unknown states, and completed-phase integration scenario. Extend runtime admission and all relevant registries when existing primitives cannot express that contract. A shell-only renderer registration does not satisfy runtime admission. Clinical gate affirmation, signature, submission and call-outcome authority stay in host controls [src-046].

## Delivery increments and completed-phase verification

A suggested first usable increment is open a synthetic patient/case, ask for a catch-up through the actual UAR adapter, receive the five-section report, open a cited source, and recover conversation scope after reload. This is a proposed bounded flow, not a statement that all dependencies can be implemented in two hours. Later increments can complete evidence filing, criterion changes, then host-controlled gates and letter/submission workflows under the agreed full-phase plan.

At each two-hour increment, finish the promised production collaboration path and produce a local web build. Every second increment includes the full web and Tauri build. Record exact command, revision, exit status and artifact location from the established manifests. One owner serializes shared target/build directories. Do not invent PatientGPT commands by copying a sibling's scripts.

Tests, reviewers, auditors, verifiers and integration-checkers activate only when the entire planned implementation phase is complete. The two-hour clock never closes the phase. Final local integration exercises actual UI → shell adapter → trusted Rust services → UAR/identity/storage collaborators with synthetic data. It covers scope recovery, citations, three evidence states, forbidden clinical actions, cross-scope access and registered component behavior. No CI tests and no mock-only completion evidence. Builds during delivery remain Build-only evidence; device claims require named physical-device execution.

## Operator toolchain target and inspected team configuration

**Operator requirement, not a compatibility finding:** all authored TypeScript
7.0 files use kebab-case. The shared React engineer owns that convention across
one web/Tauri React implementation; the lead owns the exact compiler/package
selection. TypeScript 7.0 availability and full toolchain compatibility were not
established by this research. Record the exact compatible pin during scaffold
work; do not infer it from a sibling build or silently downgrade the target.

**Observed setup artifacts, not runtime proof:** the installed manifest at
`../../../.agent-team/patientgpt-delivery/team.json` has 17 roles. The routing
record selects Codex. `.agent-team/setup/native-artifact-inventory.json` in the
project records 103 native files across six harnesses: 102 match staged exports,
and the existing Claude artifact-critic remains deliberately preserved under the
shared role instructions. The install check reports `clean: true` for the
selected Codex routing. These setup receipts are distinct from the 82 external
and local-source research records below.

| Harness | Observed definition/configuration | Remaining limitation |
|---|---|---|
| Codex | 17 `.codex/agents/*.toml`; locally configured `gpt-6-astra`, high reasoning; 17 recorded explicit task-policy selections | Tool support metadata/configuration only; no inference probe or live role discovery certification; prices unknown |
| Claude Code | 17 project role definitions, preserving existing bootstrap critic; shared AGENTS/CLAUDE routing | Inherits native model; exact provider/model and invocation unverified; native subagents do not automatically enable experimental teams |
| OpenCode | 17 `.opencode/agents/*.md`, subagent mode | Inherits native configured model; discovery/invocation unverified |
| Kimi Code | 17 `.kimi-code/agents/*.md` | Invocation/global model pool; no verified role-model frontmatter control |
| MiniMax Code | 17 project `.minimax/agents/*/agent.md` | `mcode` absent during setup; requires absolute project MINIMAX_DATA_DIR at launch; no verified exec custom-agent selector |
| DeepSeek Harness | 17 persona profiles and one experimental team composition profile | No per-member model override, profile activation or actual team creation performed |
| Zed | Effective AGENTS.md team pointer | Uses external ACP agent configuration where applicable; no automatic delegation API asserted |

The quality-first policy is an explicit planning assumption without a fixed
price cap. Other harness model IDs remain unresolved rather than being populated
with a Codex-only identifier. Sources for setup observations are project
`.agent-team/setup/model-selections.json`, `install-check.json`, per-target
installation receipts, and `native-artifact-inventory.json`; these were inspected
in this setup session. Native serialization is source/syntax support only.

## Supplemental setup evidence table

These are labeled local setup observations. They do not add external sources to
the 82-source research inventory and do not certify live execution.

| Claim | Label | Evidence receipt | Scope |
|---|---|---|---|
| 103 native files exist; 102 match their staged export; one existing Claude artifact critic is preserved | verified (local file observation) | Project `.agent-team/setup/native-artifact-inventory.json`, `files` entries and `preservedDifferences`; counted and hashed by the setup inventory command | Definition presence and byte parity only |
| 17 roles and 17 explicit Codex model selections | verified (local configuration observation) | Project `.agent-team/patientgpt-delivery/team.json` and `.agent-team/setup/model-selections.json` | Configuration, not inference or provider availability |
| Selected Codex routing has no planned installation changes | verified (local installer observation) | Project `.agent-team/setup/install-check.json`: clean=true, changed=[] | Installer consistency, not native role discovery |

## Monorepo deployment and documentation

PatientGPT is within the prior-auth Git root, and the storage worker found no root or nested `.github` directory during inspection. Assign one owner for root workflows, package path filters and docs output. Sibling Gate and Forge deployment workflows target SSR/AKS; they do not establish ownership of know-me deployment [src-018, src-019]. Forge's CI tests conflict with PatientGPT policy and must not be copied. Fabric's docs pipeline provides a build/artifact/deploy separation example [src-020].

Docusaurus should be an isolated package with an explicitly derived public `url`/`baseUrl`, a local production build and separate Pages artifact. Official summaries describe GitHub Pages build/deploy job separation [src-080, src-081, src-082]. The monorepo About URL must use the actual chosen public endpoint; directory placement does not establish that URL. This report authorizes neither publication nor cluster changes. Deployment readiness, DNS/TLS, practice boundary and storage residency are unverified.

## Contradictions and decisions

The ledger retains seven contradictions. Three remain open: desktop SurrealDB version/adapter adoption, native credential translation, and complete custom A2UI catalog integration. Four are resolved as planning interpretations: database opening differs from materializer approval; narrow UAR execution differs from older document-only claims; incumbent product design overrides generic skill styling; and local-only tests override sibling CI examples. Resolved planning interpretation does not upgrade unverified runtime claims.

## Evidence limits and uncomfortable finding

A faithful interface can still emit incompatible events, retain the wrong user's scope, or expose a clinical command without authority. This package cannot certify any of those behaviors. It supplies source-based architecture recommendations and a traceable dependency inventory.

The assembly read local files into numbered excerpts and retained their hashes. Web entries are worker documentation summaries, explicitly not raw fetched pages. Claim labels are conservative: static passages manually adjudicated here are verified only as source statements; other worker summaries remain unverified. The inaccessible docs.rs attempt is blocked. All nonverified claims are named in the appendix. The gateway judge was blocked because distinct-model identity could not be established; a supplemental fresh-context native review is recorded separately under review/ with model independence unverified; no Feynman or sycophancy model call, live application build, native invocation, integration suite or deployment occurred.

The automated five-dimension scorer was run as required by the research skill, but its scores are not architecture rankings or correctness probabilities. Local file URLs lack domain authority, and source-code punctuation can inflate citation-depth heuristics. Low-scoring sources are retained in the audit record rather than quietly promoted. Do not use these scores to override the user's stack or actual runtime evidence.

## Claim evidence table and all outstanding source claims

Each label describes evidence retained in this package, never execution status.

| Claim | Label | Source | Score-derived confidence |
|---|---|---|---|
| Lines 36-48: domain repositories, authority, clock and sessions; shells wire adapters. | verified | src-001 | 0.49 |
| Lines 96-142: RLS-scoped connections, explicit mutation commit contract, SQL query port. | verified | src-002 | 0.49 |
| Lines 17-60: deadpool Postgres, transaction-local JWT and role context. | verified | src-003 | 0.49 |
| Lines 47-92: memory default, persistent IndexedDB opt-in, persistent experimental clinical materializer rejected. | verified | src-004 | 0.49 |
| Lines 22-44: memory archive or persistent IndexedDB construction. | verified | src-005 | 0.5 |
| Lines 122-135 and 377-410: principal/session/authority revision namespace and offline-limited disabled materializer. | verified | src-006 | 0.49 |
| Lines 85-87: PGlite Sync log=full incompatibility and internal materializer RSS above cap; historical measurements not rerun. | verified | src-007 | 0.5 |
| Lines 6-12 and 80-108: existing SQLite preference and blocked production adoption despite bounded native measurements. | verified | src-008 | 0.5 |
| Lines 53-118: tenant-scoped read/watch and state-plus-cursor atomicity. | verified | src-009 | 0.49 |
| Lines 13-45: deployment CRDT checkpoint store wraps Surreal<Any>. | verified | src-010 | 0.49 |
| Lines 31-59: connection/authentication/database selection for projection; no native PatientGPT integration proof. | verified | src-011 | 0.49 |
| Lines 9496-9499 resolve surrealdb 3.1.5, not required 3.3.0. | verified | src-012 | 0.5 |
| Lines 97-147 and 194-200 select Authorization or Cookie and reject competing credentials. | verified | src-013 | 0.5 |
| Lines 69-121 forward Cookie or x-session-token to whoami and create User principal. | verified | src-014 | 0.5 |
| Lines 28-35 and 55-88 browser routes and cookie/redirect preservation. | verified | src-015 | 0.49 |
| Lines 240-270 owner/coordinator scope and Flutter API without replica. | verified | src-016 | 0.49 |
| Lines 11-22 application pins unselected; preserve clinical source and local-only tests. | verified | src-017 | 0.5 |
| Lines 4-21 and 66-86 target SSR, not know-me; no dispatch performed. | verified | src-018 | 0.49 |
| Lines 27-28 and 68-101 run tests in CI, prohibited for PatientGPT. | verified | src-019 | 0.5 |
| Lines 10-16,46-59,88-95 path-filter docs and separate website build/deploy. | verified | src-020 | 0.49 |
| Recorded explicit-context kubectl observations: Gateway 1.9.1, Envoy 1.39.1, Flint routes and ready deployments; sole listed SecurityPolicy basicAuth only. No runtime authentication proof. | unverified | src-021 | 0.49 |
| Context7 official source: loads files into memory; flushes changed files, relaxed durability asynchronously. | unverified | src-022 | 0.5 |
| Context7 official worker API example with leader change notifications. | unverified | src-023 | 0.5 |
| Context7 official source distinguishes memory and persistent file engines. | unverified | src-024 | 0.5 |
| Context7 returns kv-surrealkv example; version-specific 3.3.0 API not yet compiled or verified. | unverified | src-025 | 0.5 |
| Official release page opened successfully; v3.3.0 exists, released September 28. | unverified | src-026 | 0.5 |
| Web returned URL is not accessible via this tool. No exact-version API claim derived. | blocked | src-027 | 0.57 |
| Context7 official docs validate session cookies and native tokens at whoami. | unverified | src-028 | 0.5 |
| Context7 official docs show cookie-session validation through Kratos whoami. | unverified | src-029 | 0.5 |
| Context7 official docs configure SecurityPolicy HTTP authorization and headersToBackend. | unverified | src-030 | 0.49 |
| Context7 official API documents limited default headers for HTTP external auth; cookie must be deliberately forwarded. | unverified | src-031 | 0.49 |
| Canonical JSON, exact SkillRefs, private bindings, immutable package closure and effective receipts; document conformance explicitly separate from runtime. | verified | src-032 | 0.57 |
| Run/owner/principal, policy/catalog/host revisions and argument digest bound into prepared invocation. | unverified | src-033 | 0.06 |
| RAG requirement passes through unsupported-field diagnostics; required fields refused; narrow-team context/child limitations explicit. | unverified | src-034 | 0.06 |
| Distinguishes authored selection from per-attempt selected artifacts; nested team/context limitations; external crash exclusion unavailable. | verified | src-035 | 0.5 |
| agui_spec and uar.agui/1; events, custom extensions, replay and deprecated dialect boundaries. | verified | src-036 | 0.54 |
| Explicit agui_spec selection, synthesized text/reasoning/tool lifecycle events. | unverified | src-037 | 0.06 |
| Exact version/profile/catalog literals and nine admitted component types; strict schema and executable-content rejection. | unverified | src-038 | 0.5 |
| Nine types, v0.9 compatibility/basic-catalog alias, rejects unapproved catalog; root required in each update. | unverified | src-039 | 0.49 |
| Pure local projection with onAction callback; schema rendering is not action authority. | unverified | src-040 | 0.11 |
| Resolve, schema validation, independent effects, session/tenant policy, approval, governed execution and immutable result. | unverified | src-041 | 0.06 |
| Stable event/run identity, sequence, replay, explicit outcomes, unknown events and redaction. | unverified | src-042 | 0.06 |
| UAR owns runtime, ContentBlock mirrors cross-shell data, bridge ownership is permanent. | unverified | src-043 | 0.11 |
| Custom aso.workbench/v1 catalog contains clinical display components absent from default UAR catalog; host controls excluded. | unverified | src-044 | 0.5 |
| CUSTOM a2ui and string RUN_FINISHED outcome/interrupt shapes are prototype contract, not automatically UAR profile. | unverified | src-045 | 0.49 |
| Five report sections; met/gap/void; source-backed assertions; distinct host-owned clinical command authority. | verified | src-046 | 0.5 |
| Current upstream lifecycle, state, activity, subagent, custom and interrupt-aware events. Queried via Context7 /ag-ui-protocol/ag-ui and opened official page. | unverified | src-047 | 0.5 |
| Catalog defines shared component vocabulary with native client-owned implementations. Queried Context7 /a2ui-project/a2ui for v0.9.1 catalogs and opened official page. | unverified | src-048 | 0.49 |
| Spec, ready, bootstrap. | verified | src-049 | 0.06 |
| Synthetic reference for all three surfaces; script responsibilities; lines 3-49. | unverified | src-050 | 0.49 |
| Seven workflow cases and nine navigation examples; lines 144-310. | unverified | src-051 | 0.49 |
| Three typefaces, dimensions, semantic colors and fill focus; lines 71-89 and 191-201. | unverified | src-052 | 0.49 |
| 360px panel and 1100px breakpoint, overlay and sheet rules; lines 87-101. | unverified | src-053 | 0.49 |
| Safe area, pointer and drawer behavior; lines 113 and 198-231. | unverified | src-054 | 0.49 |
| Letter revision and appeal drafting explicitly absent; lines 271,418. | unverified | src-055 | 0.49 |
| Gated window resolution, platform controls, header drag, fixed maximize label; lines 17-115. Source-only. | unverified | src-056 | 0.49 |
| Frontend dist and decorations false; lines 5-20. | unverified | src-057 | 0.49 |
| Window control permissions; lines 8-11. | unverified | src-058 | 0.49 |
| API proxy, recorded production target failure and configured browser targets; lines 15-40. | unverified | src-059 | 0.49 |
| Build and Tauri entrypoints; lines 7-11. | unverified | src-060 | 0.49 |
| Manually expressed projection header and constants; lines 1-3,54 onward; no generated parity proof. | unverified | src-061 | 0.49 |
| Preserve prototype, selective skills, direction roles and full phase review. | unverified | src-062 | 0.06 |
| Routing and phase-boundary tooling; source does not claim actual verification. | unverified | src-063 | 0.23 |
| Context adaptation provenance and native engine exclusions; lines 11-19. | unverified | src-064 | 0.5 |
| Existing brief wins; preinstalled engine requirement; bounded phase review. | unverified | src-065 | 0.11 |
| Focused retrieval, incumbent authority, no replacement direction by default. | unverified | src-066 | 0.23 |
| MIT upstream commit dcc40ff5133ef78276117db0cc34e7b83cc8aeba; local packaged runtime description. | unverified | src-067 | 0.5 |
| Cross-discipline orchestration and evidence over taste. | unverified | src-068 | 0.11 |
| Relevant render/bundle advice; SWR conflicts with PatientGPT line 83. | unverified | src-069 | 0.49 |
| Available-space composition, project authority and completed-phase review. | unverified | src-070 | 0.06 |
| Source checkout c9b3e2d4ca16322de83f9210cf1e97d2480ef004; adoption and architecture guidance. | unverified | src-071 | 0.5 |
| Desktop-only chrome and shared-bundle call gating; broad import assertion needs qualification. | unverified | src-072 | 0.06 |
| One generator source; two-family advice overridden by explicit PatientGPT fonts. | unverified | src-073 | 0.5 |
| State/theme/form inventory and comparison; generic persistence/version defaults subordinate to contract. | unverified | src-074 | 0.49 |
| Native inspection and goldens; per-widget timing overridden by full-phase boundary. | unverified | src-075 | 0.06 |
| Public-content classification, branded site and verification scope. | unverified | src-076 | 0.06 |
| Official control APIs and capability permissions; custom macOS chrome limitations; observed old tauri.windows snippet. | unverified | src-077 | 0.24 |
| System insets, window information and accessibility settings. | unverified | src-078 | 0.32 |
| Context7 official source: LayoutBuilder and constraints-based composition. | unverified | src-079 | 0.5 |
| Production url/baseUrl and explicit trailingSlash; docs build artifact deployment. | unverified | src-080 | 0.24 |
| Context7 official source supports docs in isolated monorepo subfolder. | unverified | src-081 | 0.49 |
| Build/artifact/deploy separation, permissions, needs and environment; current action major versions. | unverified | src-082 | 0.32 |

## References

- [src-001] Shared host capability boundary. (n.d.). file:///Users/gqadonis/Projects/TribeHealth/kevin/prior-auth/crates/aso-host/src/lib.rs (Observed 2026-10-04). Label: verified.
- [src-002] Forge database abstraction. (n.d.). file:///Users/gqadonis/Projects/prometheus/flint-forge/crates/fdb-ports/src/lib.rs (Observed 2026-10-04). Label: verified.
- [src-003] Forge Postgres adapter. (n.d.). file:///Users/gqadonis/Projects/prometheus/flint-forge/crates/fdb-postgres/src/backend.rs (Observed 2026-10-04). Label: verified.
- [src-004] Browser storage policy. (n.d.). file:///Users/gqadonis/Projects/TribeHealth/kevin/prior-auth/web/src/shared/sync/storage-policy.ts (Observed 2026-10-04). Label: verified.
- [src-005] Browser PGlite opening. (n.d.). file:///Users/gqadonis/Projects/TribeHealth/kevin/prior-auth/web/src/shared/sync/pglite-bootstrap.ts (Observed 2026-10-04). Label: verified.
- [src-006] Identity-scoped entity graph. (n.d.). file:///Users/gqadonis/Projects/TribeHealth/kevin/prior-auth/web/src/app/providers/graph-provider.tsx (Observed 2026-10-04). Label: verified.
- [src-007] Authoritative parent adoption decisions. (n.d.). file:///Users/gqadonis/Projects/TribeHealth/kevin/prior-auth/versions.toml (Observed 2026-10-04). Label: verified.
- [src-008] Native PGlite baseline and limitations. (n.d.). file:///Users/gqadonis/Projects/TribeHealth/kevin/prior-auth/docs/architecture/tauri-pglite-baseline.md (Observed 2026-10-04). Label: verified.
- [src-009] Fabric entity projection contract. (n.d.). file:///Users/gqadonis/Projects/prometheus/flint-realtime-fabric/crates/frf-ports/src/entity_store.rs (Observed 2026-10-04). Label: verified.
- [src-010] Fabric SurrealDB CRDT adapter. (n.d.). file:///Users/gqadonis/Projects/prometheus/flint-realtime-fabric/crates/frf-store-surreal/src/store.rs (Observed 2026-10-04). Label: verified.
- [src-011] Fabric SurrealDB projection adapter. (n.d.). file:///Users/gqadonis/Projects/prometheus/flint-realtime-fabric/crates/frf-projection-surreal/src/store.rs (Observed 2026-10-04). Label: verified.
- [src-012] Fabric actual SurrealDB resolution. (n.d.). file:///Users/gqadonis/Projects/prometheus/flint-realtime-fabric/Cargo.lock (Observed 2026-10-04). Label: verified.
- [src-013] Gate credential selection. (n.d.). file:///Users/gqadonis/Projects/prometheus/flint-gate/crates/flint-gate-core/src/auth/kratos.rs (Observed 2026-10-04). Label: verified.
- [src-014] ASO native/browser identity adapter. (n.d.). file:///Users/gqadonis/Projects/TribeHealth/kevin/prior-auth/crates/aso-web-server/src/adapters/session.rs (Observed 2026-10-04). Label: verified.
- [src-015] Browser login and recovery proxy. (n.d.). file:///Users/gqadonis/Projects/TribeHealth/kevin/prior-auth/crates/aso-web-server/src/adapters/kratos_proxy.rs (Observed 2026-10-04). Label: verified.
- [src-016] PatientGPT proposed authority/replica model. (n.d.). file:///Users/gqadonis/Projects/TribeHealth/kevin/prior-auth/patient-gpt/docs/design/data-model.md (Observed 2026-10-04). Label: verified.
- [src-017] PatientGPT dependency and architecture authority. (n.d.). file:///Users/gqadonis/Projects/TribeHealth/kevin/prior-auth/patient-gpt/versions.toml (Observed 2026-10-04). Label: verified.
- [src-018] Existing Gate deployment workflow. (n.d.). file:///Users/gqadonis/Projects/prometheus/flint-gate/.github/workflows/deploy-gateway.yml (Observed 2026-10-04). Label: verified.
- [src-019] Existing Forge CI incompatibility. (n.d.). file:///Users/gqadonis/Projects/prometheus/flint-forge/.github/workflows/ci.yml (Observed 2026-10-04). Label: verified.
- [src-020] Existing docs ownership example. (n.d.). file:///Users/gqadonis/Projects/prometheus/flint-realtime-fabric/.github/workflows/docs-pages.yml (Observed 2026-10-04). Label: verified.
- [src-021] Read-only know-me selected-field inventory. (n.d.). file:///Users/gqadonis/Projects/TribeHealth/kevin/prior-auth/patient-gpt/.prometheus/team-research/storage-identity.md (Observed 2026-10-04). Label: unverified.
- [src-022] PGlite IndexedDB filesystem. (n.d.). https://github.com/electric-sql/pglite/blob/main/docs/docs/filesystems.md (Observed 2026-10-04). Label: unverified.
- [src-023] PGlite worker example. (n.d.). https://github.com/electric-sql/pglite/blob/main/packages/pglite/examples/worker.html (Observed 2026-10-04). Label: unverified.
- [src-024] SurrealDB embedded Rust. (n.d.). https://github.com/surrealdb/docs.surrealdb.com/blob/main/src/content/build/embedding/by-language/rust.mdx (Observed 2026-10-04). Label: unverified.
- [src-025] SurrealDB local connection methods. (n.d.). https://github.com/surrealdb/docs.surrealdb.com/blob/main/src/content/reference/rust/methods/new.mdx (Observed 2026-10-04). Label: unverified.
- [src-026] SurrealDB 3.3.0 release. (n.d.). https://github.com/surrealdb/surrealdb/releases/tag/v3.3.0 (Observed 2026-10-04). Label: unverified.
- [src-027] Version-specific local engine documentation access attempt. (n.d.). https://docs.rs/surrealdb/3.3.0/surrealdb/engine/local/index.html (Observed 2026-10-04). Label: blocked.
- [src-028] Kratos session management. (n.d.). https://github.com/ory/docs/blob/master/docs/kratos/session-management/01_overview.mdx (Observed 2026-10-04). Label: unverified.
- [src-029] Kratos and Oathkeeper identity access proxy. (n.d.). https://github.com/ory/docs/blob/master/docs/kratos/guides/zero-trust-iap-proxy-identity-access-proxy.mdx (Observed 2026-10-04). Label: unverified.
- [src-030] Envoy Gateway external authorization. (n.d.). https://gateway.envoyproxy.io/docs/tasks/security/ext-auth (Observed 2026-10-04). Label: unverified.
- [src-031] Envoy Gateway extension API. (n.d.). https://gateway.envoyproxy.io/docs/api/extension_types (Observed 2026-10-04). Label: unverified.
- [src-032] UAR immutable authoring and private bindings. (n.d.). file:///Users/gqadonis/Projects/prometheus/universal-agent-runtime/docs/agents/collaboration/v0.1.0-draft.2/README.md (Observed 2026-10-04). Label: verified.
- [src-033] Governed tool admission authority envelope. (n.d.). file:///Users/gqadonis/Projects/prometheus/universal-agent-runtime/src/uar/runtime/tool_admission/mod.rs (Observed 2026-10-04). Label: unverified.
- [src-034] Unsupported runtime semantic requirements. (n.d.). file:///Users/gqadonis/Projects/prometheus/universal-agent-runtime/src/uar/compiler/collaboration/runtime_semantics.rs (Observed 2026-10-04). Label: unverified.
- [src-035] Narrow team execution limits and recovery. (n.d.). file:///Users/gqadonis/Projects/prometheus/universal-agent-runtime/docs/agents/collaboration/team-execution-profile-migration.md (Observed 2026-10-04). Label: verified.
- [src-036] UAR AG-UI stable profile. (n.d.). file:///Users/gqadonis/Projects/prometheus/universal-agent-runtime/docs/protocols/ag-ui-profile.md (Observed 2026-10-04). Label: verified.
- [src-037] Actual UAR stream mode and lifecycle emission. (n.d.). file:///Users/gqadonis/Projects/prometheus/universal-agent-runtime/src/server.rs (Observed 2026-10-04). Label: unverified.
- [src-038] UAR frontend A2UI closed catalog schema. (n.d.). file:///Users/gqadonis/Projects/prometheus/universal-agent-runtime/frontend/src/platform/a2ui/protocol.ts (Observed 2026-10-04). Label: unverified.
- [src-039] UAR Rust A2UI closed catalog validation. (n.d.). file:///Users/gqadonis/Projects/prometheus/universal-agent-runtime/src/uar/a2ui/protocol.rs (Observed 2026-10-04). Label: unverified.
- [src-040] UAR local React renderer. (n.d.). file:///Users/gqadonis/Projects/prometheus/universal-agent-runtime/frontend/src/features/a2ui/a2ui-surface-renderer.tsx (Observed 2026-10-04). Label: unverified.
- [src-041] Architecture tool-governance boundary. (n.d.). file:///Users/gqadonis/Projects/hybrid-mobile-architecture-src/skills/hybrid-mobile-architecture/references/rust/tool-governance.md (Observed 2026-10-04). Label: unverified.
- [src-042] Architecture AG-UI event contract. (n.d.). file:///Users/gqadonis/Projects/hybrid-mobile-architecture-src/skills/agui-event-contract/SKILL.md (Observed 2026-10-04). Label: unverified.
- [src-043] Architecture core and cross-shell ownership. (n.d.). file:///Users/gqadonis/Projects/hybrid-mobile-architecture-src/skills/hybrid-mobile-architecture/references/arch-standard.md (Observed 2026-10-04). Label: unverified.
- [src-044] PatientGPT prototype catalog and action allowlist. (n.d.). file:///Users/gqadonis/Projects/TribeHealth/kevin/prior-auth/patient-gpt/docs/design/patient-chat/a2ui-renderer.js (Observed 2026-10-04). Label: unverified.
- [src-045] PatientGPT prototype event emitter. (n.d.). file:///Users/gqadonis/Projects/TribeHealth/kevin/prior-auth/patient-gpt/docs/design/patient-chat/agui-stream.js (Observed 2026-10-04). Label: unverified.
- [src-046] PatientGPT clinical and report contract. (n.d.). file:///Users/gqadonis/Projects/TribeHealth/kevin/prior-auth/patient-gpt/.prometheus/project-contract.md (Observed 2026-10-04). Label: verified.
- [src-047] Official AG-UI events. (n.d.). https://docs.ag-ui.com/concepts/events (Observed 2026-10-04). Label: unverified.
- [src-048] Official A2UI catalog model. (n.d.). https://a2ui.org/concepts/catalogs/ (Observed 2026-10-04). Label: unverified.
- [src-049] PatientGPT waypoint. (n.d.). file:///Users/gqadonis/Projects/TribeHealth/kevin/prior-auth/patient-gpt/.kbd-orchestrator/current-waypoint.json (Observed 2026-10-04). Label: verified.
- [src-050] PatientGPT design reference. (n.d.). file:///Users/gqadonis/Projects/TribeHealth/kevin/prior-auth/patient-gpt/docs/design/README.md (Observed 2026-10-04). Label: unverified.
- [src-051] PatientGPT storyboard. (n.d.). file:///Users/gqadonis/Projects/TribeHealth/kevin/prior-auth/patient-gpt/docs/design/patient-chat-storyboard.html (Observed 2026-10-04). Label: unverified.
- [src-052] PatientGPT prototype tokens. (n.d.). file:///Users/gqadonis/Projects/TribeHealth/kevin/prior-auth/patient-gpt/docs/design/patient-chat/tokens.css (Observed 2026-10-04). Label: unverified.
- [src-053] PatientGPT Files responsive layout. (n.d.). file:///Users/gqadonis/Projects/TribeHealth/kevin/prior-auth/patient-gpt/docs/design/patient-chat/panel.css (Observed 2026-10-04). Label: unverified.
- [src-054] PatientGPT shell responsive layout. (n.d.). file:///Users/gqadonis/Projects/TribeHealth/kevin/prior-auth/patient-gpt/docs/design/patient-chat/shell.css (Observed 2026-10-04). Label: unverified.
- [src-055] Prototype workflow limits. (n.d.). file:///Users/gqadonis/Projects/TribeHealth/kevin/prior-auth/patient-gpt/docs/design/patient-chat/flows.js (Observed 2026-10-04). Label: unverified.
- [src-056] KnowMe custom Tauri titlebar. (n.d.). file:///Users/gqadonis/Projects/know-me/know-me-system/desktop/src/shared/components/Titlebar.tsx (Observed 2026-10-04). Label: unverified.
- [src-057] KnowMe Tauri config. (n.d.). file:///Users/gqadonis/Projects/know-me/know-me-system/desktop/src-tauri/tauri.conf.json (Observed 2026-10-04). Label: unverified.
- [src-058] KnowMe capabilities. (n.d.). file:///Users/gqadonis/Projects/know-me/know-me-system/desktop/src-tauri/capabilities/default.json (Observed 2026-10-04). Label: unverified.
- [src-059] KnowMe Vite config. (n.d.). file:///Users/gqadonis/Projects/know-me/know-me-system/desktop/vite.config.ts (Observed 2026-10-04). Label: unverified.
- [src-060] KnowMe desktop scripts. (n.d.). file:///Users/gqadonis/Projects/know-me/know-me-system/desktop/package.json (Observed 2026-10-04). Label: unverified.
- [src-061] KnowMe Flutter palette. (n.d.). file:///Users/gqadonis/Projects/know-me/know-me-system/mobile/lib/core/theme/tokens.dart (Observed 2026-10-04). Label: unverified.
- [src-062] Project UI UX protocol. (n.d.). file:///Users/gqadonis/Projects/TribeHealth/kevin/prior-auth/patient-gpt/.agents/UI_UX_PROTOCOL.md (Observed 2026-10-04). Label: unverified.
- [src-063] UI UX routing skill. (n.d.). file:///Users/gqadonis/Projects/TribeHealth/kevin/prior-auth/patient-gpt/.agents/skills/prometheus-ui-ux/SKILL.md (Observed 2026-10-04). Label: unverified.
- [src-064] Portable Impeccable core. (n.d.). file:///Users/gqadonis/Projects/TribeHealth/kevin/prior-auth/patient-gpt/.agents/skills/prometheus-impeccable-core/SKILL.md (Observed 2026-10-04). Label: unverified.
- [src-065] Impeccable 4.4.0. (n.d.). file:///Users/gqadonis/.codex/skills/impeccable/SKILL.md (Observed 2026-10-04). Label: unverified.
- [src-066] UI UX Pro Max portable skill. (n.d.). file:///Users/gqadonis/Projects/TribeHealth/kevin/prior-auth/patient-gpt/.agents/skills/ui-ux-pro-max/SKILL.md (Observed 2026-10-04). Label: unverified.
- [src-067] Pro Max source provenance. (n.d.). file:///Users/gqadonis/Projects/TribeHealth/kevin/prior-auth/patient-gpt/.agents/skills/ui-ux-pro-max/provenance.json (Observed 2026-10-04). Label: unverified.
- [src-068] Better Interface. (n.d.). file:///Users/gqadonis/Projects/TribeHealth/kevin/prior-auth/patient-gpt/.agents/skills/better-interface/SKILL.md (Observed 2026-10-04). Label: unverified.
- [src-069] Vercel React best practices. (n.d.). file:///Users/gqadonis/Projects/TribeHealth/kevin/prior-auth/patient-gpt/.agents/skills/vercel-react-best-practices/SKILL.md (Observed 2026-10-04). Label: unverified.
- [src-070] Flutter adaptive layout skill. (n.d.). file:///Users/gqadonis/Projects/TribeHealth/kevin/prior-auth/patient-gpt/.agents/skills/flutter-build-responsive-layout/SKILL.md (Observed 2026-10-04). Label: unverified.
- [src-071] Hybrid architecture skill. (n.d.). file:///Users/gqadonis/Projects/hybrid-mobile-architecture-src/skills/hybrid-mobile-architecture/SKILL.md (Observed 2026-10-04). Label: unverified.
- [src-072] Tauri titlebar skill. (n.d.). file:///Users/gqadonis/Projects/hybrid-mobile-architecture-src/skills/tauri-custom-titlebar/SKILL.md (Observed 2026-10-04). Label: unverified.
- [src-073] Hybrid token skill. (n.d.). file:///Users/gqadonis/Projects/hybrid-mobile-architecture-src/skills/hybrid-design-tokens/SKILL.md (Observed 2026-10-04). Label: unverified.
- [src-074] Reference UI fidelity. (n.d.). file:///Users/gqadonis/Projects/hybrid-mobile-architecture-src/skills/reference-ui-fidelity/SKILL.md (Observed 2026-10-04). Label: unverified.
- [src-075] Flutter visual verification. (n.d.). file:///Users/gqadonis/Projects/hybrid-mobile-architecture-src/skills/flutter-golden-ui/SKILL.md (Observed 2026-10-04). Label: unverified.
- [src-076] Branded Docusaurus skill. (n.d.). file:///Users/gqadonis/Projects/hybrid-mobile-architecture-src/skills/build-branded-docusaurus/SKILL.md (Observed 2026-10-04). Label: unverified.
- [src-077] Tauri window customization. (n.d.). https://v2.tauri.app/learn/window-customization/ (Observed 2026-10-04). Label: unverified.
- [src-078] Flutter SafeArea and MediaQuery. (n.d.). https://docs.flutter.dev/ui/adaptive-responsive/safearea-mediaquery (Observed 2026-10-04). Label: unverified.
- [src-079] Flutter adaptive layout tutorial. (n.d.). https://github.com/flutter/website/blob/main/sites/docs/src/content/learn/pathway/tutorial/adaptive-layout.md (Observed 2026-10-04). Label: unverified.
- [src-080] Docusaurus deployment. (n.d.). https://docusaurus.io/docs/deployment (Observed 2026-10-04). Label: unverified.
- [src-081] Docusaurus monorepo installation. (n.d.). https://docusaurus.io/docs/installation (Observed 2026-10-04). Label: unverified.
- [src-082] GitHub Pages custom workflows. (n.d.). https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages (Observed 2026-10-04). Label: unverified.
