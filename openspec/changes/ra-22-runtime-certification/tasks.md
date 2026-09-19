## 1. Eligibility and frozen candidate

- [ ] 1.1 Confirm Passed evidence for `web-case-to-letter/web-17-browser-scenario-certification` and `ra-20-safe-browser-updates`; record the exact browser candidate, service artifacts, supported browsers and synthetic corpus.
- [ ] 1.2 Trace the mounted browser callers and enumerate every non-skipping startup, case workflow, denial-response, update, recovery, citation and authority scenario from the specification, including the locked `foreign-practice-case`, `missing-citation-claim`, `unrelated-page-claim`, and `low-confidence-denial` controls.

## 2. Local browser certification

- [ ] 2.1 Start the complete local service stack and run the non-skipping service preflight against the frozen candidate. Record actual commands, prerequisite availability and observed results.
- [ ] 2.2 Run the complete product scenario in actual supported browsers: create/manage case, upload/process data, resolve administering entity, select criteria, assemble met/gap/void evidence, generate/review/sign the request, acknowledge local submission, ingest/classify denial, and generate/review/sign corrected resubmission and clinical appeal response letters.
- [ ] 2.3 Run cold/warm startup, account/practice change, revocation, dirty-work update, quota/migration recovery and post-update revalidation against the same candidate.
- [ ] 2.4 Demonstrate mandatory document/page/date provenance and independent Gate/AppServices/PostgreSQL clinical refusal at the mounted boundaries, including controlled red/restore evidence.

## 3. Browser phase gates and review

- [ ] 3.1 Run applicable browser T2 locally: sequential Rust workspace tests/build, web production build, architecture audit, complete local stack and actual-browser campaign. CI is not evidence; native/mobile gates are outside this change.
- [ ] 3.2 Run artifact-refiner followed by isolated adversarial review, resolve or explicitly disposition findings, and record Passed/Build-only/Blocked/Failed per scenario and platform.
- [ ] 3.3 Reflect and update only genuinely satisfied browser dimensions. Leave Tauri, native database/updater and physical mobile certification explicitly deferred.
