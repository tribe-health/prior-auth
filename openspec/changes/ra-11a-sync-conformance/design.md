## Context

This change implements runtime order 4 from the reviewed [phase plan](../../../.kbd-orchestrator/phases/runtime-architecture/plan.md). Source inspection found reusable primitives but no proof that the composed target path works. Read the assessment and its review supplement before editing.

## Goals / Non-Goals

**Goals:** Evaluate the documented PGlite multi-table sync extension against the actual Electric/facade and adopted PEM contract. Use isolated durable synthetic storage to prove transaction, checkpoint, refetch and memory properties before implementing the application worker.

**Non-Goals:** No unrelated placeholder views, general dependency refresh, clinical automatic replay or additional graph/query-cache owner. Do not claim native or release evidence from a fixture.

## Decisions

Ownership: ASO: proposed isolated sync conformance harness and artifact/version evidence; PEM/FRF: adopted public APIs and facade contract, with no production wiring yet.

Dependencies: ra-09-pem-delivery-gate. Confirm their implementation evidence before applying this change. This root OpenSpec artifact coordinates the user-named five-repository workspace; companion implementation must run under its own repository rules and only within the explicitly assigned modules.

- Record actual compatible artifact versions, source/API evidence, representative synthetic data size and pass thresholds before the experiment.
- Build a narrow real-facade/PGlite conformance test for multi-shape commits, durable resume, refetch and memory peak.
- Record pass/failure and the materializer contract consumed by the worker implementation; remove isolated test data afterward.

Keep the phase's G-PIN, G-REV, G-DATA, G-SYNC, G-NATIVE and G-MEASURE checkpoints. A missing decision blocks its dependent implementation; it does not authorize a default or silent pin override. All new modules and operation contracts described here are proposed until implemented.

## Risks / Trade-offs

Durable synthetic test storage proves restart semantics; the memory-only browser baseline cannot prove persistence survival.

Use synthetic data only. Preserve three evidence states, independently enforced clinical authority, generated tokens and no query cache. Reopen cited source before writing; no file-presence or helper-only test can prove an assembled runtime.

## Validation and rollback

Run per-stack T0 after edits and targeted T1 behavior checks when the unit is complete. Test each scenario in spec.md at the actual boundary, including named denial/race/failure cases. Demonstrate sensitive guards fail under controlled sabotage and restore the code. Run artifact-refiner then isolated adversarial review before completion/archive.

Phase T2 includes Rust workspace test/build, web build, Flutter analyze/test and architecture audit; Rust builds are sequential. Broader T3 is restricted to a reached milestone. Never claim a silently skipped prerequisite passed.

Keep additive schema and compatibility steps reversible where possible; preserve current authorized generation until coherent handover. A failed prerequisite or conformance check leaves this change Blocked and dependent work unstarted.
