# Web-06 task 2 — criteria migration evidence

**Date:** 2026-09-18  
**Phase:** Execute — `runtime-architecture / web-case-to-letter`  
**Change:** `web-06-criteria-catalog-core`  
**Task:** 2 of 6 — canonical criteria migration and compatibility surface  
**Result:** Passed

## Delivered

- Added checksummed server migration `2026090624_criteria_catalog.sql` and registered it in the production SQLx migrator.
- Created the provenance-grade registry and canonical `criteria` relation for runtime databases that begin at `schema.sql`.
- Migrated every legacy `policy_criteria` row with its UUID, payer, policy, section, ordinal, label, requirement, mandatory flag, JSON data, timestamps, deterministic SHA-256, and `[effective_from,effective_to)` validity range intact.
- Rebound `case_evidence.criterion_id` to the canonical UUID without changing evidence references.
- Retained the former table as `policy_criteria_legacy`, refused all writes to it, and exposed the legacy columns through a read-only `policy_criteria` compatibility view.
- Enforced grade-specific provenance, immutable criterion identity/text/hash fields, nonempty validity, and exclusion of overlapping payer/label validity ranges.
- Added the exact `criteria_catalog` trusted projection with RLS enabled, no public privilege, and none of the prohibited source-content or command-ledger columns.
- Added a rollback preflight that refuses rollback after lineage divergence, foreign evidence attachment, or observations on migrated criteria.

## Verification

| Command | Observed result |
|---|---|
| `python3 scripts/test-web06-criteria-migration.py --install-mode fresh ...` | Passed, 21 checks, disposable database removed. |
| `python3 scripts/test-web06-criteria-migration.py --install-mode upgrade ...` | Passed, 29 checks, disposable database removed. |
| `cargo check -p aso-web-server` | Passed. |
| `cargo clippy -p aso-web-server --no-deps` | Passed with the pre-existing `chunks_exact_to_as_chunks` warning in `adapters/gate.rs:443`. |
| `python3 -m py_compile scripts/test-web06-criteria-migration.py` | Passed. |
| `openspec validate web-06-criteria-catalog-core --strict` | `Change 'web-06-criteria-catalog-core' is valid`. |
| `git diff --check -- <task files>` | Passed with no output. |
| Current-source hash comparison | Both fresh and upgrade receipts match the current migration, registry, and probe bytes. |

The populated-upgrade proof seeded two legacy criteria and attached case evidence before running the real SQLx migrator. It observed stable UUID and evidence linkage, exact user JSON, deterministic requirement hashes, deterministic `last_confirmed_at`, exact validity, compatible legacy reads, and matching catalog hashes. It also observed SQLSTATE `25006` for legacy-table and compatibility-view writes, `23514` for canonical text/hash mutation, and `23P01` for overlapping effective versions.

The first upgrade probe failed because its inherited comparison included the additive `document_set_revision` column introduced by Web-04. The focused probe was corrected to exclude additive revision tokens from legacy case snapshots, then fresh and upgrade were rerun against current source and passed.

## Scope and remaining work

No Tauri, mobile, React, Zustand, dependency-pin, or `versions.toml` file changed. Every new guard traces to the frozen Web-00 migration, provenance, publication, or overlap contract.

Production still composes `UnavailableCriteriaRepository`; catalog load/read service behavior belongs to task 3 and mounted browser HTTP belongs to task 4. The web application therefore cannot yet complete criteria selection or generate a letter.
