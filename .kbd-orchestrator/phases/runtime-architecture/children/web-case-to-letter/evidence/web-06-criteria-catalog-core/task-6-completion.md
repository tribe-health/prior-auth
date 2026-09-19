# Web-06 completion evidence

Result: **Passed** at verification tier 1.

## Delivered boundary

The browser server constructs `AppServices` with the production PostgreSQL repository in `crates/aso-web-server/src/main.rs:131`. The production Axum router merges the criteria router in `crates/aso-server-axum/src/lib.rs:38`. That router mounts import/list, command lookup, and criterion read routes in `crates/aso-server-axum/src/routes/criteria.rs:45-47`. The fresh and populated-upgrade receipts exercised those mounted routes through the production router and the same `AppServices` repository used by the server.

The original Web-06 artifact remains frozen. Its repair is a forward migration, `migrations/server/2026090626_criteria_catalog_repair.sql`; migrations 2026090624 and 2026090625 were restored byte-for-byte. The frozen-history upgrade receipt proves both historical checksums remained recorded, migration 26 applied to a populated catalog, the historical ledger stayed unchanged, and rerunning the migrator made no further change.

## Commands and observed output

| Command | Observed result |
|---|---|
| `cargo test -p aso-host criteria_catalog::tests::invalid_revision_namespaces_never_reach_the_repository -- --exact` | `1 passed; 0 failed; 37 filtered out`. Empty, signed, whitespace, nondigit, leading-zero, `i64::MAX + 1`, and larger-overflow tokens returned `Invalid`; the counting repository remained at zero calls after every case. |
| `python3 scripts/test-web06-criteria-service.py --install-mode fresh ...` | **Passed**. Clean migration, checksum-tamper refusal, canonical catalog, refusal contracts, AppServices, and mounted HTTP lifecycle passed. Receipt: `task-5-repair-fresh.json`. |
| `python3 scripts/test-web06-criteria-service.py --install-mode upgrade ...` | **Passed**. Populated legacy upgrade preserved rows and passed the same service/HTTP lifecycle. Receipt: `task-5-repair-upgrade.json`. |
| `python3 scripts/test-web06-criteria-repair-upgrade.py ...` | **Passed**. Frozen migrations 24/25 were installed and recorded, migration 26 repaired them forward, the ledger was unchanged, rerun was idempotent, and the full mounted lifecycle passed. Receipt: `task-5-forward-repair-upgrade.json`. |
| `cargo fmt --all -- --check` | **Passed**, exit 0. |
| `python3 -m py_compile scripts/test-web06-criteria-migration.py scripts/test-web06-criteria-service.py scripts/test-web06-criteria-repair-upgrade.py` | **Passed**, exit 0. |
| `git diff --check` | **Passed**, exit 0. |
| `cargo check -p aso-host -p aso-server-axum -p aso-web-server` | **Passed**; finished the dev profile with all three crates checked. |
| `cargo clippy -p aso-host -p aso-web-server --no-deps -- -D warnings` | **Failed** only at the pre-existing Web-04-owned `crates/aso-host/src/document_upload.rs:77` lint `chunks_exact_to_as_chunks`. |
| `cargo clippy -p aso-host -p aso-web-server --no-deps -- -A clippy::chunks_exact_to_as_chunks -D warnings` | **Passed** with only that unrelated lint allowed. |
| `openspec validate web-06-criteria-catalog-core --strict` | `Change 'web-06-criteria-catalog-core' is valid`, exit 0. |
| Repair-delta adversarial review | **Passed**: 0 critical, 0 warning, 0 suggestion after the signed-`bigint` token-domain repair. |

## Required outcomes

- Obtained criteria can supersede only criteria owned by the same verified practice. Published criteria remain global and cannot supersede practice-owned criteria.
- Effective-range exclusion is namespaced by payer, evidence grade, and controlling practice scope.
- A processed policy document's effective date must equal the imported policy's effective-from date.
- Revision tokens use the exact canonical namespace and decimal representation and must fit the PostgreSQL signed `bigint` revision domain before repository execution.

## Unverified and assigned forward

No criteria-selection React view exists yet. The production browser endpoints are mounted and locally integrated, but a user cannot select criteria through the UI until Web-07. Actual-browser certification remains assigned to Web-17. Tauri and mobile remain deferred until the browser scenario passes.

No unrelated guard was added. Every Web-06 guard traces to the stated provenance, tenant, overlap, source-date, revision-token, migration-history, or immutable-correction boundary.
