## Context

This change implements runtime order 2 from the reviewed [phase plan](../../../.kbd-orchestrator/phases/runtime-architecture/plan.md). Source inspection found reusable primitives but no proof that the composed target path works. Read the assessment and its review supplement before editing.

## Goals / Non-Goals

**Goals:** Implement the approved shape route through Gate→FRF→private Electric, including initial snapshot, handles, offsets, control messages, errors and refetch. Prove committed field transitions, including gate_affirmed_at clearing after removal in another session, traverse the live authorized stream. Authorization applies to every request and handle binding. The certified composition has no client-reachable upstream bypass.

**Non-Goals:** No unrelated placeholder views, general dependency refresh, clinical automatic replay or additional graph/query-cache owner. Do not claim native or release evidence from a fixture.

## Decisions

Ownership: FRF: gateway/application/port modules for a proposed Electric facade and outbound adapter; ASO: compose and Gate route configuration.

Dependencies: ra-04-projection-grants. Confirm their implementation evidence before applying this change. This root OpenSpec artifact coordinates the user-named five-repository workspace; companion implementation must run under its own repository rules and only within the explicitly assigned modules.

- Implement the facade use case and outbound adapter using the grant contract; preserve protocol headers and control frames rather than the current synthetic-offset bridge.
- Wire the complete required FRF service dependencies and Gate routes in a bounded test composition; align Gate's asymmetric signing configuration with FRF's verifier, require the configured issuer and audience, and keep unrelated media/agent lanes disabled.
- Run the real HTTP path with allowed/denied initial, continuation and expired-handle requests plus topology evidence.

Keep the phase's G-PIN, G-REV, G-DATA, G-SYNC, G-NATIVE and G-MEASURE checkpoints. A missing decision blocks its dependent implementation; it does not authorize a default or silent pin override. All new modules and operation contracts described here are proposed until implemented.

## Risks / Trade-offs

A server-only shape proof is not PGlite/graph/browser proof. Generic FRF event routes are not a substitute.

Use synthetic data only. Preserve three evidence states, independently enforced clinical authority, generated tokens and no query cache. Reopen cited source before writing; no file-presence or helper-only test can prove an assembled runtime.

## Validation and rollback

Run per-stack T0 after edits and targeted T1 behavior checks when the unit is complete. Test each scenario in spec.md at the actual boundary, including named denial/race/failure cases. Demonstrate sensitive guards fail under controlled sabotage and restore the code. Run artifact-refiner then isolated adversarial review before completion/archive.

Phase T2 includes Rust workspace test/build, web build, Flutter analyze/test and architecture audit; Rust builds are sequential. Broader T3 is restricted to a reached milestone. Never claim a silently skipped prerequisite passed.

Keep additive schema and compatibility steps reversible where possible; preserve current authorized generation until coherent handover. A failed prerequisite or conformance check leaves this change Blocked and dependent work unstarted.
