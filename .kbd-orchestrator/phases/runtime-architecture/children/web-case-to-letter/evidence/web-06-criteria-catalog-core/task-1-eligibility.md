# Web-06 task 1 — eligibility and ownership

**Date:** 2026-09-18  
**Phase:** Execute — `runtime-architecture / web-case-to-letter`  
**Change:** `web-06-criteria-catalog-core`  
**Task:** 1 of 6 — dependency, ownership, contract, and decision-gate eligibility  
**Result:** Passed

## Canonical position and dependencies

The canonical KBD receipt is `task-1-canonical-status.json`. It records `web-00-workflow-contract`, `web-03-administering-entity-resolution`, and `web-05-document-processing-ui` as complete with complete implementation. Web-06 depends on Web-03 and Web-05, so its implementation dependencies are satisfied. The OpenSpec surface contains six incomplete tasks before this receipt; this artifact satisfies only ordinal 1.

The generated `exactNextWork`/`exactNextCommand` projection still points at Web-01 even though the detailed canonical changes show Web-01 through Web-05 complete. Detailed canonical task state and the reviewed child plan govern this task; the stale shortcut is not used to select work.

## Frozen Web-00 contracts

Web-06 owns the browser criteria catalog boundary:

| Operation | Browser contract | Authority |
|---|---|---|
| Import catalog | `POST /api/criteria/catalog` | verified administrator with existing `configure` capability |
| List catalog | `GET /api/criteria/catalog` | verified, tenant-scoped read |
| Read criterion | `GET /api/criteria/{criterionId}` | verified, scope-filtered read |
| Recover import result | `GET /api/criteria/catalog/commands/{commandId}` | same authorized root catalog scope |

The import body carries a stable command ID and expected `criteriaCatalogRevision`. A successful receipt advances both command-result and catalog revisions. Conflicting replay must refuse. Typed Tauri wrappers remain reserved for RA19/RA21 after Web-17 and are outside Web-06.

The canonical durable relation is `criteria`. Migrated `policy_criteria` rows retain UUID, payer, policy, section, ordinal, text, mandatory flag, data, timestamps, deterministic SHA-256, and policy effective range. `case_evidence` retains the same criterion UUID while its foreign key moves to `criteria`. The former table remains as a protected legacy table plus read-only compatibility view; all legacy writes refuse.

A criterion can control generation only when its exact source document, page, content hash, and effective range are present. Published rows require policy and section. Obtained-by-request rows require their source document. Verbal, derived, and peer-shared rows cannot be promoted to published policy. Requirement text and evidence grade are immutable; correction creates a superseding row. Overlapping validity for the same payer and label refuses.

The approved publication contract is `criteria_catalog`, classified `trusted mixed provenance`. It contains only the frozen catalog columns. Published public rows may be visible; practice-owned rows require the verified selected practice. Peer/private rows remain excluded unless a later explicit grant exists. Raw document bytes, extracted page text, chunks, embeddings, credentials, command ledgers, and parser diagnostics never enter the shape.

## Decision gates

| Gate | Decision and implementation consequence |
|---|---|
| Dependencies | Passed. Web-03 and Web-05 are complete. |
| Pins | Passed. No dependency or `versions.toml` change is planned. Existing PostgreSQL/Rust contracts are sufficient. |
| Migration | Eligible. `migrations/server/2026090624_criteria_catalog.sql` is available. Task 2 must add it to the checksum ledger and prove fresh plus populated upgrade before enabling canonical callers. |
| Identity and authority | Frozen. Imports use existing `configure` and a verified administrator. Reads use verified identity, selected practice, and tenant scope. No body-selected actor or role claim grants authority. |
| Provenance | Mandatory. Published and obtained rows must satisfy grade-specific source rules. Document/page/date/hash completeness gates controlling use; immutable correction uses supersession. |
| Privacy and publication | Frozen. Durable catalog state lives in PostgreSQL. Only the approved `criteria_catalog` shape may be published; no chart document payload or parser output enters it. Web-06 must not broaden the approved column list. |
| Replica and UI | Web-06 supplies durable catalog plus browser HTTP reads. Web-07 owns PEM/Zustand binding, selection, policy/pathway React views, and browser projection consumption. |
| Native | Not applicable. Tauri and mobile implementation and certification remain deferred until Web-17 passes. |
| Verification | Tasks 2–4 use edit-level T0 checks. Task 5 owns focused T1, provenance-laundering sabotage/restore, artifact refinement, and independent adversarial review. Tier 2 remains Web-17. |

## Assigned ownership

| Task | Owned surface |
|---|---|
| 1 | This eligibility artifact, canonical receipts, and no product edits. |
| 2 | New server migration, migration registry/checksum, focused fresh and populated-upgrade migration probes, legacy compatibility and refusal. |
| 3 | Shell-neutral catalog service/ports as needed, production PostgreSQL criteria repository, document-ingestion reuse, immutable supersession, and focused service tests. |
| 4 | Axum catalog import/list/read/lookup routes, production composition replacing `UnavailableCriteriaRepository`, exact authorization/tenant/replay refusals, and focused mounted HTTP tests. |
| 5 | Applicable T0/T1, provenance laundering red/green proof, artifact-refiner gate, and independent adversarial review. |
| 6 | Mounted-caller evidence, specification/document deltas, strict verification, archive, and truthful completion status. |

## Observed checks

- `openspec validate web-06-criteria-catalog-core --strict` → `Change 'web-06-criteria-catalog-core' is valid`.
- `python3 docs/architecture/fixtures/web-case-to-letter/verify.py` → passed all listed fixture checks, including 3 positive families, 4 isolated negative controls, 96 disjoint command UUIDs, lifecycle ownership, exact letter provenance, and locked manifest hashes.
- Migration filename probe → `AVAILABLE migrations/server/2026090624_criteria_catalog.sql`.

No product code, database schema, dependency pin, Tauri file, or mobile file changed in this task.

## Uncomfortable fact

The provenance-aware `criteria` relation currently exists in design SQL, while production composition still injects `UnavailableCriteriaRepository`. The browser cannot import or load a payer criteria catalog yet, so it cannot execute the full case-to-letter scenario. Tasks 2–4 must make the durable and mounted browser boundary real; Web-07 then connects it to the React/Zustand user experience.
