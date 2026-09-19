# Web-06 task 1.3 — production criteria repository

Result: **Passed** at Tier 1.

The production `AppServices` composition now uses `PgGateRepository` for the
criteria port. The restricted adapter executes only the approved catalog
functions. Imports consume ready `policy-document` rows and exact extracted
pages from the existing document-ingestion boundary. Published criteria are
globally readable; obtained-by-request criteria retain the importing practice
scope. Corrections close the prior effective range and point it at a new
immutable criterion row.

## Verification

- `python3 scripts/test-web06-criteria-service.py --install-mode fresh --output .../task-3-service-fresh.json`
  — Passed. The actual repository lifecycle emitted all five expected markers;
  one ignored integration test passed with zero failures.
- `python3 scripts/test-web06-criteria-service.py --install-mode upgrade --output .../task-3-service-upgrade.json`
  — Passed. Existing criteria, case evidence identifiers, case rows, and gate
  records survived the migration; the same actual repository lifecycle passed.
- `cargo check -p aso-web-server` — Passed.
- `cargo clippy -p aso-web-server --tests --no-deps` — Passed with the retained
  pre-existing `chunks_exact_to_as_chunks` warning in `adapters/gate.rs`.
- `python3 -m py_compile scripts/test-web06-criteria-service.py` — Passed.
- `cargo fmt --check -- <touched Rust files>` — Passed.
- `git diff --check -- <task files>` — Passed.

Both database fixtures used a non-owner, non-bypass login holding only
`aso_gate_executor` and `aso_case_executor`. They proved exact retry and lookup,
changed-payload conflict, stale-revision refusal, derived-grade refusal,
foreign-practice source refusal, published visibility, obtained tenant scope,
source-page text and hash binding, three committed audits, immutable command
receipts, and correction by supersession without changing the original text.

## Observed failures repaired

1. The hardened security-definer search path could not resolve `digest`.
   The function now calls `public.digest` explicitly.
2. Updating the materialized catalog with `superseded_by` occurred before the
   replacement criterion insert. Both supersession foreign keys are now
   deferred for the import transaction.
3. The synthetic source seed initially ran without the schema search path
   required by the existing typed-document validation trigger. The fixture now
   sets `aso,public` before inserting processed policy documents.

## Boundary and remaining work

The guards added here trace to the verified session, tenant, command replay,
processed-document provenance, and immutable-ledger trust boundaries. No
fallback, retry loop, or unrelated defensive behavior was added. Browser HTTP
catalog routes remain Web-06 task 1.4. React criteria selection remains Web-07.
Tauri and mobile remain deferred until Web-17 passes.
