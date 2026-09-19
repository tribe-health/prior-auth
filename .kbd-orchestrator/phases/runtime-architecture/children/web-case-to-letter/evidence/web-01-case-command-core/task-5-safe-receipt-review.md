# Web-01 task 2.1 safe-receipt review

Result: **Passed**

- Fresh disposable PostgreSQL plus real restricted-role service run: `task-5-safe-receipt-fresh.json` — Passed.
- Populated-upgrade PostgreSQL plus the same restricted-role service run: `task-5-safe-receipt-upgrade.json` — Passed.
- The fixture principal had `case_write` and no `case:read`; its stored transition lookup returned only `commandId`, `action`, `caseId`, and `committedAt`.
- Disclosure sabotage: `task-5-safe-receipt-sabotage.json` — Failed as required after temporarily adding `aso.case_record_json` to the transition result. The migration was restored to SHA-256 `6ed504bdff3e4abe464179101d55c7fd23c4b6e9c1ef5e67e6e3854b010d3a86`.
- Artifact-refiner: Passed 11/11 blocking constraints across 32 hashed source/evidence files; strict OpenSpec and artifact schemas passed.
- Isolated artifact critic: PASS after all 32 manifest hashes matched. One P3 stale-evidence wording issue remains for task 3.1; runtime behavior is fail-closed.
- Cross-model adversarial judge: PASS, zero findings, after rejecting two claims contradicted by compiler output and the still-mounted independent evidence router.
- Final current-source focused run: `task-5-focused-final-safe-receipt-pass.log` — formatting, focused checks/tests, release check, strict OpenSpec, and artifact rebuild exited zero. Clippy exited zero with previously recorded warnings.

No browser UI, Tauri runtime, mobile, or full workflow certification is claimed by this task.
