# Web-03 task 1.3 — resolver service and invalidation

Result: **Passed** at focused Tier 0 and Tier 1.

## Delivered boundary

- `AppServices` exposes typed resolve, read, and command-lookup operations through the shell-neutral case repository port.
- The PostgreSQL adapter executes only the three reviewed functions under `aso_case_executor` with verified transaction-local identity, practice, principal, and expiry.
- Migration `2026090619` adds the nonclinical resolver capability, immutable local command receipts, durable audit, the case `resolution_revision`, and stale-resolution deletion after a controlling case-input change.
- Resolution returns `resolved`, `missing`, `ambiguous`, `conflicting`, or `expired`. Parked states persist no entity or path projection.
- The canonical synthetic fixture now includes the member identifier required by the frozen resolver contract.

## Observed verification

- `cargo check -p aso-host -p aso-web-server` — exited 0.
- `python3 docs/architecture/fixtures/web-case-to-letter/verify.py` — passed all fixture, command ownership, provenance, negative-control, resolution-state, synthetic-data, and manifest-lock checks.
- Fresh disposable PostgreSQL/AppServices run — **Passed**. One ignored Rust integration test passed with three retained assertion groups. It committed six receipts and six audit events, retained five current resolution rows, exposed no executor direct table write, and published no local command ledger.
- Populated-upgrade disposable PostgreSQL/AppServices run — **Passed** with the same resolver observations. Existing case identifiers/content, repaired gate summaries, valid summaries, and legacy affirmations survived the migration and unchanged rerun.
- `git diff --check` for the task-owned files — exited 0.

Receipts:

- `task-3-fresh-service.json`
- `task-3-upgrade-service.json`

## Observed failure and repair

The first service run returned `InputsIncomplete` for the intended valid fixture. The resolver guard was correct: the canonical Web-03 cases had no member identifier. The fixture gained explicit synthetic member IDs, its locked hashes were refreshed, and both install modes then passed. An intermediate assertion used stale expected criteria/channel strings; it was corrected to the already-frozen expected-output manifest before the passing runs.

## Scope boundary

Browser HTTP commands and the responsive resolution panel remain Web-03 task 1.4. Full browser certification remains Web-17. Tauri and mobile were not changed and remain deferred until Web-17 passes.
