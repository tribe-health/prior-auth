# RA04 task 2.3 — fail-closed grant dependency acceptance

2026-09-08. Runtime-architecture / Execute. Driver task 7 of 10.  
Result: **Passed**. RA04 remains in progress.

## Requirement and observed result

The current Gate binary was rebuilt and mounted against synthetic Kratos, ASO
grant, and accepting downstream endpoints. The fixture passed all 17 checks.
Membership denial returned HTTP 403, membership-service failure returned HTTP
503, mismatched originating-session linkage returned HTTP 403, mixed
credentials returned HTTP 401, a non-session service principal returned HTTP
403 without calling the grant endpoint, and absence of the required JWT minter
returned HTTP 503. None of those requests reached downstream. Across the full
campaign, the single downstream call was the valid human-session request.

The actual ASO replica-grant route now has a mounted regression test at the
other side of that callback contract. A denied practice returned HTTP 403 with
`practice_denied`; an unavailable membership resolver returned HTTP 503 with
`session_unavailable`; and a resolved session whose expiry was not after the
server clock returned HTTP 401 with `unauthenticated`. Each response contained
only its error code and no grant or invented session linkage.

Changing the real ASO error mapping so `PracticeDenied` returned HTTP 200 made
the new test fail with exit 101. Exact restoration returned the focused test to
passing, and all four session-boundary tests then passed.

## Actual commands and prerequisites

| Command | Observed result |
| --- | --- |
| `cargo build -p flint-gate` | Passed; current debug binary built |
| `python3 scripts/test-replica-grant.py --gate-binary /Users/gqadonis/Projects/prometheus/flint-gate/target/debug/flint-gate --output .kbd-orchestrator/phases/runtime-architecture/evidence/ra-04-projection-grants/task-7-mounted-grant.json` | Passed: 17 checks; one downstream call; all cleanup passed |
| `cargo test -p aso-server-axum session::tests::mounted_registry_refuses_failed_or_expired_membership_resolution -- --nocapture` | Passed after restoration: 1 passed, 0 failed |
| `cargo test -p aso-server-axum session::tests -- --nocapture` | Passed: 4 passed, 0 failed |
| `rustfmt --edition 2024 --check crates/aso-server-axum/src/session.rs` | Passed after applying the one reported line-wrap correction |
| Python `ast.parse` of `scripts/test-replica-grant.py` | Passed |
| `cargo check -p aso-server-axum` | Passed |
| `cargo clippy -p aso-server-axum --no-deps` | Passed with ten pre-existing `result_large_err` warnings in untouched route functions |

Prerequisites were available: a local Rust toolchain, resolved Cargo
dependencies, the current Gate source and debug target, loopback ports, and
synthetic HTTP endpoints. The fixture used no external network, database,
credential, Electric server, or patient record.

The first T0 command group reported the one rustfmt difference but continued to
later checks because its shell did not enable immediate exit. It was excluded
from passing evidence. After the formatting correction, the entire group was
rerun with `set -euo pipefail` and exited zero.

The fixture gained an explicit `--output` path after this task observed that
its fixed task-4 destination allowed later runs to overwrite prior evidence.
The task-7 run wrote its own receipt, while the pre-run and post-run task-4
receipt hash remained
`1b3f60e587f20fd1990866dde3e39dfeb0390710520b970502403b10e0acfe60`.

Raw output and current source hashes are recorded in
`task-7-acceptance.json`.

## Scope and limit

Changes are limited to the mounted ASO regression test, the reusable fixture's
output-path option, task evidence, and append-only learning records. No runtime
branch, dependency, migration, architecture document, database, or deployment
changed. The new guard traces to the observed failure scenario that a failed or
expired membership result emits a replica grant or success response.

The uncomfortable limit is that the actual Gate process receives its callback
statuses from a synthetic ASO endpoint, while the actual ASO route is exercised
in-process. This proves both sides of the contract and Gate's lack of
pass-through, but it does not prove a deployed ASO-to-Gate-to-FRF-to-Electric
topology. RA05 owns live shape delivery. No T2/T3, browser, Tauri window,
physical-device, production, or real-clinical-data operation ran.
