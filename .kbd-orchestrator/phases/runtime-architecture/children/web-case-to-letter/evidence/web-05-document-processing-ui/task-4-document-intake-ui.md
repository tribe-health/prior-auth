# Web-05 task 1.4 — mounted document intake UI

Result: **Passed** at the task's focused implementation boundary.

## Delivered boundary

The production case-intake route now mounts a shadcn-based document card. A
verified user with `document_upload` can select a bounded PDF or UTF-8 text
file, choose its document type and source date, and submit the exact multipart
Web-04 contract through the central browser HTTP client. The hook computes the
SHA-256 digest, owns a stable command through the session-scoped runtime
registry, reconciles uncertain responses, and waits for the committed
`DocumentStatus` PEM projection before reporting confirmation.

The card renders explicit queued, processing, ready, and failed text labels.
Failed processing uses the frozen copy. Ready documents open page one through
the existing authorized source-preview boundary and restore focus to the
trigger when the dialog closes. Status rows are rejoined from the normalized
PEM graph after component reconstruction rather than copied into component
state. The form and card grid adapt at `sm` and `lg` breakpoints; native file,
select, date, name, and button controls remain keyboard reachable, and motion
uses the existing reduced-motion classes.

The authorized case-detail read now carries `documentSetRevision`, which the
upload command requires. This is delivered by additive migration
`2026090623_case_document_revision_read.sql`; no applied migration was edited.
The session parser now recognizes the server-granted `document_upload`
capability.

## Observed verification

- Final browser slice: 10 files, 45 tests passed, 0 failed.
- `pnpm typecheck`: exit 0.
- `pnpm lint`: exit 0.
- `pnpm build`: exit 0. Vite produced the browser bundle; it retained existing
  PGlite Node-external, `eval`, and chunk-size warnings.
- `cargo test -p aso-host case_management::tests`: 2 passed, 0 failed.
- `cargo test -p aso-server-axum routes::cases::tests`: 9 passed, 0 failed.
- `cargo test -p aso-server-axum routes::documents::tests`: 6 passed, 0 failed.
- `cargo fmt --all -- --check`: exit 0.
- Scoped `git diff --check`: exit 0.

The initial TypeScript check found three synthetic `CaseDetailRecord` fixtures
without the newly required token; the fixtures were corrected and the rerun
passed. The first multipart test compared a FormData-created `File` by object
identity; it was corrected to assert name, type, size, and bytes. The first
component run used an unavailable matcher and the wrong Base UI progress name;
both assertions were corrected and the rerun passed.

An accidentally broad `pnpm --dir web test -- ...` invocation ran the existing
suite: 498 passed, 2 skipped, and the previously recorded
`lease-store-web.test.ts` unavailable-storage case failed. This task did not
touch that subsystem. The explicitly scoped final command passed all 45 owning
checks.

## Scope and remaining evidence

No Tauri, SQLite, Flutter, mobile, or native wrapper was changed. No browser
command invokes the service-only processor capability. The UI observes the
processor-owned status projection and never receives that authority.

This task proves rendered component behavior and the production build. It does
not claim a live local-stack page reload or full actual-browser workflow; task
2.1 owns the focused review and structural-publication sabotage, task 3.1 owns
mounted-caller reconciliation, and Web-17 owns the unchanged-candidate Tier 2
actual-browser campaign.
