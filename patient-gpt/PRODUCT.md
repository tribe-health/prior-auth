# PatientGPT

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Stack

Operator-selected React shared by web and Tauri, TypeScript 7.0 with kebab-case
filenames, Flutter mobile, and shell-independent shared Rust services. Browser
PGlite; desktop embedded SurrealDB 3.3.0; web Axum/Postgres through Flint Forge
and Fabric. Kratos identity with Flint Gate policy. UAR owns agent execution,
AG-UI streaming and registered A2UI components. Exact integration compatibility
is implementation work, not established by this record.

## Users

Surgeons and prior-authorization staff at Advanced Spine & Orthopedics, carrying
out the staff workflows documented in `docs/design`. This records the existing
reference audience. A patient-facing portal is not established by that reference.

## Product Purpose

A chat-first workspace for assembling cited evidence, finding missing chart
material and completing prior authorization through trusted clinical controls.
Patients own charts; cases organize authorization work and scoped conversations.
The full seven-scenario reference is `docs/design/patient-chat-storyboard.html`.

## Operating Context

Users move between global, patient and case conversations, Files, source viewers,
chart search and clinical case state. Evidence comes from filed documents.
Conversational answers remain attributed statements until supported by evidence.
The existing ASO workbench owns clinical truth and authorized clinical commands.

## Capabilities and Constraints

Implement all referenced workflows across the shared React web/desktop interface
and matching Flutter mobile experience. Preserve the three evidence states
`met`, `gap`, `void`. Assertions need document, page and date citations.
Affirmation, signature, submission and outcomes are trusted host controls;
agents and administrators do not inherit surgeon authority. Keep PHI, tenant
and practice boundaries intact; examples and development data are synthetic.
No query cache or competing client agent execution loop.

## Brand Commitments

The operator explicitly made branding and layout in `docs/design` authoritative.
Preserve that identity, both themes, reference typography, semantic state labels,
and responsive behavior. Voice is concrete, plain and unhurried: state what the
chart shows and name missing evidence. Craft skills support this source.

## Evidence on Hand

`docs/design/README.md`, `patient-chat-storyboard.html`, `patient-chat.html`, and
`patient-chat/` provide product usage and simulated UI references. The proposed
data model and SQL in that directory require reconciliation with ASO storage.
A clickable prototype is not proof of runtime, clinical, deployment or device
behavior. Research and integration gaps are under `.prometheus/team-research/`.

## Product Principles

- Complete visible user flows with durable state, not disconnected screens.
- Preserve shared clinical truth and distinguish statements from source evidence.
- Keep clinical authority in independently checked host boundaries.
- Match the supplied design across platforms without duplicating React logic.
- Report builds, local integration and deployed behavior as separate evidence.

## Accessibility & Inclusion

Every evidence state has a text label; color reinforces meaning. Preserve
keyboard navigation, visible focus, readable contrast, reduced-motion behavior
and mobile navigation from the reference contract. Validate the completed
interface at full-phase integration boundaries.

## Open Decisions

Mobile persistent-storage policy, real deployment domain, exact dependency pins
beyond requested targets, and the future Impeccable build-path default remain
unresolved. The detailed delivery acceptance contract is
`docs/product/team-product-brief.md`.
