# Web-03 task 2.1 focused qualification

Result: **Passed** at focused T0/T1. This task verifies administering-entity resolution only. It does not certify the complete browser case-to-letter scenario; Web-17 owns that local Tier 2 actual-browser run. Tauri and mobile remain deferred.

## Delivered behavior

- The resolver evaluates verified practice, payer, effective-dated member enrollment, plan, procedure, service date, delegation rule, and active administering entity.
- `resolved`, `missing`, `ambiguous`, `conflicting`, and `expired` are durable named outcomes. Only `resolved` opens downstream evidence work.
- Entity, plan, enrollment, delegation-rule, or selected source-document changes advance affected case resolution revisions and remove current resolution rows.
- The browser mutation accepts only command ID and expected case-input revision; caller-supplied authoritative output fields are rejected.
- Immutable receipts and audit data retain entity, path, validity, source name/effective date, and entity/plan/enrollment/rule/source-document versions. Reported validity is the intersection of plan, enrollment, and rule dates.
- Transport-uncertain command identity and expected input revision survive React remount in tab-scoped storage keyed by identity, session, practice, authorization revision, epoch, and case. Exact lookup runs before an older committed row can be accepted. A lookup 404 reissues the same command idempotently before current state is read.
- A command is persisted only after the case revision read and immediately before dispatch. A terminal stale-revision or incomplete-input retry clears the absent command, reloads committed state, and permits a fresh resolution with specific guidance through automatic and manual reconciliation.
- An effective rule pointing to an inactive entity returns `missing` with “No active matching path” copy instead of being mislabeled as expired.
- The responsive panel shows the administering-entity display name plus source name, effective date, and version; it uses named parked states, 44px controls, and reduced-motion-safe animation.

## Observed qualification

| Check | Observed result |
|---|---|
| Five focused Vitest files | Passed: 5 files, 28 tests |
| TypeScript | Passed: `tsc --noEmit` |
| Web lint | Passed: `oxlint` |
| Mounted administering-entity HTTP | Passed: 3 tests |
| Resolver-only gate policy | Passed: 1 test; no repository mutation |
| Affected Rust crates | Passed: `aso-host`, `aso-server-axum`, and `aso-web-server` compiled |
| Rust formatting | Passed |
| Strict OpenSpec | Passed |
| Fresh PostgreSQL/AppServices lifecycle | Passed; 4 named lifecycle assertions, all five states, four invalidation scenarios, three-way validity intersection, SQLSTATE 42501 retry refusal, direct-write refusal, cleanup |
| Populated-upgrade PostgreSQL/AppServices lifecycle | Passed with the same runtime checks; preexisting cases and affirmations survived |
| Fixture verifier | Passed; manifest lock hashes match |
| Artifact-refiner | Passed: 14 deterministic checks across 13 blocking constraints and 79 immutable source/evidence snapshots |
| Independent artifact critic | Passed after verifying all 79 snapshot hashes and the recovery, classification, authority, invalidation, provenance, and claim boundaries |
| Cross-model adversarial review | Passed: harness-native `gpt-5.5`, distinct from producer `gpt-6-astra`, 0 critical / 0 warning / 0 suggestion |
| Anti-sycophancy gate | Passed: strict score 0.0 |

## Negative controls

The retained controls went red before restoration:

- Removing unknown-field rejection allowed caller-selected entity/path input.
- Reusing general `case_write` authorization refused a valid resolver-only caller.
- Authorizing an unresolved read against the absent resolution row returned 404 before route handling.
- Losing the post-commit command ID made a saved result unreconcilable.
- Returning an idempotent receipt before target authorization allowed an out-of-scope retry.
- Removing member-enrollment predicates resolved an unenrolled member instead of returning `missing`.
- Disabling entity invalidation left a stale resolved row after deactivation.
- Removing pre-dispatch pending-command retention lost exact reconciliation after remount.
- The independent critic showed that treating the first lookup 404 as terminal could race a late commit; the restored hook test fixes the required lookup, same-ID retry, then current-read order.
- A pre-dispatch case-read 5xx previously created a null-payload pending command; the repaired hook stores nothing until dispatch is possible.
- A lookup-404 retry returning `stale_revision` previously stayed uncertain forever; the repaired hook clears it and accepts a fresh command.
- A lookup-404 retry returning `case_inputs_incomplete` previously stayed uncertain forever; the repaired hook clears it and shows the missing-input guidance.
- The visible “Check saved command” path initially dropped that guidance after reload; its direct interaction regression now preserves the message.
- An inactive effective entity previously rendered as an expired rule; fresh and populated-upgrade probes now require `missing`, and the component test requires accurate copy.

All corresponding restored checks pass. The first versioned-receipt fresh run also observed SQLSTATE 42501 because the security-definer owner lacked source-version read access. Column-limited `id, document_version` access for the non-login owner repaired it; the runtime executor remains execute-only and direct writes remain refused.

## Remaining boundary

Web-03 does not implement document upload, extraction, criteria matching, evidence assembly, letter generation, signing, submission, denial response, or the complete actual-browser scenario. Those remain in Web-04 through Web-15 and Web-17. No desktop or mobile source was changed by this task.
