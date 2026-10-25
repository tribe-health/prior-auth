# PatientGPT development-team product brief

Status: specification and planning artifact, 2026-10-04. Application acceptance remains pending. Source of product truth: [design inventory](../design/README.md), [storyboard](../design/patient-chat-storyboard.html), [prototype](../design/patient-chat.html), [proposed data model](../design/data-model.md), and [project contract](../../.prometheus/project-contract.md). Delivery timing and evidence rules live in the [cadence plan](../plan/patientgpt-delivery-cadence.md).

## Product outcome

A practice team member can open a patient's chart, select an authorization case, ask what is missing, inspect the cited evidence, obtain missing documents, and complete the appropriate authorized workflow. The same clinical records and permissions serve React web, Tauri desktop, and Flutter mobile. PatientGPT preserves the prototype's chat-first layout, branding, two themes, Files and document viewers, and responsive interactions. A patient owns the chart; a case owns one authorization; conversations preserve their global, patient or case scope.

The development team builds this product. Its product manager, team lead and UAR agent-building expert are development roles, not deployed clinician personas or UAR runtime identities. Product agent definitions and their private deployment bindings are separate deliverables.

## Accountable roles

| Role | Product accountability | Required handoff |
|---|---|---|
| Product manager | Own complete storyboard coverage, usable demo scripts, acceptance state, copy and unresolved product choices. Prevent builds from closing workflow backlog. | Scenario ID, initial synthetic state, user actions, expected records and permission outcomes, shell parity requirements. |
| Team lead | Own phase scope, dependency order, disjoint write roots, contract freeze, build writer, two-hour cuts and final reconciliation. | Named owner per contract, complete production change set, exact build/demo receipts, boundary decision and repair assignment. |
| UAR agent-building expert | Own executable product-agent authoring, registered catalog extension, effective binding, AG-UI/A2UI profile mapping and governed tool integration. | Immutable definition/package references, supported required semantics, admitted component/action schemas, event examples and explicit runtime limits. |
| Host/domain and storage owners | Reuse ASO authority and clinical truth; implement session, tenant, document, conversation and projection persistence behind trusted services. | Typed reads/commands, record lanes/privacy classes, authorization outcomes, authoritative revision and synchronization rules. |
| React, Tauri/bridge and Flutter owners | Preserve the same workflow and source navigation with native platform behavior and shared generated contracts. | Registered renderer coverage, running demo instructions and unresolved platform gaps. |
| Identity/deployment/docs owner | Own Kratos/Gate/Envoy integration, local service instructions, deployment provenance and documentation publication. | Verified session/route contract; actual commands; verified public docs URL before adding About link. |
| Integration verifier and artifact critic | At the end of the full phase, independently assess the complete artifact and run real local integration paths. Dormant during implementation. | Observed commands/results, defects, and scoped Passed/Build-only/Blocked/Failed evidence. |

## Non-negotiable behavior

Reports contain CASE, CRITERIA STATUS, CONFLICTS, BLOCKERS and NEXT MOVE. Ask one question at a time. Show no approval odds. `met`, `gap` and `void` retain different meanings, labels and shapes. A documented shortfall is argued; missing documentation is obtained. A surgeon's answer is an attributed statement and never silently becomes chart evidence. An assertion requires a source document, page and date; unsupported assertions are excluded visibly.

The trusted app owns Policy, Governing section, Pathway and Operative plan affirmation, signing, packet submission and recorded call outcome. Agents cannot invoke those as independent authority. Gateway policy, AppServices capabilities and persistence enforce clinical permissions independently. Administrators and agents acting for surgeons do not inherit surgeon signing authority. Data remains within the inherited PHI and tenant boundaries; repository fixtures and demo data are synthetic.

The entity graph owns durable entity freshness and lists of IDs; Zustand owns transient UI state, and Riverpod owns Flutter presentation state. Rust owns networking, agent execution adapters and host commands. UAR owns agent runs, model routing and tool governance. No component networking, query cache, duplicate clinical database, or application-owned competing agent loop.

## Product acceptance inventory

Every row must pass the final local full-phase integration gate through actual production entrypoints and collaborators on its claimed surfaces. A visible control, scaffold, screenshot, manual demo or successful build cannot close a row by itself.

