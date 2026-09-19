# web-03 task 1.2 — plan/delegation schema and deterministic fixtures

Date: 2026-09-17

Phase: `runtime-architecture › web-case-to-letter`

Change: `web-03-administering-entity-resolution`

Task: `1.2`

Result: **Passed**

## Delivered schema

Migration `2026090618_administering_entity_resolution_schema.sql` adds:

- practice-scoped administering entities and effective-dated payer plans;
- effective-dated plan delegation rules with entity, criteria-set, submission
  channel, appeal path, and source-document identity;
- the five durable resolution states: `resolved`, `missing`, `ambiguous`,
  `conflicting`, and `expired`;
- case-scoped durable resolution rows bound to the case practice and the case
  input revision;
- row-level security, direct-role denial, local-input publication exclusion,
  and a source-document practice trigger.

The migration is registered as server migration `2026090618`. The executable
design schema contains the same tables, states, relationships, indexes, source
practice check, and direct-access restrictions.

## Deterministic fixture

The frozen Web-00 fixture manifests now contain
`administering_entity_resolution_fixture`. It is directly loadable and defines
one synthetic practice, verified staff principal, payer, patient, source
document, two administering entities, five plan records, six delegation rules,
and five cases.

The expected outcomes are:

| Fixture | Active candidates | Historical candidates | State | Downstream blocked |
|---|---:|---:|---|---|
| `valid` | 1 | 1 | `resolved` | no |
| `missing` | 0 | 0 | `missing` | yes |
| `ambiguous` | 2 | 2 | `ambiguous` | yes |
| `conflicting` | 2 | 2 | `conflicting` | yes |
| `expired` | 0 | 1 | `expired` | yes |

The valid case resolves exactly to rule
`23000000-0000-4000-8000-000000000301`, entity
`21000000-0000-4000-8000-000000000301`, criteria set
`synthetic-lumbar-fusion-2026`, channel `manual_synthetic`, appeal path
`synthetic-standard-appeal`, and source document
`50000000-0000-4000-8000-000000000301`.

## Observed verification

The frozen fixture verifier exited zero and printed:

```text
Passed: administering-entity fixtures classify valid, missing, ambiguous, conflicting, and expired rules deterministically
Passed: manifest lock hashes match
```

An in-memory sabotage changed the second ambiguous rule to the first entity.
The verifier rejected the resulting conflicting state:

```text
Passed: ambiguous-to-conflicting sabotage was detected
Observed: ambiguous: administering-entity outcome is not deterministic
```

The focused local PostgreSQL probe passed against both a fresh database and a
populated upgrade database. Each run applied the actual migration registry,
reran it unchanged, corrupted and restored a migration checksum, loaded the
frozen fixture, and observed all five exact classifications. Both runs also
observed:

```text
Passed: foreign_practice_rule_source_is_refused (SQLSTATE 23514)
Passed: resolved_state_requires_complete_output (SQLSTATE 23514)
Passed: rls_direct_write_publication_and_migration_contract
```

The fresh evidence is `task-2-fresh-schema.json`; the populated-upgrade
evidence is `task-2-upgrade-schema.json`. Both report `result: Passed`, and
both disposable databases and fixture-created roles were removed.

`RUSTUP_TOOLCHAIN=1.97.1 cargo check -p aso-web-server` exited zero:

```text
Finished `dev` profile [unoptimized + debuginfo] target(s) in 22.91s
```

Python compilation and targeted `git diff --check` exited zero.

## Red-green correction

The first fixture run exposed that the pre-existing document JSON-schema
trigger resolves its registry through the session search path. The fixture was
using fully qualified insert targets without selecting `aso`; the migration
had already applied successfully. The loader now selects `aso,public` before
synthetic document insertion. The final fresh and upgrade runs both passed.

## Limits

This task proves the durable schema and deterministic inputs. It does not yet
implement the shell-neutral resolver, command transaction, HTTP route, React
panel, or actual-browser behavior. Those remain tasks 1.3, 1.4, and Web-17.
No Tauri or mobile source changed.

The new guards correspond to observed or structural trust boundaries:

- source-document practice validation prevents a rule from citing another
  practice's document;
- the resolution row check prevents a `resolved` state with missing output;
- RLS and revoked direct privileges keep server-only rules behind the future
  least-privilege resolver function;
- explicit-publication enforcement keeps local matching inputs out of the
  replica.
