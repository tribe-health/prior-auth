# PatientGPT implementation contract

Established 2026-10-04 from the operator's bootstrap request and the local design
sources. This is scope and acceptance guidance for future OpenSpec planning; it
does not mark application work complete or authorize publication.

## Sources and intended surfaces

`docs/design/README.md` identifies the prototype as the reference for web, Tauri
desktop, and Flutter mobile. Read the storyboard as the workflow guide and the
prototype HTML/CSS/JavaScript as the interaction and visual reference. Keep the
published `patient-chat` filenames intact; the displayed product name is
PatientGPT.

Also read the proposed `docs/design/data-model.md` and
`docs/design/schema/patient-gpt.sql`. They extend the existing workbench with
conversations and workflow projections; clinical facts remain in its `aso`
records and mutations use its authorized command paths. Do not build a second
clinical database. Proposed DDL is input to schema review, not proof that its
constraints, ownership rules, or permissions have run successfully.

The requested architecture source is
`/Users/gqadonis/Projects/hybrid-mobile-architecture-src`.
Read `skills/hybrid-mobile-architecture/SKILL.md`, then its
`references/arch-standard.md`, before architecture decisions. Its inspected HEAD
was `c9b3e2d4ca16322de83f9210cf1e97d2480ef004`; that identifies the checkout snapshot,
not proof of clean source or a certified dependency set.

The architecture provides React/Tauri desktop, React web through Axum, Flutter
mobile through typed Rust FFI, a shared shell-independent core, UAR runtime and
tool governance, and typed A2UI/AG-UI ContentBlock events. Feature-based clean
architecture keeps presentation separate from domain rules and data adapters.
Shell adapters depend on the core; the core does not depend on a shell.

Assistant UI supplies React chat behavior. The entity graph owns normalized
durable data and freshness, with lists holding ordered identifiers. Zustand owns
transient UI state only. Riverpod owns Flutter presentation state. Networking,
agent execution, and clinical mutations belong behind trusted Rust services and
host adapters. Do not copy the prototype's mutable global object as the
production store or its scripted runs as a second agent runtime.

Read the architecture source's platform, sync, privacy, and runtime references
when planning those boundaries. Assign each record a sync lane and privacy class
before schema work. Local data and its derived embeddings remain local at the
sync boundary. Plan the session and independently classified tool-effect
boundaries before execution. Use actual project-local manifests to establish
build commands; none exist for the application at bootstrap time.

## Product and workflow model

The user is a practice team member working on authorization evidence. A patient
owns the longitudinal chart; a case represents one authorization. Case status,
blockers, and next action derive from the case record. A conversation can cover
all patients, one patient, or one case. History restores its original scope.
When a case-specific request begins outside a case, preserve the request while
asking the user to select the case.

For production, the proposed data model retains `aso.cases.status` as host-written
authority; the prototype's derivation is an expected-state check rather than a
second stored status. It proposes scoped web/desktop replication and API reads
without a Flutter replica. Reconcile these application-specific choices with
the hybrid architecture before schema or sync implementation; do not silently
replace them with the architecture package's generic persistence defaults.

Every agent report uses CASE, CRITERIA STATUS, CONFLICTS, BLOCKERS, NEXT MOVE.
Ask one question at a time and show no approval odds. Criteria have three states:
`met`, `gap` (documented shortfall to argue), and `void` (missing documentation
to obtain). A filed source document can change a criterion. A surgeon's answer
is an attributed statement, never manufactured chart evidence.

The app owns the Policy, Governing section, Pathway, and Operative plan gate
controls, signing, packet submission, and recorded call outcome. Agent-generated
surfaces cannot render or invoke these as independent authority. In production,
enforce clinical authority at gateway policy, application capability, and
persistence boundaries independently. Neither administrators nor agents acting
for surgeons acquire the surgeon's authority by association.

Generated assertions carry source document, page, and date. Unsupported claims
are excluded and shown as such (the prototype uses “Not asserted in this
letter”). Source citations navigate to the applicable document. Keep PHI within
the inherited practice boundary and permitted inference policy; no real patient
data enters fixtures, logs, or commits.

Case Files contains generated records, criterion evidence, governing policy,
and remaining chart. Patient Files groups generated records by case and lists
the whole chart newest first. Preserve record viewers, citation navigation,
search-to-conversation context, composer attachments, and interrupted/streaming
run behavior.

## Visual fidelity

`docs/design/patient-chat/tokens.css` is the visual reference for role tokens,
light/dark themes, typography, shape, motion, and focus. Preserve Playfair
Display headings, Mulish body/UI text, and JetBrains Mono metadata. The light
theme has warm neutral surfaces, navy fields, deep ember actions, and vivid
ember for the mark. Preserve existing met/gap/void semantic colors, including
the reference's green met state; this is the operator-selected PatientGPT
reference, not a new decorative palette. Add no new chromatic family.

