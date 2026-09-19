# web-00 task 3 architecture reconciliation

Date: 2026-09-16  
Phase: `runtime-architecture › web-case-to-letter`  
Change: `web-00-workflow-contract`  
Task: `1.3`

## Result

**Passed.** The active architecture, accepted ADRs, executable design schema, web-00 OpenSpec contract, active RA22 OpenSpec package, and parent phase sequencing now use one web-first contract.

The browser execution order is `web-00` through `web-17`, then `ra-20`, then browser-scoped `ra-22`. Tauri SQLite parity and native updater certification are deferred until the browser result is Passed. The typed Tauri wrapper names remain reserved for command-contract parity; plan revision 10 assigns their implementation to RA19 and RA21 after web-17. Native runtime behavior and evidence do not block or substitute for browser certification.

Every assertion included in a generated external letter now requires a source document, positive page number, and document effective/source date. Annotation and criterion links are optional attribution only. Missing provenance excludes the assertion with the exact message `This assertion has no source document. It will not be included.`

## Reconciled sources

- `.kbd-orchestrator/phases/runtime-architecture/plan.md`: records the operator's web-first override, browser-only child/T2 gates, revised RA22 dependencies, execution rounds, and acceptance traceability.
- `docs/architecture/application-runtime-architecture.md`: links the frozen workflow contract, orders browser product/update/certification before native work, expands the acceptance matrix, and strengthens claim provenance.
- `docs/architecture/README.md`: indexes the workflow contract and its execution precedence.
- `docs/architecture/adr-002-clinical-authority.md`: requires complete provenance for every included claim at approval/signing.
- `docs/architecture/adr-009-authorized-replicas-and-updates.md`: adds the web-first delivery gate and separates later native certification.
- `docs/architecture/react-ui-component-architecture.md`: binds components to the browser-first workflow and complete citation contract.
- `docs/design/schema/schema.sql`: makes `letter_claims.document_id` and `page_number` mandatory; the referenced document already requires `effective_date`.
- `docs/design/schema/schema-ai.sql`: treats criterion and annotation links as auxiliary attribution instead of alternative sources.
- `docs/design/schema/schema-ai-checks.sql`: preserves the derived-criterion attribution probe while supplying mandatory document/page provenance.
- `docs/design/schema/schema-web-capabilities.sql`: registers every browser workflow capability and grants it to the schema's existing `staff`, `surgeon`, and `admin` roles; `letter_approve` remains clinical and document processing remains an internal job grant.
- `docs/design/schema/schema-web-authority-checks.sql`: proves PostgreSQL refuses cross-practice annotation, affirmation, approval, signing, and clinical-case practice reassignment.
- `docs/design/schema/schema-web-letter-flow-checks.sql`: proves one case can store initial and response letters at version 1 and submission attempt 1 without weakening same-case foreign keys.
- `docs/design/schema/schema-web-case-to-letter.sql`: applies the canonical criteria cutover with reconciliation and compatibility checks.
- `docs/design/schema/schema-web-case-to-letter-rollback.sql`: provides the verified reverse cutover used by the local round-trip proof.
- `openspec/changes/web-00-workflow-contract/**`: links the normative matrices and specifies provenance plus web-first order.
- `openspec/changes/ra-22-runtime-certification/**`: scopes RA22 to the assembled browser runtime after `web-17` and `ra-20`, with complete request and denial-response scenarios.

Archived OpenSpec packages were not changed because they are historical evidence. No application source, Tauri configuration, native runtime, mobile source, dependency pin, or generated waypoint was edited.

## ADR-wide consistency scan

All ten ADR files were scanned for weak claim-source language, native-first sequencing, placeholder requirements, and browser/native certification coupling. ADR-002 and ADR-009 were the only accepted records requiring changes. ADR-006 and ADR-007 remain explicitly superseded history. No current ADR permits annotation-only or criterion-only letter assertions, and no current ADR makes native certification a prerequisite for the browser result.

## Commands and observed output

```text
openspec validate web-00-workflow-contract --strict
Change 'web-00-workflow-contract' is valid

openspec validate ra-22-runtime-certification --strict
Change 'ra-22-runtime-certification' is valid

focused local-link and schema contract check
PASS: 14 active contract files have resolvable local links
PASS: letter_claims requires document_id and positive page_number; attribution is auxiliary
PASS: active contracts contain no native-first RA22 dependency or at-least-one-source wording

git diff --check -- <task-owned contract files>
exit 0; no whitespace errors

find docs/architecture -maxdepth 1 -name 'adr-*.md' | wc -l
10
```

The schema contract check also confirmed that `documents.effective_date` remains `NOT NULL`, so a mandatory `letter_claims.document_id` resolves a source date.

The criteria and capability SQL was also exercised against isolated PostgreSQL 18 databases in the local `aso-prior-auth-db-1` container. The baseline schema, AI schema, capability registry, and tenant-scoped clinical-authority probes applied with exit 0. The authority probes printed:

```text
Passed: cross-practice gate affirmation refused
Passed: cross-practice annotation refused
Passed: cross-practice letter approval refused
Passed: cross-practice letter signing refused
Passed: clinical case practice reassignment refused
Passed: same case stores initial and response version 1
Passed: each letter stores submission attempt 1
```

A synthetic policy criterion then survived the complete forward, rollback, and reapply sequence in `web00_contract_test`:

```text
forward|70000000-0000-4000-8000-000000000901|1|2026-01-03 00:00:00+00|1
verify_web00_criteria_rollback
rollback|70000000-0000-4000-8000-000000000901|1
reapply|70000000-0000-4000-8000-000000000901|1|2026-01-03 00:00:00+00|1
admin_submit_grants|0
```

The forward migration preserved the criterion UUID, ordinal, confirmation timestamp, and legacy ordinal. The rollback restored the same criterion identity, reapplication was idempotent, and the reconciled grant table contained no administrator `submit` grant. Broad local integration and actual-browser testing remain reserved for `web-17`.

## Exit

Task 1.3 may close. Task 1.4 must create the deterministic synthetic request, corrected-resubmission, and clinical-appeal fixture manifests and their expected outputs.