| ID | Storyboard scenario | Required resulting behavior and records | Planned completion phase |
|---|---|---|---|
| PG-01 | Kaminski fusion, PA-2026-0431 | Catch up; clarify left-calf symptoms as a statement; send the scoped lab request; file the Northgate fax; reflect document-backed criteria; affirm four gates; draft a cited letter; authorized sign/submit; retain packet and receipt. | Phase B |
| PG-02 | Delgado ACDF, PA-2026-0447 | All-met criteria still require four host gate affirmations; read a cited letter; authorized signature and submission create packet and receipt visible in chat and Files. | Phase B |
| PG-03 | Brennan peer-to-peer, PA-2026-0419 | Create cited talking points and brief; retain why therapy stopped as an attributed statement; host records the actual call outcome with actor and provenance. | Phase C |
| PG-04 | Vasquez evidence assembly, PA-2026-0452 | Filing the outside MRI changes the supported imaging criterion; answering prior-care questions leaves an unsupported gap unpromoted. | Phase B |
| PG-05 | Raman determination, PA-2026-0398 | Check recorded payer status and receipt; file the determination; derive approval from its content/provenance, never from an assistant guess. | Phase C |
| PG-06 | Closed Kaminski injection, PA-2026-0212 | Open the historical signed letter, packet, receipt, gate record and determination, preserving case scope and provenance. | Phase A |
| PG-07 | New case from Delgado's chart | Choose patient/procedure, create and select the case, confirm policy through the approved host workflow, and reuse the patient's existing documents without copying clinical truth. | Phase C |

Cross-cutting acceptance covers all nine storyboard navigation examples: initial global view, patient selection, case selection, case history, patient history, global history, case Files, patient Files and phone layout. Search opens the correct conversation/context; ambiguous case-specific requests preserve the original request through selection. Composer attachments, streaming/interruption, reload/reconnect, document viewers and source-page navigation retain scope and durable state. Test equivalent results across web, Tauri and Flutter; compilation or simulator evidence never certifies physical-device behavior.

The full registered UAR catalog extension is required. The prototype's `aso.workbench/v1` component vocabulary includes clinical projections absent from UAR's current nine-component primitive catalog. Deliver a versioned approved catalog/schema, runtime admission/registration, generated Rust/TS/Dart contracts, registered React/Flutter renderers and governed action routing for the complete required vocabulary. Primitive composition or host ContentBlocks in the first increment is transitional and does not close this requirement. Host clinical controls remain outside agent authority even after registration.

## Acceptance backlog, separate from build receipts

The PM keeps scenario and cross-cutting requirement states with owner, phase, blocker and final integration evidence. Build receipts list what compiled and which artifact was produced. Demo receipts list what a human exercised and observed. Neither automatically changes product acceptance to Passed. The lead records device, session, persistence, provider and protocol limitations explicitly.

Open decisions from the design are coordinator submission authority, appeal-letter drafting, event/surface retention and automatic policy matching. Letter revision after newly filed evidence is also absent in the prototype. Keep each as an explicit decision/backlog item with owner; do not silently claim it implemented, drop it from discussion, or invent clinical authority to satisfy the schedule. Clarify the release scope for appeal/revision before claiming full workflow closure.

Browser PGlite and the requested embedded SurrealDB 3.3.0 desktop direction require deliberate adapter and policy decisions; existing source does not establish production-ready persistence. Preserve authoritative ASO records and reconcile proposed Flutter API-only reads with any requested native persistence. Kratos identity, Flint Gate policy, Forge storage and Fabric replication have distinct roles. Reuse the existing Envoy deployment in context `know-me`; do not infer working external authorization from resource readiness.

Documentation publication is separate from local builds and demo acceptance. Add a working About link to the application only after the intended Pages site is published and its exact URL/content/assets are verified. Do not ship a guessed URL, placeholder link or prototype IPNS URL labeled as the documentation site.

The uncomfortable thing: completing all screens can still leave fabricated clinical state, incompatible agent events or a failed session boundary. The product is complete only when the final production-path integration evidence supports the workflow and authority claims.
