# RA04 task 2.2 — strict projection-grant acceptance

2026-09-08. Runtime-architecture / Execute. Driver task 6 of 10.  
Result: **Passed**. RA04 remains in progress.

## Requirement and observed result

The mounted Gate fixture passed 17 synthetic checks. Caller `table`, `where`
and `columns` values, forged identity headers and traits, mixed credentials,
anonymous requests, and service principals did not broaden the minted grant.
Only the valid human session reached the accepting downstream: one downstream
call across the full campaign. The valid JWT contained the exact typed
twelve-claim allowlist with the five approved projection identifiers.

Gate unit tests separately passed for forged caller data, service identity,
wrong projection revision, and typed mint output. FRF identity tests passed for
malformed session identifiers, exact scope/revision/session linkage, matching
issuer, and rejection of missing or wrong issuer, wrong audience, and expired
tokens.

A new mounted Axum route test sent wrong-scope and wrong-revision verified
claims through `/v1/shape`. Both returned HTTP 403 before either the resolver's
authorization provider or the shape facade was called. The two downstream call
counters remained zero. Removing that route check made both tests fail with
HTTP 404 instead of 403 and exit 101; restoring the check returned both tests
to passing. The existing shape-policy tests also proved that a caller-supplied
scope column and any parameter outside the allowlist are rejected.

## Actual commands and prerequisites

| Command | Observed result |
| --- | --- |
| `cargo test -p flint-gate-core middleware::aso_replica_grant` | Passed: 2 passed, 0 failed |
| `cargo test -p flint-gate-core replica_mint_emits_only_the_typed_allowlist_and_bounds_expiry` | Passed: 1 passed, 0 failed |
| `cargo test -p frf-identity-ory` | Passed: 9 passed, 0 failed |
| `cargo test -p frf-gateway --features shape-facade --test shape_projection_grant` | Passed: 2 passed, 0 failed after restoration |
| `cargo test -p frf-shape-electric a_client_cannot_widen_the_shape_by_supplying_the_scope_column` | Passed: 1 passed, 0 failed |
| `cargo test -p frf-shape-electric a_param_outside_the_allow_list_is_an_error_not_a_silent_drop` | Passed: 1 passed, 0 failed |
| `python3 scripts/test-replica-grant.py --gate-binary /Users/gqadonis/Projects/prometheus/flint-gate/target/debug/flint-gate` | Passed: 17 checks; downstream count 1; cleanup passed |
| `rustfmt --edition 2024 --check crates/frf-gateway/tests/shape_projection_grant.rs` | Passed after applying the one reported line-wrap correction |
| `cargo check -p frf-gateway --features shape-facade` | Passed |
| `cargo clippy -p frf-gateway --features shape-facade --test shape_projection_grant --no-deps` | Passed without warnings |

Prerequisites were available: the current Gate debug binary, synthetic mock
Kratos/ASO/downstream HTTP endpoints, the current Gate and FRF workspaces, and
resolved local Cargo dependencies. No database, Electric server, external
network, credential, or patient record was required.

Two initial commands were preserved as non-evidence: the Gate filter
`mint_replica` matched zero tests, and the nonexistent FRF gateway feature
`frf-identity-ory` produced a Cargo error. They were corrected to the exact
test name and the declared `shape-facade` feature before acceptance was claimed.

Raw output and current source hashes are recorded in
`task-6-acceptance.json`.

## Scope and limit

The only product change in this acceptance task is the FRF mounted-route
regression test. No runtime source, dependency, migration, architecture
document, database, or deployment changed. The guard traces to the explicit
failure scenario that a wrong-scope or wrong-revision token reaches resolver or
facade data access.

The uncomfortable limit is that issuer and audience rejection are proved at
the real verifier with synthetic keys, while the mounted Gate campaign ends at
an accepting synthetic downstream. This task does not prove a deployed
Gate-to-FRF-to-Electric exchange or live key rotation. RA05 owns live shape
delivery. No T2/T3, browser, Tauri window, physical-device, production, or real
clinical-data operation ran.
