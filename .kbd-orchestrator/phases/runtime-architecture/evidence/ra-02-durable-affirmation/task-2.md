# RA-02 task 1.2 — durable gate transaction

2026-09-06. Runtime-architecture / Execute. Driver task 2 of 9.
Result: **Passed** for the backend implementation unit. The change remains in progress.

The delivery stops at the service/repository boundary assigned to task 1.2.
The task's broader Gateway/service/database acceptance sentence is not yet
established end to end: task 1.3 owns mounting, Gate policy, verified transport
context and desktop parity, and subsequent tasks own behavioral acceptance.
The uncomfortable limit is concrete: ordinary server composition still selects
the existing memory clinical repositories. This backend is not a production
durable-affirmation path until that integration passes.

## File-by-file delivery

| File | Change |
| --- | --- |
| `Cargo.toml` | Enable migration support on already pinned SQLx 0.8.3. No dependency version changes. |
| `crates/aso-host/src/affirmation.rs` | Trusted clinical context, typed commands/results/errors, independent service capability/principal/expiry checks, authoritative read and result lookup. |
| `crates/aso-host/src/lib.rs` | Export affirmation module. |
| `crates/aso-host/src/ports/mod.rs` | Add verified clinical repository/authority contracts; legacy adapters refuse these operations by default. |
| `crates/aso-web-server/src/adapters/gate.rs` | Restricted PostgreSQL repository, transaction-local verified context, role validation, command/read/lookup and capability calls. |
| `crates/aso-web-server/src/adapters/mod.rs` | Export gate adapter. |
| `crates/aso-web-server/src/migrations.rs` | Embedded checksummed migration source and explicit deployment runner. |
| `crates/aso-web-server/src/main.rs` | Dispatch `--migrate-server` separately from ordinary startup. |
| `migrations/server/2026090601_durable_gate.sql` | Restricted function roles, immutable command ledger, atomic audit/result writes, independent authority trigger, summary protection and upgrade reconciliation. |
| `crates/aso-web-server/src/adapters/gate/transaction_tests.rs` | Actual AppServices/repository lifecycle test against a disposable database, direct trigger controls and rollback-only sabotage. |
| `scripts/test-gate-transaction.py` | Synthetic populated upgrade fixture, migrator/rerun/checksum checks, restricted login, sanitized evidence and owned-resource cleanup. |
| `openspec/changes/ra-02-durable-affirmation/design.md` | Record operation, role, deployment, privacy and staged integration contracts. |

[Implementation hashes](task-2-files.json) cover these twelve files. Cargo.lock
matches its RA-01 acceptance hash exactly; its preexisting working-tree changes
are not RA-02 changes. This report, JSON evidence and append-only memory retain
verification and decisions. OpenSpec/KBD completion state is maintained only
through the driver. No unrelated implementation, PEM pin change, UI work,
query cache, real patient data, commit or deployment was added.

## Observed checks

| Tier | Actual command | Observed output |
| --- | --- | --- |
| T0 | `cargo +1.97.1 check -p aso-host` | Exit 0, `Finished dev profile`; repeated after source restoration. |
| T0 | `cargo +1.97.1 clippy -p aso-host --no-deps` | Exit 0, no warnings. |
| T0 | `cargo +1.97.1 check -p aso-web-server` and `cargo +1.97.1 clippy -p aso-web-server --no-deps` | Exit 0. Four dead-code warnings reflect the staged adapter; three existing unit-struct-default warnings remain. |
| T0 | `cargo +1.97.1 check -p aso-web-server --tests` and `cargo +1.97.1 clippy -p aso-web-server --tests --no-deps` | Final exit 0; test composition uses the adapter, leaving only the three existing main composition warnings. |
| T1 | `RUSTUP_TOOLCHAIN=1.97.1 python3 scripts/test-gate-transaction.py` | Final exit 0, `Passed`; 22 fixture checks, 16 lifecycle markers and six cleanup checks. |
| T1, inside fixture | `cargo test -p aso-web-server gate_transaction_lifecycle -- --ignored --nocapture` | `test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 4 filtered out; finished in 0.97s` |

The [final fixture receipt](transaction.json) retains exact commands, return
codes, prerequisites and assertion labels. It proves populated cases survive
upgrade, stale summaries are repaired, correct complete cases retain their
timestamps, and existing affirmations remain unchanged. Migration reruns leave
data and ledger unchanged. A tampered checksum returns exit 1; restoration
returns exit 0.

The actual service/repository path commits one affirmation, audit and original
result atomically. It preserves original results after later surgeon changes,
rejects changed kind/action/case payloads, isolates identity/practice lookups,
supports selected non-home practice membership, and serializes duplicate and
same-case commands. A forced audit failure rolls back affirmation, summary and
result. Runtime logins with privileged flags or non-inherited owner membership
are refused.

Administrator, agent, expired and foreign-practice attempts are refused directly
by the repository. Separate owner-role test transactions bypass the command
function and exercise INSERT/DELETE trigger refusal. Authorized controls prove
those statements are not merely failing grants. Disabling the authority trigger
allows the forbidden administrator insert; rolling back DDL/data restores the
refusal. Disabling the summary guard likewise permits a forged summary and
rollback restores refusal. All sabotage targets disposable synthetic stores.

The [service guard mutation](service-guard-mutation.json) bypassed the capability
refusal in source. The same fixture failed with test exit 101; source was restored
byte-for-byte and the final full run passed. The failed mutation receipt is
[retained separately](transaction-service-guard-removed.json).

An initial migration-only probe was interrupted because it inherited the default
toolchain instead of explicitly selecting 1.97.1; its disposable database and
created role were cleaned. The first full fixture ran before its owner-role
environment contract was complete: migration checks passed, lifecycle failed
after its first marker, and cleanup passed. That failed
[fixture receipt](transaction-fixture-contract-failed.json) is preserved.
The corrected run passed before and after the controlled mutation. No failed
attempt is counted as acceptance.

## Review, guards and remaining scope

The independent artifact critic identified non-inherited owner membership,
stale upgrade summaries and missing direct trigger proof. All three were
addressed and exercised in the final run. Its final source review found zero
remaining actionable backend findings; root reconciled that inspection with
the live results. See [review receipt](task-2-review.json). The full change's
refiner/adversarial completion gate remains task 3.1.

Every added guard traces to an explicit requirement or the clinical/database
trust boundary: fresh human authority, current practice membership, restricted
service credentials, direct-summary refusal, immutable command results,
transactional rollback and local-ledger publication exclusion. Fixture guards
address credential output, concurrent fixtures and interrupted resource cleanup.
No speculative product guards were added.

SQLx migration and PostgreSQL definer/role behavior were checked against Context7
documentation and pinned local SQLx source. T0 also parsed fixture Python,
round-tripped evidence JSON, checked all twelve files for trailing whitespace
and final newlines, and verified restored source/Cargo.lock hashes.

Unverified: mounted HTTP/Gate enforcement, desktop credential ownership and
runtime execution, browser/mobile behavior, response-loss transport simulation,
and full change acceptance. No T2 workspace/audit or T3 release/device checks
were run; their phase/milestone boundaries have not been reached.
