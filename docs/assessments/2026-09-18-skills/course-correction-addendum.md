ADDENDUM TO THE 2026-09-18 OPERATOR COURSE CORRECTION — web-case-to-letter

Same precedence and the same timing as the course correction: finish the current web-06 task first; act at the web-06 close boundary. Nothing here weakens the four rules, clinical authority, the PHI boundary or the citation rule.

## A. Append four entries to `.prometheus/gotchas.md`

Append only; do not rewrite existing entries. Date each entry. State the rule, the change and review round where it was found, and the file that shows the correct form. Keep each under eight lines.

1. **Re-authorize the target before the idempotent return.** In a command function, `PERFORM aso.require_case(target, …)` (or the command's own target authorization) runs before `RETURN original.result`. Comparing `original.actor_id` is not enough: an actor whose access to the target has ended must not receive the stored receipt. Found web-03 round 9. Correct ordering: `migrations/server/2026090619_administering_entity_resolution_commands.sql` — actor context, advisory lock, `require_case`, then the idempotent return. `require_case` checks practice match only; the command's own authority is still written per command. Guard: `idempotent_retry_reauthorizes_case_target` in `scripts/test-web03-resolution-service.py`.
2. **Never edit an applied migration.** A change to applied SQL is a new forward migration; the original file stays byte-for-byte. The runner reports `server migration checksum mismatch` otherwise. Found web-06 repair review, 2026-09-18.
3. **A replica `ADD COLUMN … NOT NULL` needs a `DEFAULT` or a backfill.** A fresh-install proof cannot see the failure; only the populated-replica upgrade proof does. Found web-02 pass 2 and again web-05 pass 2. Guards: `web/src/shared/sync/catalog-conformance.test.ts`, `web/src/shared/sync/pglite-schema.test.ts`. (This is the entry course-correction §5 already asked for; write it once.)
4. **Release command ownership only when the projection agrees.** A command hook releases its runtime-command claim when the projected row matches on revision, status and both fingerprints, never on the HTTP receipt alone. Found web-02 pass 5 and web-03 round 8. Correct form: `web/src/features/case-queue/hooks/use-case-command.ts`.

## B. One authority question — answer before web-07 starts

In `migrations/server/2026090617_durable_case_commands.sql`, the `update` and the `transition` command functions end their idempotent branch with `RETURN original.result;` and call `PERFORM aso.require_case(target_case, 'case_write');` after it. That is the ordering web-03 round 9 ruled CRITICAL. The branch does compare `original.actor_id`, so the exposure is an actor whose access to the case ended after the original command. This was read, not reproduced.

Tell me: is this a defect under ADR-002? If yes, propose a forward migration (do not edit `2026090617`), a red/restore proof that fails on the current ordering, and which change should carry it. If no, quote the reason. Do not fix it before answering.

## C. One check — a question, because no failure has been observed

Nothing cross-checks `crates/aso-host/src/projection.rs` `DEFINITIONS` against `docker/frf/shape-catalog.json`; `catalog-conformance.test.ts` covers catalog, TypeScript columns and the PGlite schema only. Is a seventh `scripts/audit.sh` check, or a Rust unit test comparing the two column lists, worth adding? If you judge yes, name the change that should carry it. Do not add it unasked.

## D. `AGENTS.md`

The "Testing Policy — Local Integration Only" section appears twice. Remove the second copy (1,243 bytes) in the same commit that records this addendum. Touch nothing else in that file; lines 1–208 are managed by `prometheus-context-bootstrap`.

## E. Reply

Reply with: the four gotcha entries as written; your answer to B; your answer to C. Then continue.
