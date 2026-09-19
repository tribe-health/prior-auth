## Context

The Workbench persists letters, claims and QA results in Postgres under three-layer clinical authority (ADR-002) and the three evidence states (ADR-003). No template engine exists in the repository. A prototype engine (isolated crate, MiniJinja `=2.24.0`, `sha2 =0.10.9`) passes four behavior tests and a sabotage run of its coverage guard; it has touched no ASO module, database or runtime surface.

## Goals / Non-Goals

**Goals:** One contract for every generated document: typed kind and class; clinical text only as claims whose provenance maps to `letter_claims`; QA findings for the seven existing `qa_check_types`; deterministic canonical output and a content hash covering kind version and template package digest.

**Non-Goals:** No evidence-state assignment by the engine. No signature from caller data. No generated clinical findings in source documentation. No second store for generated letters. No changes to the active ra06 phase.

## Decisions

Open, to be resolved in one sitting (DA-0):

- D-1 Engine home: workspace crate, DocuMind, or standalone crate consumed by both. Recommended: standalone, domain-agnostic, linked in-process by `aso-host`.
- D-2 Connective prose: templates only, model narrative, or hybrid with claim markers. Recommended: hybrid, gated on G-MEASURE for clinical-sentence detection; templates only until measured.
- D-3 Persistence: `letters` with a kind reference for signable correspondence; internal work products render on demand.
- D-4 Template publishing: `publish_template` capability, two-person approval for correspondence classes, immutable once used by an approved letter.
- D-5 PDF backend: Typst if a two-machine reproducibility test passes; otherwise Chromium with the artifact hash recorded at render.
- D-6 Source-documentation assist: checklist and scaffold only; never authors findings; never cited until signed in the EHR.
- D-7 Engine pin: `=2.24.0` with the `serde` feature; `3.0.0-alpha.0` is a pre-release. Hand edit to `versions.toml` under G-PIN.
- D-8 Procedural correspondence signer: surgeon or a distinct administrative signing capability; ADR-002 forbids administrator letter signing.

Invariants regardless of outcome: evidence states are read from `case_evidence`; `gap` routes to the surgeon and `void` to the coordinator; thresholds produce QA findings, never states; a signature renders only from a signing receipt whose content hash equals the assembly hash.

## Risks / Trade-offs

Claim provenance is guaranteed by construction; clinical text typed into template prose is not, and only governed review (D-4) closes that channel. A correctly formatted citation to a mis-extracted page looks authoritative; ra-16 source preview is the control. Deferring the request-versus-operative-report reconciliation leaves the system able to produce a letter the operative report later contradicts.

Use synthetic data only. Preserve three evidence states, independently enforced clinical authority, generated tokens and no query cache.

## Validation and rollback

T1 per unit: engine tests at the claim, coverage, hash and refusal boundaries, each guard demonstrated red under sabotage. DA-4 is tested at the actual boundary: a real transaction writing letter, claims, QA and audit, with an agent principal and an administrator refused. DA-5 requires a reproducibility measurement across two machines. Schema steps are additive; existing letters are backfilled to the initial-request kind. A failed prerequisite leaves dependent work unstarted and this change Blocked.
