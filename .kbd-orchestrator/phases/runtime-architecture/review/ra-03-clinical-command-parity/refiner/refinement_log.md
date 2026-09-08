# RA-03 refinement log

## Iteration 1 — 2026-09-07

### Specify

Bounded the artifact to RA-03 completion evidence and identified four unknown delivery surfaces: browser reassessment control, browser signing/gate view, Tauri command registration, and deployed/device behavior.

### Plan

Selected ten constraints covering verified identity, independent authority, reconciliation, evidence-state fidelity, PEM exclusion, production composition, truthful caller classification, migration compatibility, verification scope, and bundle integrity.

### Execute

Ran applicable Rust and TypeScript T0, focused Rust/React T1, Python/YAML/OpenSpec/link/diff checks, and current-hash validation of recorded live PostgreSQL receipts. Generated the report and checklist.

### Reflect

The requested server behavior is present and tested. Browser and Tauri mutation callers are inactive. One broad Vitest run happened because of an extra argument separator; its unrelated timeout is retained as observed evidence and is excluded from the RA-03 pass claim.

### Persist

Persisted the manifest, constraints, specification, plan, decisions, outputs, state, registry, validator, and captured validator output. No visual preview applies to this content/evidence artifact.

Decision: terminate at 10 of 10 satisfied constraints.

## Iteration 2 — 2026-09-07

### Specify

Converted the first isolated judge's two critical and two warning findings into four bounded constraints: refuse unsafe publications before any separately committed migration, freeze source documents cited by approved or signed letters, scope evidence-hook results to a case generation, and clear command correlation after every definitive outcome.

### Plan

Kept applied migration checksums stable. Added a migration-runner preflight, one additive document-immutability migration, focused PostgreSQL fixtures for fresh and populated upgrades, and focused React hook cases for success, lookup, refusal, and A-to-B-to-A navigation.

### Execute

The live fixtures observed unsafe-publication refusal before schema creation, successful repair and rerun under an explicit-table publication, local-ledger exclusion, and SQLSTATE `42501` for in-place changes to an approved source document. The focused hook run passed 16 tests across two files.

### Reflect

The initial evidence had proved the command ledgers but had not proved their publication boundary or the immutability of the content behind an approved claim. It also treated hook state as case keyed rather than request-generation scoped. Those were implementation defects, not documentation gaps.

### Persist

Updated the architecture documents, source inventory, current-hash receipts, checklist, report, decisions, persistent state, and deterministic validator. The repaired bundle is the only input to the second isolated review.

Decision: request a fresh isolated verdict after all ten constraints pass.

## Iteration 3 — 2026-09-07

### Specify

The second isolated judge found five critical defects and one warning: explicit local-table publication was still possible, approval could return to draft, source edits could race approval, QA could move away from an approved letter, and overlapping browser commands could corrupt reconciliation state.

### Plan

Preserve migrations 0601 through 0604. Add migration 0605 to replace the affected trigger functions and install a publication event trigger. Add live probes for every database finding and expose one synchronous mutation slot in each browser hook.

### Execute

The final fresh and populated-upgrade campaigns passed 20 and 26 signing checks plus 16 and 22 reassessment checks. Signing emitted 14 lifecycle markers, including terminal approval, old-and-new QA protection, concurrent source serialization and DDL publication refusal. The hook suites passed 18 tests and include duplicate-submission cases.

### Reflect

The prior fixes handled sequential mutations but did not cover indirect row moves, concurrent transactions or explicit publication membership. A single correlation field also needed command ownership, not only case-generation fencing. The new guards directly exercise those failure modes.

### Persist

Updated all four architecture documents, the source inventory, canonical live receipts, PEM exclusion receipt, checklist, report, decisions, state, registry and deterministic hashes. The third packet is built only after this bundle validates.

Decision: request a third fresh isolated verdict; iteration three is the configured refinement limit.

## Iteration 4 — 2026-09-08

### Specify

The third isolated judge found three critical defects and one warning: the DDL
guard was installed after separately committed ledger migrations, its
table-name predicate could be evaded by rename, gateway 5xx outcomes discarded
reconciliation IDs, and an actorless read route remained mounted without a
verified repository operation.

### Plan

Install the publication boundary as migration 0600 before every command ledger,
key it by relation OID, preserve comment-based upgrade detection, retain command
IDs for network/408/5xx outcomes, and remove the actorless route from production
composition. Extend the refinement limit because critical findings cannot be
accepted at the prior cap.

### Execute

