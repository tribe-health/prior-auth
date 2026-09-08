# RA-04 task 1.3 — strict replica claims and verified FRF identity

Date: 2026-09-08
Result: Passed
Data: synthetic identifiers only

## Implemented boundary

ASO now includes the verified identity, originating Kratos session, membership
authorization revision, selected practice, projection revision, and session
expiry in the server-owned replica grant. Gate resolves that grant with only the
original credential and the validated `practiceId`; it compares the returned
identity and session to its verified Kratos identity, requires the exact five
projection identifiers, and mints a typed claim struct. The dedicated token has
no free-form claim map and cannot copy traits, caller headers, table names,
predicates, or column lists.

FRF requires a UUID `jti` and refuses malformed or missing originating-session
linkage instead of generating a replacement. The shape boundary requires the
exact `aso.replica.read` scope, projection revision 1, authorization revision,
originating session, and five projection identifiers before it derives the
practice scope from the verified tenant claim. JWT validation requires expiry
and audience with zero leeway; configured production verification also requires
the exact issuer.

The uncomfortable limit is that RA-05 still owns the deployed Gate-to-FRF shape
route, Electric protocol exchange, and continuation authorization. This task
proves the identity/grant seam and does not claim live shape delivery.

## Observed verification

ASO focused behavior:

```text
$ cargo test -p aso-host projection::tests -- --nocapture
test result: ok. 2 passed; 0 failed
$ cargo test -p aso-server-axum session::tests::mounted_registry_derives_two_practice_grants -- --nocapture
test result: ok. 1 passed; 0 failed
```

Gate focused behavior:

```text
$ cargo test -p flint-gate-core aso_replica_grant -- --nocapture
test result: ok. 2 passed; 0 failed
$ cargo test -p flint-gate-core replica_mint_emits_only_the_typed_allowlist_and_bounds_expiry -- --nocapture
test result: ok. 1 passed; 0 failed
```

The Gate tests observed that caller `table`, `where`, `columns`, forged role
traits, forged headers, a bearer/service path, and projection revision 99 do not
broaden or activate the replica token. Decoded claims contained exactly:
`aud`, `authorization_revision`, `exp`, `iat`, `iss`, `jti`,
`originating_session_id`, `projection_ids`, `projection_revision`, `scope`,
`sub`, and `tenant_id`. Expiry was no later than the configured 60-second cap.

FRF focused behavior:

```text
$ cargo test -p frf-identity-ory -- --nocapture
unit tests: 2 passed; verifier integration tests: 7 passed
$ cargo test -p frf-gateway --features shape-facade routes::shape::tests -- --nocapture
test result: ok. 3 passed; 0 failed
```

The signed-JWT verifier tests observed matching issuer acceptance and rejection
of wrong issuer, missing issuer, wrong audience, and expired tokens. Claim tests
observed rejection of wrong scope, wrong revision, incomplete projection lists,
missing originating session, malformed originating session, and malformed
`jti`.

T0 checks:

```text
$ cargo check/clippy -p aso-host, aso-server-axum, aso-desktop
Passed. Axum retained 10 pre-existing result_large_err warnings.
$ cargo check/clippy -p flint-gate-core --no-deps
Passed. Gate retained 3 pre-existing warnings in unrelated modules.
$ cargo check/clippy -p frf-ports, frf-identity-ory, frf-gateway --features shape-facade --no-deps
Passed with no warnings.
$ git diff --check
Passed in all three repositories.
```

## Negative control

The FRF exact-scope condition was temporarily disabled. The focused replica
claim test failed at the wrong-scope mutation with exit 101. The original file
was restored and the same test then passed 1/1. Raw output is in
`task-3-sabotage-scope.txt`. Current hashes for all 24 touched source and fixture
files are in `task-3-files.json`.

No Tier 2 or Tier 3 suite, database, running service, browser, Tauri window,
physical device, production credential, or real patient data was used.
