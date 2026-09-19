# web-01 task 3.1 — completion evidence

Result: **Passed**

## Delivered boundary

Web-01 implements verified case creation, listing, detail, update, lifecycle
transition, and command reconciliation for the browser HTTP surface. Command
payloads carry stable command and revision tokens. Actor and practice authority
come from the verified session. Mutation and command-lookup responses contain
only `commandId`, `action`, `caseId`, and `committedAt`; a case record requires
the independent `case:read` capability.

The PostgreSQL migration owns durable idempotency, optimistic concurrency,
valid lifecycle transitions, tenant scope, and direct-write refusal. The
shell-neutral `AppServices` layer independently checks human principal and
capability. The Axum boundary independently checks current gateway policy and
maps failures to stable, cache-disabled responses.

## Real mounted caller

The production caller chain is present in source:

1. `crates/aso-web-server/src/main.rs` requires mounted database and Kratos
   configuration, creates verified sessions, constructs
   `PgGateRepository::connect_with_document_store`, builds `AppServices`, and
   passes `ServerState` to `aso_server_axum::api_router` before serving the
   listener.
2. `crates/aso-server-axum/src/lib.rs` merges `routes::cases::router()` into
   that API router.
3. `crates/aso-server-axum/src/routes/cases.rs` mounts the seven frozen
   method/path contracts and delegates each handler through `AppServices`.
4. `crates/aso-web-server/src/adapters/gate.rs` invokes the tenant-scoped SQL
   functions from `migrations/server/2026090617_durable_case_commands.sql`.

This is a production construction and release-build claim. It is not a claim
that a rendered browser has completed the whole case-to-letter workflow.

## Observed verification

The focused source-verification sequence recorded in
`task-5-focused-final-safe-receipt-pass.log` ran formatting, focused Rust
checks and tests, and a release-profile check for the web server. It exited
zero. Clippy also exited zero and printed previously recorded warnings; an
additional `-D warnings` attempt in
`task-5-focused-final-safe-receipt.log` stopped on those existing warnings and
was not treated as the prescribed gate. After the task-6 documentation delta,
the current artifact rebuild separately reported `Passed: 11 artifact
constraints`, `Passed: 34 source files copied`, and `Passed: strict OpenSpec
validation`.

The disposable PostgreSQL probes produced these observed results:

- `task-5-safe-receipt-fresh.json`: **Passed** on a fresh database, including
  the real restricted-role service lifecycle.
- `task-5-safe-receipt-upgrade.json`: **Passed** after a populated upgrade,
  including the same restricted-role service lifecycle.
- Both runs confirmed that the fixture principal held `case_write` without
  `case:read`, direct writes returned SQLSTATE `42501`, foreign-scope probes
  returned SQLSTATE `42501`, and command lookup returned only the four receipt
  fields.
- Artifact-refiner validation passed 11 of 11 blocking constraints across 34
  hashed source and evidence files.
- The isolated artifact critic passed after matching every manifest hash.
- The cross-model adversarial judge passed with zero findings.

## Guards proved by sabotage and restoration

- Gateway capability removal caused the case-route contract check to fail.
- Tenant-scope removal caused the route contract check to fail.
- `AppServices` capability removal caused its focused test to fail.
- SQL write-target authorization removal caused the real PostgreSQL probe to
  fail.
- Adding `case_record_json` to a transition receipt caused the write-only
  disclosure probe to fail. The migration was restored and the fresh and
  upgrade probes passed again.

Each guard traces to the verified authority, tenant isolation, or protected
data boundary. No speculative guard was added.

## Specification and documentation delta

The OpenSpec delta and the runtime architecture contract now state that
write-only commands return a minimal receipt and that protected case data
requires a separately authorized read. The stale task-4 wording was corrected
to distinguish read authorization from write-target authorization. The frozen
contract now records plan revision 10: this child reserves Tauri wrapper names,
while RA19 and RA21 implement them after web-17. It also names the production
transaction setting, `aso.practice_id`, consistently with the adapter and SQL
functions.

## Remaining web work

Web-01 does not deliver the React case UI, document upload and processing,
criteria selection, evidence assembly, clinical affirmation, initial letter,
denial response, responsive behavior, or actual-browser certification. Those
remain in Web-02 through Web-17. Tauri and mobile remain outside this web-first
acceptance sequence.