Fresh and populated-upgrade signing campaigns passed 21 and 27 checks, including
direct and rename-then-publish refusal. Reassessment campaigns passed 16 and 22
checks. All four fixtures passed six cleanup checks. The focused hook suites
passed 20 tests. Negative controls made the new HTTP tests and OID publication
check fail, then restored both sources byte-for-byte.

### Reflect

Migration preflight alone could detect exposure after the fact, while the new
0600 boundary prevents the exposure transaction. The UI recovery contract also
needed to classify upstream HTTP failure as uncertain rather than treating every
structured error as definitive.

### Persist

Updated the architecture documents, current source inventory, four canonical
database receipts, PEM exclusion receipt, red-proof receipts, checklist,
report, decisions, state and deterministic validator inputs.

Decision: request a fourth fresh isolated verdict after the iteration-four
bundle validates.

## Iteration 5 — 2026-09-08

### Specify

The fourth isolated judge found three critical defects: protected ledger OIDs
were absent from schema-publication checks, row triggers did not cover
`TRUNCATE`, and an uncertain browser command released its mutation slot before
lookup.

### Plan

Extend the OID publication boundary to `pg_publication_namespace`, add an
ordinary checksummed statement-trigger migration for protected clinical
evidence, and keep the command owner in an explicit uncertain state. Add one
negative control for each failure mode.

### Execute

Fresh and populated-upgrade signing campaigns passed 24 and 30 checks and
emitted 16 lifecycle markers. Reassessment campaigns passed 16 and 22 checks.
All four fixtures passed six cleanup checks. The focused hook suites passed 20
tests. Each new negative control failed after its protection was disabled and
restored the source to its original hash.

### Reflect

Explicit-table publication protection does not imply schema-publication
protection, row mutation triggers do not govern statement-level truncation, and
retaining a command ID in display state does not reserve the operation slot.
The new controls cover those distinct mechanisms.

### Persist

Updated the architecture documents, migration inventory, canonical database
receipts, PEM receipt, red-proof receipts, checklist, report, decisions,
persistent state and deterministic validator inputs.

Decision: request a fifth fresh isolated verdict after the iteration-five
bundle validates.

## Iteration 6 — 2026-09-08

### Specify

The fifth isolated judge found four critical defects and one warning: concurrent
publication/table DDL could observe stale catalogs, approval could race QA
truncation, evidence commands omitted selected practice, navigation discarded
unresolved ownership, and Gate policy converted backend outages to denials.

### Plan

Install a DDL-start lock protocol before command-ledger creation, add an approval
relation lock plus QA revalidation, propagate practice through evidence mutation
and lookup, retain command ownership in a process-scoped identity/practice/case
registry, and preserve typed policy availability errors.

### Execute

Fresh and populated-upgrade signing campaigns passed 25 and 31 checks and 22
lifecycle markers. Reassessment campaigns passed 16 and 22 checks with seven
markers. Every fixture passed six cleanup checks. Focused Rust tests passed host
5/4, Axum 5/4/13, web-server 2 and desktop 4. The focused hooks passed 25 tests.
Five new negative controls failed after each repair was disabled and restored
all source hashes.

### Reflect

End-of-DDL validation cannot resolve write-skew without start serialization;
row and statement triggers need a common relation lock; active view state is
too short-lived to own an uncertain command; and a policy refusal is a different
operational result from an unavailable target reader.

### Persist

Updated architecture documents, the 50-source inventory, the migration set,
canonical database and PEM receipts, ten total negative controls, checklist,
report, decisions, state and validator inputs.

Decision: request a sixth fresh isolated verdict after the iteration-six bundle
validates.

## Iteration 7 — 2026-09-08

### Specify

The sixth isolated judge found one critical race: claim mappings could be truncated while a letter was draft, after which the waiting approval could commit without the cited assertion set.

### Plan

Extend migration 0608 additively with a claim-relation lock and source-set revalidation. Exercise both transaction commit orders and prove the new control turns red when removed.

### Execute

Fresh and populated-upgrade signing campaigns passed 25 and 31 checks with 24 lifecycle assertions and six cleanup checks each. Claim-truncate-first refused approval as incomplete; approval-first made claim truncation wait and then fail. The negative control reproduced approval without claims before exact source restoration.

### Reflect

Protecting approved rows from later truncation does not cover a truncation that commits while the target is still draft. Approval must serialize with the relation-level operation and revalidate the complete source set after acquiring the lock.

### Persist

Updated the migration, two-order integration fixture, architecture contracts, current source inventory, canonical database receipts, red proof, report, checklist, state, and validator inputs.

Decision: request a seventh fresh isolated verdict after the iteration-seven bundle validates.
