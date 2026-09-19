# Web-05 completion evidence

Result: **Passed** for the Web-05 focused change boundary. This is not the Web-17 actual-browser certification claim.

## Delivered mounted chain

The protected route `/cases/:caseId/intake` loads `intake-checklist-route`, which renders the production `CaseIntake`. `CaseIntake` mounts `DocumentIntake` with the committed case and document-set revisions. `DocumentIntake` uses `useDocumentUpload` for typed multipart commands and `useDocumentStatuses` for the committed `replica:document_statuses` PEM projection. Upload uncertainty is owned by the session-scoped runtime command registry.

The production Axum router merges `documents::router`, including upload, metadata, processing, upload lookup, and processing lookup endpoints. `PgGateRepository` owns `BoundedDocumentProcessor`. React does not call the processor endpoint because a human session cannot hold the required service-principal job grant. Web-16 must call this real endpoint from the deterministic synthetic runner.

## File-by-file completion delta

- `openspec/changes/web-05-document-processing-ui/specs/document-processing-ui/spec.md` now names lifecycle, projection/reload, mounted browser, processor authority, source-locality, and refusal scenarios.
- `openspec/changes/web-05-document-processing-ui/design.md` records the delivered browser/server chain and the absence of a certified production scheduler or browser campaign.
- `openspec/changes/web-05-document-processing-ui/proposal.md` records the delivered minimized projection and focused verification result.
- `docs/architecture/web-case-to-letter-contract.md` connects the browser intake route, Zustand/PEM projection, job-authorized processor, and Web-16/Web-17 ownership.
- `task-6-mounted-callers.json` records ten current-source mounting assertions.
- `task-6-openspec-strict.log` records strict OpenSpec validation.

## Commands and observed output

- Current-source mounted-caller verifier — **Passed**, ten of ten checks.
- `openspec validate web-05-document-processing-ui --strict` — `Change 'web-05-document-processing-ui' is valid`.
- `.refiner/artifacts/web-05-document-processing-ui/validate.py` — **Passed**, 18 deterministic checks across 127 frozen inputs after this completion evidence was captured.
- Web-05 task 5 retained the focused Tier-1 command matrix: 45/45 focused web tests; 3/3 host projection; 2/2 host case-management; 9/9 Axum case; 6/6 Axum document; 2/2 document-processor; typecheck, lint, production build, formatting, crate checks, prescribed clippy, fresh/upgrade database probes, and exact negative controls all passed.
- Final isolated adversarial review — **PASS**, zero findings; strict anti-sycophancy score 0.0.

## Guards and observed failures

- Required case columns on a populated PGlite replica failed before repair with null existing rows.
- Destructive cutover generation fencing failed before repair at generation 9 versus expected 10.
- Default Compose inspection failed before repair because raw Electric published host port 3000.
- Adding `storage_uri` to the production projection failed the exact allow-list guard.

Each retained guard traces to one of those observed failures or to the existing tenant/source trust boundary. No speculative product guard was added in this completion task.

## Scope audit

No Tauri or mobile implementation was added. No unrelated product code was changed in this task. The continuously running production scheduler, Web-16 synthetic orchestration, and Web-17 actual-browser case-to-letter campaign remain unverified and are not claimed as complete.
