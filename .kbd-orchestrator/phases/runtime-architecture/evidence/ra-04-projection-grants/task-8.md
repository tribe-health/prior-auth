# RA04 task 2.4 — reactive gate-summary projection acceptance

2026-09-08. Runtime-architecture / Execute. Driver task 8 of 10.  
Result: **Passed** for the RA04 server projection contract. RA04 remains in
progress.

## Requirement and observed result

Fresh and upgraded disposable PostgreSQL campaigns each passed the actual
`AppServices` and `PgGateRepository` lifecycle with 18 named assertions. In
both modes, surgeon A completed the four-part gate and surgeon B removed the
Plan affirmation in a later command. The committed `cases.gate_affirmed_at`
and `gate_affirmed_by` values both became null, while surgeon A's immutable
earlier command result remained available. The restricted runtime login was a
non-owner, non-bypass executor member. Every disposable database and role was
removed; a final server query found zero fixture databases and zero fixture
roles.

The ASO projection registry now has a focused guard asserting the exact
practice-scoped `cases` column set includes nullable `gate_affirmed_at` and
continues to exclude `gate_affirmed_by`. The three projection-registry tests
passed. Removing `gate_affirmed_at` from the registry made the new test fail
with exit 101; exact restoration passed.

The mounted FRF shape route was exercised with a valid ASO replica claim, a
server-declared `cases` policy, and a synthetic authorized upstream body whose
`gate_affirmed_at` value was null. The resolver produced the verified practice
predicate and exact six-column request, omitted `gate_affirmed_by`, authorized
once, called the facade once, and returned the null-bearing body unchanged.
Dropping the response body at the real route made only this stream-contract
test fail with exit 101; exact restoration returned all three route tests to
passing.

The application shell's stale handoff comment now names the planned RA14 graph
selector over projected `cases.gate_affirmed_at`. Source inspection confirms
navigation has no HTTP-client or gate-API dependency and its current placeholder
stays fail-closed. The phase plan assigns live Electric delivery to RA05,
materialization of this field to RA11c, and the actual graph selector plus
remote-revocation browser proof to RA14. The phrase “navigation will consume”
is therefore a checked downstream contract in RA04, not a claim that the
current placeholder already reacts at runtime.

## Actual commands and prerequisites

| Command | Observed result |
| --- | --- |
| `RUSTUP_TOOLCHAIN=1.97.1 python3 scripts/test-gate-transaction.py --install-mode fresh --output .../task-8-gate-fresh-restored.json` | Passed: 18 assertions; second-surgeon removal marker present; all cleanup passed |
| `RUSTUP_TOOLCHAIN=1.97.1 python3 scripts/test-gate-transaction.py --install-mode upgrade --output .../task-8-gate-upgrade.json` | Passed: 18 assertions; second-surgeon removal marker present; all cleanup passed |
| `cargo test -p aso-host projection::tests -- --nocapture` | Passed: 3 passed, 0 failed |
| `cargo test -p frf-gateway --features shape-facade --test shape_projection_grant` | Passed: 3 passed, 0 failed |
| `cargo check -p aso-host` and `cargo clippy -p aso-host --no-deps` | Passed without warnings |
| `cargo check -p frf-gateway --features shape-facade` and focused Clippy | Passed without warnings |
| `pnpm --dir web typecheck` and `pnpm --dir web lint` | Passed; lint retained one pre-existing warning in `replica-rebuild.test.ts` |
| Python AST parsing of the two edited fixtures | Passed |
| Docker Compose cleanup queries | Passed: `fixture_databases=0`, `fixture_roles=0` |

Prerequisites were available through the existing local Compose database on
port 55432, its captured container-admin password, Rust 1.97.1, resolved local
dependencies, loopback execution, and synthetic records. No external network,
production database, credential, or patient record was used.

The first fresh database attempt is preserved as failed evidence. Its broad
Cargo name filter matched the gate, signing, and reassessment ignored tests
introduced by RA03, causing three database lifecycles to share a gate-only
fixture. All resources still cleaned up. The runner now invokes the exact gate
test with `--exact`; the corrected fresh and upgrade runs passed.

Raw output and current source hashes are recorded in
`task-8-acceptance.json`.

## Scope and limit

Changes are limited to two projection/route regression tests, one corrected
database-fixture filter, one stale handoff comment, task evidence, and
append-only learning records. No runtime branch, dependency, migration,
database schema, active browser materializer, graph selector, or deployment
changed.

The uncomfortable limit is the seam between the two passing proofs: the
PostgreSQL transaction and mounted authorized FRF route used the same semantic
null update but were not connected by a live Electric instance. This task
proves the RA04 producer, projection, and transport-preservation contracts.
RA05, RA11c, and RA14 must still prove that the same committed row travels
through the deployed topology, commits to SQL/PEM, and relocks navigation
without reload. No T2/T3, browser runtime, Tauri window, physical device,
production, or real-clinical-data operation ran.
