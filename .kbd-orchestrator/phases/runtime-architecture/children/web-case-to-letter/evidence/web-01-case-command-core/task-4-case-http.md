# web-01 task 1.4 — browser case HTTP routes

Result: **Passed**

## Delivered boundary

The Axum API router now mounts the frozen browser case-command surface:

- `POST /api/cases`
- `GET /api/cases`
- `GET /api/cases/{case_id}`
- `PATCH /api/cases/{case_id}`
- `POST /api/cases/{case_id}/status`
- `GET /api/case-commands/{command_id}`
- `GET /api/cases/{case_id}/commands/{command_id}`

The handlers accept command and revision tokens, derive the principal and practice from the verified session boundary, delegate to the shell-neutral case service, and mark responses `no-store`. Request bodies cannot supply actor authority or override the selected practice.

The gateway policy recognizes each mounted case route. Reads require `case:read`; commands and command-result lookups require `case_write`. Existing-case reads call `read_case`, while writes and scoped command lookups call `authorize_case_write_target`; both paths establish tenant scope without mutating the aggregate or making write authority depend on read authority.

The stable HTTP error codes exercised at this boundary are `session_required`, `action_forbidden`, `resource_not_found`, `stale_revision`, `invalid_transition`, `command_conflict`, `invalid_request`, and `service_unavailable`.

No native wrapper or Tauri runtime claim is part of this browser-first task.

## Verification

The final focused command was:

```text
cargo fmt --check -p aso-server-axum &&
cargo check -p aso-server-axum &&
cargo clippy -p aso-server-axum --no-deps &&
cargo test -p aso-server-axum routes::cases::tests &&
cargo test -p aso-server-axum routes::gate::tests &&
openspec validate web-01-case-command-core --strict &&
git diff --check -- crates/aso-server-axum/src/lib.rs \
  crates/aso-server-axum/src/routes/cases.rs \
  crates/aso-server-axum/src/routes/cases/tests.rs \
  crates/aso-server-axum/src/routes/gate.rs
```

Observed output:

```text
test result: ok. 4 passed; 0 failed; 0 ignored; 0 measured; 37 filtered out
test result: ok. 15 passed; 0 failed; 0 ignored; 0 measured; 26 filtered out
Change 'web-01-case-command-core' is valid
FINAL_EXIT=0
```

Clippy completed successfully and reported the crate's existing `result_large_err` warning pattern, including handlers that return Axum `Response` as the error variant. No warning was promoted to an error.

## Contract coverage

The route tests cover create, retry, lost-response lookup, list, detail, update, status transition, changed-payload command conflict, stale revision, invalid transition, malformed caller authority, anonymous requests, agent refusal, repository failures, stable response codes, and cache headers. The gate tests cover fresh capability checks, tenant-scoped reads, credentials, sanitized failures, service authority independence, and read-only policy behavior.

## Limits of this result

This is focused Tier 0/Tier 1 evidence for the mounted HTTP boundary. It does not certify the complete PostgreSQL-backed browser stack, rendered case UI, document upload, criteria workflow, letter generation, denial response, responsive behavior, or full browser scenario. Those remain assigned to later tasks and changes, with full local certification reserved for `web-17-browser-scenario-certification`.
