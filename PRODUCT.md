# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Prior authorization coordinators manage the queue, records, policy evidence, submissions, and insurer follow-up. Surgeons review criteria, contribute clinical reasoning, affirm the four drafting gates, approve letters, and prepare for peer-to-peer review. Practice administrators manage access, integrations, and audit posture.

## Product Purpose

The Prior Authorization Workbench turns a surgical decision and its source chart into a cited, reviewable authorization letter and a traceable submission workflow. Success means a coordinator can take one synthetic demo case from committed case data through evidence review and a generated letter without leaving the web interface.

## Positioning

The product keeps every generated clinical assertion attached to a document, page, date, and source hash while separating chart gaps from chart silence. It will not generate prose until policy, governing section, pathway, and operative plan are confirmed.

## Operating Context

The work happens in a deadline-ordered case queue, usually on a desktop. Surgeons also review criteria and affirm decisions from a narrow browser between clinical tasks. The system connects practice, payer, policy, chart, document, and authorization entities while Ory Kratos owns user sessions.

## Capabilities and Constraints

- The browser is the first certified platform; the React project also supports a later Tauri desktop shell.
- PGlite receives authorized Electric shapes through Flint Realtime Fabric and publishes committed projections into the PEM Zustand graph.
- Clinical evidence has exactly three states: `met`, `gap`, and `void`.
- Administrators cannot affirm clinical gates or sign letters. Agent principals inherit no surgeon authority.
- Patient data stays closed until the verified session and coherent local projection are ready.
- Every included assertion needs a source citation. Missing-source assertions are omitted with a specific explanation.
- Query caches are prohibited; lists hold ordered entity identifiers and views rejoin graph records.

## Brand Commitments

The application is an Advanced Spine & Orthopedics product. The approved sources are `docs/aso-brand-guide.html`, `docs/aso-brand-template.html`, `docs/aso-moodboard.html`, the ASO SVG assets, and `docs/design/prototype/**`. The voice is plain, unhurried, specific, and clinical. Ember is the single warm accent, slate/navy is the cool family, and the warm neutral surface ramp carries hierarchy.

## Evidence on Hand

- Product behavior and personas: `docs/aso-mvp-spec.html`
- Visual identity: `docs/aso-brand-guide.html`, `docs/aso-brand-template.html`, `docs/aso-moodboard.html`
- Approved prototype interactions and layouts: `docs/design/prototype/`
- Logos and application marks: `docs/aso-logo.svg`, `docs/aso-icon*.svg`
- Synthetic demo data only; no real patient data may enter source, fixtures, screenshots, or logs.

## Product Principles

- Show the source and consequence of each decision.
- Route a gap to a surgeon and a void to a coordinator.
- Keep the active deadline, case, and next action visible.
- Preserve one coherent case projection across screen sizes and shells.
- Refuse premature drafting instead of presenting plausible but unsupported text.

## Accessibility & Inclusion

All browser surfaces target WCAG 2.2 AA. Status is never communicated by color alone. Primary touch targets are at least 44 CSS pixels, keyboard focus remains visible, and motion has a reduced-motion path.
