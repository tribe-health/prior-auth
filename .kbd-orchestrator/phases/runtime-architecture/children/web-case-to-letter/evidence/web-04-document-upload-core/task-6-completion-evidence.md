# Web-04 task 6 — completion evidence

Result: **Passed** for the Web-04 mounted browser service boundary. This evidence does not claim a rendered React upload workflow or the Web-17 case-to-letter scenario.

## Delivered boundary

`aso_server_axum::api_router` merges `routes::documents::router()`. The production document router mounts:

- `POST /api/cases/{caseId}/documents`
- `GET /api/cases/{caseId}/documents/{documentId}`
- `GET /api/cases/{caseId}/document-commands/{commandId}`

Each route resolves a verified session and delegates through `AppServices` to the restricted PostgreSQL repository and local content-addressed `DocumentStore`. Responses use `no-store` and omit source bytes and storage identity.

The caller search found only the existing React source-preview read at `/documents/{documentId}/source`; it found no React upload caller. That is the uncomfortable boundary: Web-04 makes the HTTP capability real, but a user still cannot upload through the rendered interface. Web-05 owns that React processing/status feature and canonical page-map and `page_count` materialization.

## Commands and observed output

```text
rg -n 'merge\(routes::documents::router\(\)\)' crates/aso-server-axum/src/lib.rs
38:        .merge(routes::documents::router())

rg -n '...document route patterns...' crates/aso-server-axum/src/routes/documents.rs
61: POST upload route
64: GET metadata route
66: GET command-result route

rg -n '/documents|upload_case_document|contentSha256' web/src --glob '*.ts' --glob '*.tsx'
Only the existing source-preview API and its test matched; no upload caller matched.

openspec validate web-04-document-upload-core --strict
Change 'web-04-document-upload-core' is valid

git diff --check -- openspec/changes/web-04-document-upload-core/specs/document-upload-core/spec.md openspec/changes/web-04-document-upload-core/design.md
Return code 0; no output.
```

The complete caller trace and summarized retained results are in `task-6-mounted-callers-and-results.log`.

## Retained local verification

- Fresh service integration: Passed, return code 0, seven lifecycle markers.
- Populated-upgrade service integration: Passed, return code 0, seven lifecycle markers.
- Fresh mounted HTTP integration: Passed, return code 0, three mounted-router markers.
- Populated-upgrade mounted HTTP integration: Passed, return code 0, three mounted-router markers.
- Final focused matrix: Passed; all nine commands returned 0.
- Artifact Refiner: Passed 11/11 checks over 66 current files and frozen snapshots.
- Isolated artifact critic: PASS, zero critical, major, or minor findings.
- Distinct-model adversarial judge: PASS, zero critical findings.
- Strict anti-sycophancy screen: PASS, score 0.0.

All verification ran locally. No CI result was used.

## Documentation delta

The OpenSpec delta now records the exact supported input bounds, idempotency and conflict behavior, interrupted-finalize reconciliation, mounted browser routes, privacy boundary, and the Web-05 processing allocation. The design records the production router-to-AppServices caller chain and states explicitly that the React upload caller is still pending.

## Remaining work

Web-05 must process uploaded bytes, persist the canonical page map and count, and expose upload and processing status through React and Zustand. Later web changes must complete evidence assembly, criteria ingestion, prior-authorization letter generation, denial determination, and denial-response generation. Web-17 must certify the full workflow in an actual browser before Tauri or mobile work resumes.