Flat 2.0 separates areas with fill and spacing. Preserve the absence of visible
borders, divider lines, outlines, and layout shadows while retaining visible
keyboard focus through fill swaps. Implement one generated token source for
the application shells, seeded from the prototype; do not independently tune
web, desktop, and Flutter copies. The generator and application token paths
must be established in implementation planning rather than presumed to exist.

Use `shell.css`, `thread.css`, `surfaces.css`, and `panel.css` for proportions
and responsive behavior. Reference dimensions are a 268px sidebar, 48rem
conversation column, and 360px Files panel at widths of at least 1100px.
Below 768px, navigation becomes a drawer, Files a bottom sheet, and document
viewing full screen. Intermediate widths overlay Files. Preserve the docked
composer, safe-area spacing, coarse-pointer targets, and reduced motion.
Native surfaces should retain behavior and hierarchy while using platform units.

Measure actual contrast, keyboard behavior, reading order, and overflow in both
themes and each applicable surface. CSS comments state targets; they are not
accessibility test results. Each evidence state requires text and a shape.

## Workflow acceptance inventory

Source: `docs/design/patient-chat-storyboard.html`. Convert each row into
traceable OpenSpec scenarios and local integration evidence during planning.

| Reference scenario | Required behavior |
|---|---|
| Kaminski fusion | Catch up, clarify symptoms, request the lab, attach the fax, affirm gates, draft, sign, and submit. |
| Delgado | All criteria met proceeds through gates, cited letter, signature, packet, and receipt. |
| Brennan | Prepare a cited peer-to-peer discussion, capture an attributed surgeon statement, produce the brief, and record the outcome through host controls. |
| Vasquez | An attached MRI changes the criterion; an answer about prior care cannot manufacture evidence. |
| Raman | Check status, inspect the receipt, attach the determination, and derive approval from that document's content. |
| Closed Kaminski injection | Retrieve the signed letter, packet, receipt, gates, and determination. |
| New case | Select a patient, name the procedure, confirm policy, and reuse that patient's chart documents. |

Also cover the storyboard's nine navigation examples: initial global view,
patient selection, case selection, case history, patient history, global
history, case Files, patient Files, and phone layout. Cross-surface parity must
include the actual resulting state, persisted records, and authority checks.
Do not mark a path finished because its controls are visible.

## Delivery and proof boundaries

Default to the installed `patientgpt-delivery` team as described in the root
instructions and `TEAM.md`. Use the actual manifest and assigned role ownership.
Identify ownership of shared contracts and native bridges in the implementation
plan so independent shell work does not fork the domain model.

All tests run locally. At the applicable completion boundary, exercise the real
application entrypoint and collaborators with synthetic data. CI may build,
lint, typecheck, format, and package, but must not run tests or supply test
acceptance evidence. Device evidence must identify the actual device; simulators
and compilation cannot certify physical-device behavior. Report Passed,
Build-only, Blocked, or Failed with commands, output, and evidence paths.

The uncomfortable thing is that the prototype resets on reload and uses fixed
identity and scripted state transitions. Its AG-UI/A2UI-shaped streams and
allowlists are design references, not verified protocol or clinical security
implementations. Search uses deterministic concept/literal vectors, not a
production embedding model. Source viewers show synthetic excerpts, not page
images. Letter revision after newly filed evidence and appeal-letter drafting
are explicitly absent in `flows.js`; surface these as planning gaps, never
silently certify them or expand their scope from placeholder copy.

The proposed data model also leaves coordinator submission authority, appeal
drafting, event retention, and automatic policy matching open. Carry these
questions into the relevant specification; do not resolve clinical authority
by inference from a prototype control.

Bootstrap leaves application implementation, exact dependency selection, KBD
project initialization, EHR/payer integration, persistence,
and physical-device acceptance pending. The architecture source itself mixes
older version references with its pins; reconcile them using official sources
before introducing dependencies. The installed OpenSpec 1.14.0 setup is already
present and must not be downgraded to the source checkout's older example pin.

## Team and delivery specification — 2026-10-04

The installed development roster is `.agent-team/patientgpt-delivery/team.json`;
`TEAM.md` explains ownership and native support. This supersedes earlier deferred
team installation notes. `docs/product/team-product-brief.md` owns acceptance and
`docs/plan/patientgpt-delivery-cadence.md` owns 120-minute increments across full
phases. Tests/review only at full-phase completion; web build each increment, full
web/Tauri builds every even increment. No CI tests.

Operator targets: shared React code, TypeScript 7.0/kebab-case; PGlite browser;
SurrealDB 3.3.0 embedded desktop; shared Rust storage ports; Axum/Postgres via Forge
and Fabric; Kratos/Gate identity; UAR registered components and AG-UI. Research
records PGlite memory, native credentials, Gate/Envoy and runtime catalog gaps;
none is waived by this specification. See `.prometheus/team-research/`.
