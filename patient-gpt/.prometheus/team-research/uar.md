# UAR and protocol ownership research

Observed 2026-10-04. PatientGPT phase: `spec`, waypoint `bootstrap`. This is a static-source research artifact, not application implementation or runtime certification. UAR checkout HEAD: `a7cb972992d4f83db6585449ea81af0fe4a1c990`; architecture checkout HEAD: `c9b3e2d4ca16322de83f9210cf1e97d2480ef004`. Dirty-worktree status was not established; HEAD alone does not identify every inspected byte.

## Team recommendation

The **development team** builds PatientGPT using the development harness. Its role files, write roots, handoffs, and review schedule do not become deployed UAR agents. **Product agents** are versioned UAR definitions, packages, and private runtime bindings operated inside PatientGPT. Creating either does not install the other.

| Required role | Exact responsibility | Proposed exclusive write roots, all new/planned |
|---|---|---|
| Team lead | Own scope, dependencies, shared integration decisions, one build writer, phase closure; reconcile specialists; keep critics dormant during implementation. | `.agent-team/`, `docs/plan/`, `contracts/` |
| Product manager | Own storyboard traceability, usable-flow acceptance, report language, unresolved authority questions, and evidence-versus-statement rules. | `docs/product/` |
| UAR agent-building expert | Author/import immutable product agents; resolve model/skill/tool requirements to effective binding receipts; implement the governed Rust UAR adapter; specify prompt/report and protocol semantics; own the product agent catalog, not shell widgets. | `runtime-agents/`, `crates/patient-gpt-uar/` |
| Host/domain specialist | Own clinical authorization, case/document/conversation scope, durable projections, session checks and host command handlers. Reuse existing workbench authority. | `crates/patient-gpt-host/`, `crates/patient-gpt-domain/` |
| React specialist | Register and render approved components, Assistant UI projection, transient UI and entity joins; consume generated shared contracts. | `web/` |
| Flutter specialist | Native component registry, view models, FFI consumption and platform semantics. | `mobile/` |
| Bridge/integration owner | HTTP, Tauri and FFI adapters, generated contract outputs and packaging; sole writer of shared manifests/build output when integrating. | `crates/patient-gpt-api/`, `desktop/`, `generated/`, `scripts/integration/` |

These are proposed reservations, not claims that application roots exist. The lead must reconcile them with scaffold/manifests and sibling workbench roots before dispatch; no overlapping ownership of generated files. Any upstream UAR change is a separately scoped handoff, not permission to edit that checkout. Review/audit/verification roles wake only after the complete coherent implementation set reaches its final local integration boundary.

## Actual UAR authoring and governance

Canonical collaboration authoring is JSON profile `urn:prometheus:uar:collaboration:0.1.0-draft.2`. `AgentDefinition` is immutable and retains full skills plus `modelRequirements`, `promptDialect`, `ragConfiguration`, `contextStrategy`, and `apiHarness`, each with required/value semantics. A `SkillRef` contains ID, version, digest, required, config, entrypoint and requiredTools. Package locks use exact identities and digests; private DeploymentBinding resolves models, skills, policy, budgets and authority references. A private EffectiveBindingReceipt distinguishes requested from enforced semantics. UAR-AGENT-MD is a legacy input adapter; schema validity alone is not activation. [U1]

Recommended product-agent workflow: author the narrow evidence-assistant definition → compile/validate and close immutable references → register/retrieve the package → resolve an owner/workspace runtime binding → inspect field diagnostics and effective receipt → admit an ordinary UAR run. Do not invent a CLI command or a manifest schema from this sequence; derive exact commands from the chosen installed runtime when implementation begins. Keep credentials and private bindings out of portable packages. Development PM and lead roles are not automatically product AgentDefinitions. [U1]

Governed tool admission source binds owner/principal, root/executing run, catalog and policy revisions, runtime/host epochs, descriptor effect and approval class, validated argument digest, leases and budget facts. Application tools therefore need independently classified effects and schemas; MCP descriptions cannot grant authority. Source proves structures exist, not that PatientGPT calls this path. [U2, H1]

Known limits: current source maps `ragConfiguration` to unsupported; a required value blocks activation. Narrow team execution rejects authored history/fork/memory/artifact selections and nested-team/child declarations that lack an effective mapping. Per-attempt selected artifacts are a distinct supported path; they do not make authored context selections work. Do not label all UAR team execution unavailable: a narrower implementation exists, while the older draft.2 README explicitly only certifies document contracts. The migration document also states external crash exclusion lacks a trusted process-tree proof importer. [U3, U4]

## AG-UI contract

Use UAR `stream_mode: "agui_spec"` and profile `uar.agui/1`. Its documented supported families cover run, step, text, reasoning, tools, snapshots/deltas and registered custom events. The profile adds stable `eventId`, sequence, run/thread correlation and replay cursor; cancellation maps to `RUN_ERROR` with `CANCELLED`. `agui`, `dual`, and default `openai` are different wire contracts. Source contains the explicit mode and lifecycle synthesis. [U5, U6]

Current official AG-UI documentation has additional activity/subagent events and an interrupt-aware outcome object. UAR's dated profile excludes draft interruption semantics and uses its own custom approval event. PatientGPT prototype emits `RUN_FINISHED` with a string `outcome` and an `interrupt` field, and `CUSTOM` named `a2ui`; those are design signals requiring an explicit adapter, not a conformant wire contract to copy. [O1, P2]

