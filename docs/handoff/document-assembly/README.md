# Document assembly — handoff from the 2026-09-10 session

Source: claude.ai share `9bd9f1ba-3587-407d-98c6-40ad4a1887d7` (Travis James, 2026-09-10).
Superseded where it conflicts by `openspec/changes/da-01-document-assembly-agent/`.

| File | What it is | Status |
| --- | --- | --- |
| `FINDINGS-2026-09-19.md` | Findings F-1..F-6, what was built, the service definition, and the four adjustments the running child must make. | Current. Read first. |
| `../codex-document-assembly-adjust.md` | Codex prompt that applies the adjustments as plan revision 11 without moving the waypoint. | Current. |
| `ASO-DA-SPEC-001.html` | Document assembly: the generation and QA contract. Six document classes, three kinds of text, six defects in the earlier package, decisions D-1..D-8, build plan DA-0..DA-7. | Specification of record. D-1 closed 2026-09-19 (agent service, see decisions.md). |
| `openspec-draft-2026-09-10/` | The proposal/design/tasks drafted that day for `da-00-document-assembly-contract`. | Folded into `da-01-document-assembly-agent`. |
| `clinical-docs-prototype-2026-09-10.zip` | Isolated engine prototype, 4 tests. | Superseded by `crates/clinical-docs`. |
| `spine-pa-templates-2026-09-10.zip` | MiniJinja package: 53 templates, code catalog, enrichment gates, 12 synthetic fixtures, 17 tests. | **Not integration-ready.** Reverses ADR-003 `gap`/`void`; assigns evidence states in `enrich.rs`; renders a signature from `affirmation.affirmed`; free-text clinical fields. Source material for DA-1 only. Do not load into the agent. |
| `aso-prior-auth-template-system-2026-09-10.html` | Reference document for that package (variables, partials, diagrams, rendered examples). | Its evidence-state section states the reversed meanings; treat as wrong until DA-1 lands. |
| `prior-auth-denial-response-template-2026-09-10.md` | The first, carrier-general denial response template (Jinja syntax). | Source material for DA-1. |
| `sample-initial-request-lumbar-fusion-2026-09-10.pdf` | Rendered sample initial request on ASO letterhead (synthetic patient). | Reference for the DA-5 PDF target. |

Also in Google Drive: `Surgery_Authorization_AI_App_Design_Spec_for_Travis.docx` (Kevin James, 2026-09-02) and the reconstructed UHC L5-S1 letter in the shared folder "Danny Hodge - UHC L5-S1 Fusion Auth - 2026-08-24"; the BCBSMA "Auth Engine v0.9" prototype (Claude Design, 2026-09-02) is a claude.ai artifact.
