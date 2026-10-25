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

## Monorepo deployment and documentation

PatientGPT is within the prior-auth Git root, and the storage worker found no root or nested `.github` directory during inspection. Assign one owner for root workflows, package path filters and docs output. Sibling Gate and Forge deployment workflows target SSR/AKS; they do not establish ownership of know-me deployment [src-018, src-019]. Forge's CI tests conflict with PatientGPT policy and must not be copied. Fabric's docs pipeline provides a build/artifact/deploy separation example [src-020].

Docusaurus should be an isolated package with an explicitly derived public `url`/`baseUrl`, a local production build and separate Pages artifact. Official summaries describe GitHub Pages build/deploy job separation [src-080, src-081, src-082]. The monorepo About URL must use the actual chosen public endpoint; directory placement does not establish that URL. This report authorizes neither publication nor cluster changes. Deployment readiness, DNS/TLS, practice boundary and storage residency are unverified.

## Contradictions and decisions

The ledger retains seven contradictions. Three remain open: desktop SurrealDB version/adapter adoption, native credential translation, and complete custom A2UI catalog integration. Four are resolved as planning interpretations: database opening differs from materializer approval; narrow UAR execution differs from older document-only claims; incumbent product design overrides generic skill styling; and local-only tests override sibling CI examples. Resolved planning interpretation does not upgrade unverified runtime claims.

## Evidence limits and uncomfortable finding

A faithful interface can still emit incompatible events, retain the wrong user's scope, or expose a clinical command without authority. This package cannot certify any of those behaviors. It supplies source-based architecture recommendations and a traceable dependency inventory.

The assembly read local files into numbered excerpts and retained their hashes. Web entries are worker documentation summaries, explicitly not raw fetched pages. Claim labels are conservative: static passages manually adjudicated here are verified only as source statements; other worker summaries remain unverified. The inaccessible docs.rs attempt is blocked. All nonverified claims are named in the appendix. Independent adversarial review is pending; no Feynman or sycophancy model call, live application build, native invocation, integration suite or deployment occurred.

The automated five-dimension scorer was run as required by the research skill, but its scores are not architecture rankings or correctness probabilities. Local file URLs lack domain authority, and source-code punctuation can inflate citation-depth heuristics. Low-scoring sources are retained in the audit record rather than quietly promoted. Do not use these scores to override the user's stack or actual runtime evidence.
