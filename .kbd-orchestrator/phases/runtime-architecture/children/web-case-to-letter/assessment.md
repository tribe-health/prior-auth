ASSESSMENT: runtime-architecture › web-case-to-letter
Project: Prior Authorization Workbench
Date: 2026-09-16
Codebase baseline: The repository has a reviewed authenticated runtime, authorized realtime projection, evidence timeline, annotations, source preview, and signing of an existing projected letter, but it has no mounted web command path that creates a case, ingests a document, selects payer criteria, or generates either requested letter type.
Cross-tool progress: The parent runtime phase records 20/24 implementation changes complete. This child is new and has no completed changes.

IMPLEMENTATION STATUS
- Verified browser session and practice scope: DONE — RA01, RA12, and RA13 provide the session/startup/account-change boundary used by private routes.
- Case queue and case management: STUB — the case queue route renders RoutePlaceholder. The server cases router defines only GET /api/cases/{case_id}/evidence, and the application router does not currently merge even that route. Create, list, detail, update, and status-transition commands are absent.
- Case intake: STUB — the intake checklist route renders RoutePlaceholder and has no command service.
- Document storage and authorized source reads: PARTIAL — an authorized source-preview read path and local DocumentStore exist, but no multipart upload route, durable ingestion command, processing state, or case-document association is mounted.
- Document extraction and evidence assembly: PARTIAL — durable evidence state, reassessment, annotations, and committed graph projection exist; ingestion does not create document pages/chunks or evidence rows from uploaded case data.
- Payer and policy criteria: PARTIAL — the canonical schema defines versioned policies and provenance-graded criteria, and the host has a read-only CriteriaRepository abstraction, but the web application has no criteria-loading API or implemented policy-panel route.
- Administering-entity resolution: MISSING — the product requires member, plan, and procedure to resolve the responsible utilization-management entity, criteria set, submission channel, and appeal path; the mounted application has no corresponding model or service.
- Prior-authorization letter generation: MISSING — the domain and schema support letters and claims, while the mounted server API only reads a signing target and signs a pre-existing letter.
- Denial ingestion and response generation: MISSING — the schema contains determinations and the prototypes describe denial behavior, but no application command, API, store, hook, or implemented view classifies administrative correction versus medical-necessity appeal, requires human review for low-confidence parsing, or produces the corresponding response letter.
- Letter QA and signing: PARTIAL — an existing projected letter can be reviewed for signing eligibility and signed through the verified clinical boundary; newly generated drafts cannot reach this surface because generation and projection are absent.
- Responsive UI foundation: DONE — the shared component system, application shell, evidence timeline, source preview, and prior browser evidence cover responsive foundations; the requested workflow screens remain placeholders.
- End-to-end browser scenario: MISSING — no local integration run begins with case creation/upload and ends with an initial request plus the corrected-resubmission and clinical-appeal denial branches.

CROSS-TOOL PROGRESS
- runtime-architecture: 20/24 implementation changes complete.
- ra-18-tauri-pglite-baseline: implementation complete at 9/9, but its OpenSpec verify/archive step was interrupted.
- ra-19-native-sqlite-parity: PENDING and deliberately deferred.
- ra-20-safe-browser-updates: PENDING; it does not implement the missing product workflow.
- ra-21-safe-native-updates: PENDING and deliberately deferred.
- ra-22-runtime-certification: PENDING; its current scope cannot certify a workflow that has no planned implementation change.
- web-case-to-letter: 0 changes registered; this assessment establishes its required scope.