Handoff envelope must explicitly identify protocol/profile, stable event ID, run/thread, sequence and timestamp, with tenant/case scope supplied by trusted host context. Reducers preserve unknown events as inspectable data; they never treat unknown events or assistant prose as successful completion. Persist only policy-approved event material. Replay, restart, duplicate handling and cancellation remain integration obligations. [H2]

## A2UI catalog and registration

Official A2UI catalogs establish the vocabulary shared by agents and renderers; native implementations remain client-owned. UAR pins A2UI v0.9.1, profile `uar.a2ui/1`, catalog `urn:uar:a2ui:catalog:1`. Its React schema is a closed union: Text, Button, TextField, CheckBox, ChoicePicker, Row, Column, Card, Divider. Rust has the same nine variants. Rendering is a local switch, not dynamic code loading. An arbitrary custom component cannot be registered merely by putting its name in an agent prompt. [O2, U7, U8, U9]

PatientGPT's prototype catalog `aso.workbench/v1` instead contains Column, Row, Section, Text, Citation, Button, CaseHeader, CriteriaList, ConflictList, BlockerList, NextMove, ChoiceQuestion, StaffRequest, ContextList, DocumentList, PointList and Suggestions. These do not all exist in the UAR production profile. The five prototype actions are answer_question, send_staff_request, open_source, set_context and run_prompt. This is a concrete integration gap. [P1]

The agent-building expert and protocol owner must freeze one of two explicit paths before shell work: (a) compose UAR's admitted primitives and retain rich clinical projections as typed host ContentBlocks; or (b) establish a versioned PatientGPT catalog extension accepted by the runtime and all renderers. Path (b) needs a separate upstream/runtime change if using current UAR validators; a PatientGPT-only renderer addition does not suffice. Prefer path (a) for the first usable flow, preserving required information and visual hierarchy through trusted host components. Do not relabel custom payloads as the existing UAR catalog.

Each component handoff requires: catalog/version/type ID; strict props and binding schema; source/data ownership; action allowlist with typed input/output and effect; Rust source type; generated TS/Dart mirrors; React/Flutter renderer registration; loading, unavailable, denied and unknown states; accessibility behavior; and final local integration scenario. UAR's Rust accepts a v0.9/basic-catalog compatibility alias while the React schema is strict v0.9.1/UAR catalog; normalize deliberately at the adapter seam and verify the transmitted form. [U7:118-149, U8:250-289, H3]

A2UI buttons dispatch named data to an `onAction` callback; a schema-valid name is not clinical authorization. Clinical gate affirmation, signature, packet submission and recorded call outcome are exclusively host controls. They require gateway, AppServices and persistence checks, including a distinct agent principal. The runtime agent can request attention or produce a cited draft; it cannot acquire a surgeon's authority through a role label. Criteria change from filed documents; answers remain attributed statements. [U9:77-90, P3]

## Handoffs and a two-hour usable-flow candidate

Freeze shared contracts before parallel implementation: authenticated scope and case projection; document/page/date citation; three-state criterion; conversation/run event projection; component catalog; governed action intent; host command result with updated revision. PM supplies one accepted scenario and expected record changes. UAR specialist supplies immutable definition references, effective-binding requirements and admitted event examples. Host specialist supplies actual authorized read/command entrypoints. Shell specialists report mapped component IDs and unresolved behavior. Lead owns integration and records exact failures without substituting simulated success.

A bounded first flow is: open a synthetic patient/case → ask “catch me up” through the actual UAR adapter → stream the five-section report → inspect criterion states and open a cited source → reload and recover conversation/case scope. It is useful without claiming gate/sign/submission completion. Follow-on two-hour phases can complete document filing and criterion change, then host-owned gate/draft/sign/submit workflows. Scope and authority decisions remain prerequisites; timing is a planning target, not a promise that absent infrastructure can be created and qualified in two hours.

Proposed phase allocation: 0–15 minutes scope/contracts; 15–90 implementation of all required production collaborators; 90–120 a single end-of-phase local integration gate and fixes. Reviewers remain dormant during implementation. At that boundary exercise the real shell → Rust host → UAR → persistence path with synthetic data, including reload/reconnect, a forbidden agent clinical action, a cross-case source request and unsupported component. Run applicable platform entrypoints only after the coherent set exists. No CI tests, mock-only completion evidence, or per-edit tests. If the prerequisite service/model/authentication path cannot operate, record Blocked; if only compilation succeeds, record Build-only. Physical-device parity stays unverified until run on a named device.

The uncomfortable thing: an attractive faithful chat screen can still use incompatible wire events, silently lose scope on reload, or expose a clinical action with no authority behind it. Source inspection and package registration do not close any of those runtime claims.

## Research evidence and limits

Only this dossier and `uar-sources.json` were written. No UAR/application code, installed binding, shared manifest, service, clinical record or permission was changed. No guard code was added. Research used local source reads plus Context7 resolve→query for `/ag-ui-protocol/ag-ui` and `/a2ui-project/a2ui`, and the linked official pages. No runtime or test command was run; local full integration, current installed-runtime behavior, persistence, device behavior and protocol conformance remain unverified. Source IDs below resolve in the adjacent JSON inventory with absolute paths and line ranges.
