## Context

This change implements runtime order 4 from the reviewed [phase plan](../../../.kbd-orchestrator/phases/runtime-architecture/plan.md). Source inspection found reusable primitives but no proof that the composed target path works. Read the assessment and its review supplement before editing.

## Goals / Non-Goals

**Goals:** Implement a bounded internal FRF-to-PGlite materializer inside the owned worker and apply the approved projection revision, including the cases gate field. Apply SQL rows plus per-shape checkpoints in one transaction, then publish coherent graph entities/lists, preserving all three reference keys and generation/refetch behavior. Publish an authorized replica revalidation failure into the shared RA06 session-revocation event seam before any later materializer result can reach Zustand.

**Non-Goals:** No unrelated placeholder views, general dependency refresh, clinical automatic replay or additional graph/query-cache owner. Do not claim native or release evidence from a fixture.

## Decisions

Ownership: ASO: replica worker materialization service, shared sync projection/key mapping, replica-failure session event publisher and explicit live integration runner; PEM: adopted committed projection API. RA06 owns the synchronous Zustand fence that consumes the event. RA13 owns foreground/resume orchestration and draft recovery.

Dependencies: ra-11b-worker-ownership. Confirm their implementation evidence before applying this change. This root OpenSpec artifact coordinates the user-named five-repository workspace; companion implementation must run under its own repository rules and only within the explicitly assigned modules.

- The ra-11a `@electric-sql/pglite-sync` candidate is blocked and prohibited because it sends `log=full`, which the authorized FRF facade rejects. RA11c therefore owns a bounded internal adapter over the existing authorized shape response. It adds no dependency and may not broaden the facade query contract.
- Connect the internal materializer within ra-11b ownership and remove the unused/synthetic-offset read-path seam from active use. Persist each shape's opaque handle and offset in the same local SQL transaction as its rows; a single aggregate offset is not a checkpoint.
- Make the real authorized-stream owner call the shared session-revocation event publisher when grant revalidation fails, authority times out or the server reports the captured session/grant tuple changed. Fence its captured generation before it can commit SQL, advance a checkpoint or publish a graph batch.
- Implement committed SQL-to-graph publication with explicit primary keys, replacement generations and catch-up status.
- Before a new projector accepts a durable checkpoint, reconstruct a complete graph replacement from committed SQL. This closes the process-death interval between the atomic SQL/checkpoint commit and the in-memory graph publication.
- Run real Postgres→Gate/FRF→SQL→graph acceptance with update/delete/crash/refetch; use isolated durable synthetic storage for restart cases and memory-only browser baseline until persistence policy is approved.

The exact PEM `ra11c.1` packages are approved independently for their optional scoped-runtime persistence control. That API defaults to persistence enabled and is needed to measure the memory-only browser mode. Its package label identifies the source revision; it does not approve the PGlite materializer, whose production adoption remains blocked by G-MEASURE.

The assembled RA11c materializer remains disabled in `GraphProvider` unless a
qualification build sets `VITE_ASO_ENABLE_RA11C_MATERIALIZER=experimental`.
No other value enables it. This preserves a real caller for local evidence
without adopting a candidate that failed the browser memory gate.

Keep the phase's G-PIN, G-REV, G-DATA, G-SYNC, G-NATIVE and G-MEASURE checkpoints. A missing decision blocks its dependent implementation; it does not authorize a default or silent pin override. All new modules and operation contracts described here are proposed until implemented.

## Risks / Trade-offs

No duplicated graph writer and no shadow graph-snapshot table pretending to materialize clinical rows.

Use synthetic data only. Preserve three evidence states, independently enforced clinical authority, generated tokens and no query cache. Reopen cited source before writing; no file-presence or helper-only test can prove an assembled runtime.

## Validation and rollback

Run per-stack T0 after edits and targeted T1 behavior checks when the unit is complete. Test each scenario in spec.md at the actual boundary, including named denial/race/failure cases. Demonstrate sensitive guards fail under controlled sabotage and restore the code. Run artifact-refiner then isolated adversarial review before completion/archive.

Phase T2 includes Rust workspace test/build, web build, Flutter analyze/test and architecture audit; Rust builds are sequential. Broader T3 is restricted to a reached milestone. Never claim a silently skipped prerequisite passed.

Keep additive schema and compatibility steps reversible where possible; preserve current authorized generation until coherent handover. A failed prerequisite or conformance check leaves this change Blocked and dependent work unstarted.
