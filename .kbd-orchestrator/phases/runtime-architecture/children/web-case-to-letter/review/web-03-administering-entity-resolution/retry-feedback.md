# Web-03 cumulative review resolution

## Task lifecycle

Task 2.1 is the active KBD task and remains unchecked until its adversarial review passes and the end-task hook runs. Task 3.1 is the next task and is outside this review boundary. The change will not be archived during task 2.1.

## Schema command provenance

Fixed. The schema probe now records its required `--output` argument. Both retained task-2 receipts state the exact runnable command and include a metadata-correction record. Python compilation, strict OpenSpec validation, and the artifact-refiner validator pass after the repair.

## Artifact evidence scope

Fixed. The cargo-check, lint, strict-OpenSpec, rustfmt, and typecheck logs existed in the artifact but were absent from the isolated packet's `files.txt`. All five source evidence paths are now included in the review scope.

## Verification-tier timing

The requested workspace build/tests, Flutter analyze/tests, and architecture audit are change-completion or broader gates in `.kbd-orchestrator/constraints.md`. This review is the active mid-change task 2.1. The governing Web-03 design requires only applicable Tier 0 and focused Tier 1 here, assigns child Tier 2 to Web-17, and explicitly excludes Flutter/mobile. Running the requested broad commands during this task would violate the repository verification-tier contract and the operator's browser-first order. The artifact's 11/11 count refers only to `.refiner/artifacts/web-03-administering-entity-resolution/constraints.json`; it does not claim that project-wide completion gates ran.

## Exact focused command provenance

Fixed. `scripts/test-web03-resolution-service.py` now overrides the inherited schema-probe command metadata with its own exact script name and required `--output` path. The four task-3/task-4 service receipts carry those exact commands and explicit metadata-correction records. `task-5-command-receipt.json` now lists all five Vitest file paths instead of the descriptive placeholder. Both probe scripts compile and the artifact-refiner validator remains Passed at 11/11.

## Resolver-only gate authorization

Fixed with observed red/green evidence. A mounted gate-policy test restricted the session to `resolve_administering_entity`; the existing implementation returned 403 for resolution POST because it called the `case_write` AppServices target method. `AppServices::authorize_administering_entity_target` now validates the resolver capability and delegates to the resolver-specific `CaseRepository::authorize_administering_entity_target`. The PostgreSQL adapter calls `aso.authorize_administering_entity_target(target_case)`, whose migration uses `aso.require_case(target_case, 'resolve_administering_entity')` instead of `case_write`. The gate uses this path for resolution POST and command lookup. The same mounted test passes 1/1 and confirms that authorization caused no repository write. Fresh and populated-upgrade disposable PostgreSQL probes passed through the restricted executor, including the actual AppServices lifecycle. The three mounted resolution HTTP tests, affected-crate check, rustfmt check, and strict OpenSpec validation pass after the repair.

## Unresolved resolution read authorization

Fixed with observed red/green evidence. Review pass 7 found that the GET resolution gate called `read_administering_entity`, which returned 404 when a valid case had no resolution row and prevented the route from representing its unresolved state. A mounted regression reproduced the 404. The gate now calls `AppServices::read_case` to authorize the case target under `case:read`, then forwards to the resolution route. The same test passes 1/1 and confirms no repository write occurred.

## Post-commit reload reconciliation

Fixed with observed red/green evidence. Review pass 8 found that a successful resolution receipt followed by a failed committed-state reload fell into the generic error path and cleared `pendingCommandId`. A hook regression reproduced `status: error` with a null command ID. The reload now has a separate failure path that publishes `uncertain` and retains `receipt.value.commandId`, so exact command lookup remains available. The regression passes 3/3, and the full five-file focused browser set passes 20/20.

## Idempotent retry target authorization

Fixed with observed red/green evidence. Review pass 9 found that the SQL function returned an existing command receipt before calling `aso.require_case`. The disposable PostgreSQL probe now moves the target case out of the actor's practice inside a rollback-only synthetic transaction and retries the durable command. With the old ordering temporarily restored, the retry returned successfully and the security assertion failed. `aso.require_case(target_case, 'resolve_administering_entity')` now runs before reading or returning the existing receipt. Fresh and populated-upgrade probes both pass and observe SQLSTATE `42501`; cleanup passes.

## Independent critic and harness pass 10

Fixed. Effective-dated `payer_plan_enrollments` now make member identity part of authoritative candidate evaluation. Entity, plan, enrollment, and delegation-rule mutations atomically advance affected case resolution revisions and delete current resolutions. The pending command ID now survives remount through a session/practice/authorization-revision/epoch/case-scoped vanilla Zustand store backed by tab session storage. Immutable command receipts and audits record the exact entity, path, source, validity, and input revisions used. The panel renders the entity display name and source-document identity. Fresh and populated-upgrade PostgreSQL probes cover the repaired behavior.

The harness warning about future and inactive rules remains an accuracy concern but does not open downstream work: both produce a parked state. A later vocabulary expansion can distinguish those conditions without weakening Web-03's blocking contract.

## Final receipt-owner authorization repair

The first final fresh probe observed SQLSTATE `42501` when the security-definer function owner read `documents.document_version`. The repair grants the non-login `aso_case_owner` role only `id` and `document_version` read access under its trusted owner policy. The login executor remains execute-only and direct writes are still refused. Fresh and populated-upgrade probes pass after the repair.