SPEC GAP SUMMARY
- The executable schema is materially ahead of the application service layer. Persisted tables alone do not expose an authorized case-to-letter workflow.
- Case creation needs verified practice/actor context, payer/procedure association, an idempotent command result, and entity-graph publication.
- Case management needs tenant-scoped queue, detail, editable intake fields, and explicit lifecycle transitions; create-only behavior does not meet the goal.
- Document ingestion needs bounded synthetic file acceptance, durable metadata and bytes, page/chunk processing state, case association, privacy classification, and an observable failure state.
- Administering-entity resolution is a hard prerequisite: member, plan, procedure, and date must resolve the responsible utilization-management entity, criteria set, submission channel, and appeal path. An unresolved or ambiguous result parks the case and blocks criteria selection, evidence assembly, and letter generation.
- Criteria loading needs version/provenance preservation and a selected policy snapshot that can be cited without treating derived criteria as published payer policy.
- The legacy policy_criteria table and the richer provenance-aware criteria table have no executable bridge; evidence assembly must select one canonical relation before new writes are added.
- Evidence assembly must preserve met, gap, and void, retain document/page/date citations, and keep surgeon annotations distinct from chart facts.
- Letter generation needs explicit purposes for initial prior-authorization request, corrected resubmission after an administrative denial, and appeal after a clinical denial. All require claim-level source provenance; denial responses additionally need a determination source, confirmed classification, and direct treatment of the denial rationale.
- The letters schema cannot currently distinguish those purposes or link a response to its determination, so an additive migration is required rather than storing workflow identity in an untyped data field.
- Generation may prepare a draft but must not inherit surgeon authority, affirm the gate, approve, or sign.
- Before any new record enters the replica, its lane, privacy class, exact allowed columns, tenant predicate, and revocation behavior must be recorded. The server grant/publication registry and PGlite materializer must adopt case summaries, processing state, criteria selections, letters, QA, and determinations atomically; local or unclassified fields remain structurally refused.
- Each command belongs in shell-neutral AppServices and must preserve matching typed HTTP and Tauri wrapper contracts with equivalent refusal semantics. This child accepts behavior only through the browser; Tauri runtime activation, SQLite evaluation, native update work, and device certification remain deferred until the web scenario passes.
- Local full-integration acceptance must use synthetic data and the real web stack; component-only fixtures cannot certify the scenario.
- The clickable prototypes contain no functional case-creation form, real file input, processing state, or denial-response composer. Those views require explicit interaction contracts rather than a mechanical HTMX conversion.
- The uncomfortable fact is that the detailed schema and clickable prototypes make the product appear close to complete while the mounted application still lacks the commands that perform its central job.

BUILD HEALTH
- build check: UNKNOWN — no broad build or integration tier was run during assessment. The working tree contains substantial accumulated changes, so historical green results do not establish current health.
- known violations: The child scope initially permits writes only under its own planning directory and must be expanded to the exact application paths owned by planned changes before execution.
- test coverage: PARTIAL — strong focused coverage exists for session, evidence, source preview, annotations, revocation, and signing; no test covers case creation through generated letters.

CONSTRAINT CHECK
- AGENTS.md violations: NONE observed in the assessment operation. The planned implementation must preserve three evidence states, independent clinical authority checks, shell-neutral aso-host, no query cache, source citations, tenant scope, and local-only integration testing.
- constraints.md violations: NONE established. Current build health is intentionally reported UNKNOWN rather than inferred from historical results.

GOAL PROGRESS
- Create and manage a case in the web application: NOT MET — placeholder route and no create, queue, detail, update, or lifecycle command.
- Upload and process synthetic case documents through the local web stack: NOT MET — authorized reads exist, upload and processing do not.
- Load versioned payer criteria and assemble cited met, gap, and void evidence: PARTIAL — schema and evidence projection exist; criteria selection and ingestion-driven assembly do not.
- Generate and review a cited prior-authorization request letter: NOT MET — signing an existing fixture-backed draft is the only mounted letter action.
- Ingest a denial and generate a cited denial-response letter: NOT MET — no mounted determination parser, human-confirmed classification, corrected-resubmission path, appeal path, or response generator exists.
- Pass the complete workflow in a local browser integration run before native work resumes: NOT MET — no such scenario or result exists.

ASSESSMENT COMPLETE
