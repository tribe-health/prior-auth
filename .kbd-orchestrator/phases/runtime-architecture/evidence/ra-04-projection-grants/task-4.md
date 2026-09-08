# RA04 task 1.4 — fail-closed mounted grant and practice derivation

**Result:** Passed  
**Tier:** T1, bounded implementation unit  
**Data:** Synthetic records in disposable local resources only

## Delivered

- `scripts/test-replica-grant.py` starts the actual debug Gate binary against
  synthetic Kratos, ASO grant and accepting downstream endpoints. It verifies
  the successful HS256 token independently and counts downstream calls.
- `scripts/test-practice-derivation.py` creates fresh and upgrade databases,
  connects through a non-owner `NOSUPERUSER NOBYPASSRLS` login, executes the
  seven established derivation cases in both databases and removes all created
  resources.
- No product source change remains from this task. The controlled linkage
  sabotage was restored byte-for-byte; `aso_replica_grant.rs` retains the hash
  recorded by task 1.3.

## Observed behavior

`python3 scripts/test-replica-grant.py --gate-binary /Users/gqadonis/Projects/prometheus/flint-gate/target/debug/flint-gate`

```text
result: Passed
checks: 17
whoami calls: 2
grant calls: 4
downstream calls: 1
cleanup: gate_with_minter Passed; gate_without_minter Passed; synthetic endpoints Passed
```

The sole downstream call was the valid grant. Membership denial returned 403;
membership resolution failure and missing required minter returned 503;
mismatched originating session and a non-session principal returned 403; mixed
credentials returned 401. None reached the accepting downstream. The valid
request replaced the inbound credential with an exact 12-claim server token;
caller table, predicate, column and role inputs did not enter that token.

`python3 scripts/test-practice-derivation.py`

```text
result: Passed
fresh: Passed
upgrade: Passed
cleanup: both databases Passed; restricted login Passed
```

Both modes passed:

1. insert `case_evidence` without `practice_id` derives it;
2. insert with a false `practice_id` overwrites it;
3. direct `practice_id` update is forced back;
4. moving a case carries evidence and citations in both directions;
5. an unattached document derives from its required patient;
6. a citation inherits its evidence row's practice;
7. moving a patient carries documents in both directions.

The same restricted connection was denied when moving a case to an unowned
practice. `evidence_states` remained the exact `gap,met,void` approved reference
set and had no invented application trigger.

The first database-fixture attempts failed during document insertion because
the synthetic MRI document omitted required typed data. The fixture now supplies
a schema-valid synthetic payload; each failed attempt cleaned its database and
login before the passing run.

## Guard sensitivity

The controlled mutation removed only
`grant.originating_session_id != expected_session`, rebuilt Gate and reran the
mounted fixture. It exited 1 and the accepting downstream count increased from
one to two. The exact source was restored, rebuilt and rerun successfully.

Evidence: `task-4-sabotage-linkage.txt`, `task-4-mounted-grant.json`, and
`task-4-practice-derivation.json` in this directory.

## T0 and focused T1

```text
cargo check -p flint-gate-core
  Finished dev profile

cargo clippy -p flint-gate-core --no-deps
  Finished dev profile; three pre-existing unrelated warnings

cargo test -p flint-gate-core middleware::aso_replica_grant
  2 passed; 0 failed
```

Python AST parsing passed for both new fixtures. `git diff --check` and strict
OpenSpec validation are recorded with the final file inventory.

## Limit

The uncomfortable limit is that this proves the Gate boundary with an accepting
synthetic downstream. RA05 still owns the deployed Gate → FRF → Electric
snapshot and continuation path, including bypass topology. This task therefore
makes no live Electric-delivery claim.
