## Context

This change implements runtime order 4 from the reviewed [phase plan](../../../.kbd-orchestrator/phases/runtime-architecture/plan.md). Source inspection found reusable primitives but no proof that the composed target path works. Read the assessment and its review supplement before editing.

## Goals / Non-Goals

**Goals:** Wire the proven materializer into the owned worker and the approved projection revision, including the cases gate field. Apply SQL rows plus real checkpoints transactionally, then publish coherent graph entities/lists, preserving all three reference keys and generation/refetch behavior.

**Non-Goals:** No unrelated placeholder views, general dependency refresh, clinical automatic replay or additional graph/query-cache owner. Do not claim native or release evidence from a fixture.

## Decisions

Ownership: ASO: replica worker materialization service, shared sync projection/key mapping and explicit live integration runner; PEM: adopted committed projection API.

Dependencies: ra-11b-worker-ownership. Confirm their implementation evidence before applying this change. This root OpenSpec artifact coordinates the user-named five-repository workspace; companion implementation must run under its own repository rules and only within the explicitly assigned modules.

- Connect the ra-11a materializer within ra-11b ownership and remove the unused/synthetic-offset read-path seam from active use.
- Implement committed SQL-to-graph publication with explicit primary keys, replacement generations and catch-up status.
- Run real Postgres→Gate/FRF→SQL→graph acceptance with update/delete/crash/refetch; use isolated durable synthetic storage for restart cases and memory-only browser baseline until persistence policy is approved.

Keep the phase's G-PIN, G-REV, G-DATA, G-SYNC, G-NATIVE and G-MEASURE checkpoints. A missing decision blocks its dependent implementation; it does not authorize a default or silent pin override. All new modules and operation contracts described here are proposed until implemented.

## Risks / Trade-offs

No duplicated graph writer and no shadow graph-snapshot table pretending to materialize clinical rows.

Use synthetic data only. Preserve three evidence states, independently enforced clinical authority, generated tokens and no query cache. Reopen cited source before writing; no file-presence or helper-only test can prove an assembled runtime.

## Validation and rollback

Run per-stack T0 after edits and targeted T1 behavior checks when the unit is complete. Test each scenario in spec.md at the actual boundary, including named denial/race/failure cases. Demonstrate sensitive guards fail under controlled sabotage and restore the code. Run artifact-refiner then isolated adversarial review before completion/archive.

Phase T2 includes Rust workspace test/build, web build, Flutter analyze/test and architecture audit; Rust builds are sequential. Broader T3 is restricted to a reached milestone. Never claim a silently skipped prerequisite passed.

Keep additive schema and compatibility steps reversible where possible; preserve current authorized generation until coherent handover. A failed prerequisite or conformance check leaves this change Blocked and dependent work unstarted.
