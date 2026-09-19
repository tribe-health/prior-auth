# Web-04 task 5 — focused verification and independent review

Result: **Passed** at focused Tier 1. This task does not claim the Web-17 actual-browser case-to-letter scenario.

## Product corrections from the first isolated review

- The upload adapter acquires the final database transaction before publishing the content-addressed object. A failed write or finalize rolls back, abandons the exact reservation, and deletes only an object with the expected digest.
- Expired reservations now use bounded claim and completion functions. Repository startup and each upload reconcile the claimed object and staging row.
- The document-source grant now returns the authoritative database media type. Extensionless Web-04 objects reopen as `application/pdf` or `text/plain`; suffix inference remains only for legacy null media types.
- The artifact validator hashes both current files and frozen snapshots, states the rollback reservation behavior accurately, and enforces matching artifact types.

Canonical page-map and `page_count` materialization remain Web-05 work. The frozen contract says Web-04 inspects page count to enforce the 500-page upload bound and Web-05 commits the canonical count after processing succeeds.

## Deliberate negative controls

- Removing the existing-object digest comparison made the focused tamper test fail with return code 101. Restoration produced the original source hash and the test passed.
- Removing the staging-row delete from the atomic commit function made the fresh database probe fail. Restoration produced the original migration hash and the probe passed.

The red and restored receipts are retained as `task-5-tamper-*` and `task-5-partial-commit-*` evidence.

## Local integration evidence

- Fresh service lifecycle: Passed. One ignored integration test passed and emitted all seven expected markers, including authoritative PDF/text reopening, post-write cleanup and retry, and startup expired-stage reconciliation.
- Populated-upgrade service lifecycle: Passed with the same seven markers.
- Fresh mounted HTTP lifecycle: Passed with upload/read/lookup/Gate, retry/conflict/integrity refusal, and anonymous/foreign-tenant refusal markers.
- Populated-upgrade mounted HTTP lifecycle: Passed with the same three mounted markers.
- Final focused matrix: Passed. `cargo fmt`, focused workspace `cargo check`, focused Clippy, four document-store tests, six document-route tests, fifteen Gate-policy tests, strict OpenSpec validation, Python compilation, and scoped diff validation all returned 0.
- Artifact Refiner: Passed 11 checks over 66 current files and frozen snapshots.

All tests ran locally. No CI result was used.

## Independent review

The first artifact review failed with three major and two minor findings; the first adversarial packet was blocked because untracked implementation files were absent and it disputed the frozen page-count allocation. Those findings and packets remain retained.

The corrected isolated artifact review passed with zero critical, major, or minor findings. The corrected distinct-model adversarial review passed with zero critical findings. Its packet contained all 25 Web-04 product and specification files, including untracked files. The strict anti-sycophancy screen passed with score 0.0.

## Remaining boundary

Web-04 supplies durable bounded ingestion and mounted browser HTTP operations. Web-05 still must process uploaded bytes, materialize the canonical page map and count, and expose processing status to React. Web-17 remains the Tier 2 actual-browser certification for the complete case-to-letter workflow. Tauri and mobile remain deferred.
