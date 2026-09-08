# RA04 task 2.5 — practice-derivation acceptance

2026-09-08. Runtime-architecture / Execute. Driver task 9 of 10.  
Result: **Passed**. RA04 remains in progress.

## Requirement and observed result

The current disposable database fixture passed the exact ten-check matrix in
both fresh and upgrade modes through a non-owner `NOSUPERUSER NOBYPASSRLS`
login. The tested derivation behavior was identical in both modes:

1. Existing or freshly inserted child rows had the parent practice baseline.
2. `case_evidence` inserted without `practice_id` derived it from the case.
3. A false `case_evidence.practice_id` on insert was overwritten.
4. A direct false practice update on `case_evidence` was forced back.
5. An unattached document with a false practice derived from its required
   patient.
6. A citation with a false practice inherited its evidence row's practice.
7. Moving a case to the other permitted practice and back cascaded both
   `case_evidence` and `evidence_citations` in each direction.
8. Moving the patient to the other permitted practice and back cascaded both
   documents in each direction.
9. Moving the case to an unowned third practice was refused by cases RLS.
10. `evidence_states` retained exactly `gap,met,void` and had zero application
    triggers, matching its approved-reference contract.

All created databases and the restricted login were removed. A separate final
query found zero `synthetic_ra04_%` databases and roles.

The derivation migration was then mutated so the case-evidence trigger no
longer ran for a direct `practice_id` update. The fixture failed in fresh mode
at `T3_direct_practice_update_is_forced_back` with exit 1 and still removed its
database and login. Restoring the exact migration hash returned the complete
fresh/upgrade matrix to passing.

## Actual command and prerequisites

```text
python3 scripts/test-practice-derivation.py \
  --output .kbd-orchestrator/phases/runtime-architecture/evidence/ra-04-projection-grants/task-9-practice-derivation-restored.json
```

Observed result: **Passed**; fresh 10/10, upgrade 10/10, three cleanup entries
passed, and final fixture database/role counts were zero.

Prerequisites were available: the existing local Compose PostgreSQL service,
its in-container `flint` administrator, Python 3, `psql`, the current schema and
derivation migration, and synthetic identifiers/data. No external network,
production database, production credential, patient record, or clinical text
was used.

The fixture now accepts `--output` after inspection found that its original
fixed task-4 path would let a later acceptance run replace earlier evidence.
The task-9 run wrote a new receipt and preserved the task-4 receipt hash
`aa5021cb7ee5ad0c99053013bca4cfbe50123a68469c4fdd4559fc42cfc00b50`.

Raw output and current source hashes are recorded in
`task-9-acceptance.json`.

## Scope and limit

The only retained implementation change is the fixture's explicit output-path
option. The controlled SQL mutation was restored to hash
`a99e12477298e76a1efb18aebe5c2563707d9cb2d0662fbf58f8b576d9935bb4`.
No application runtime, schema, migration, dependency, architecture document,
or companion repository changed.

The guard traces to the observed failure scenario that a restricted caller
directly forges a derived practice value and the trigger does not overwrite it.
The uncomfortable limit is that this proves the database boundary with
synthetic local roles. It does not prove Electric delivery, production role
installation, browser behavior, Tauri, or a physical device. No T2/T3 or real
clinical-data operation ran.
