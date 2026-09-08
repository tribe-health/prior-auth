## Context

This change implements runtime order 2 from the reviewed [phase plan](../../../.kbd-orchestrator/phases/runtime-architecture/plan.md). Source inspection found reusable primitives but no proof that the composed target path works. Read the assessment and its review supplement before editing.

## Goals / Non-Goals

**Goals:** Establish one enforceable revocation contract across cached identity, minting, open responses and reconnects. Clinical commands freshly validate authority. Implement the server logout result consumed by browser logoutPending; retain original session linkage and stop streams when revalidation cannot succeed.

**Non-Goals:** No unrelated placeholder views, general dependency refresh, clinical automatic replay or additional graph/query-cache owner. Do not claim native or release evidence from a fixture.

## Decisions

Ownership: Gate: cache, Kratos validation and ASO invalidation integration; FRF: facade/subscription lifecycle and identity expiry; ASO: session/logout and membership-revision service.

Dependencies: ra-05-authorized-shape-facade. Confirm their implementation evidence before applying this change. This root OpenSpec artifact coordinates the user-named five-repository workspace; companion implementation must run under its own repository rules and only within the explicitly assigned modules.

- Before code, define and record the numeric bound, component budgets, clock assumptions and invalidation authority; add a deterministic conformance harness.
- Implement expiry-aware caching/invalidation and a bounded active-response lease, including reconnect and failure behavior.
- Measure logout, role removal, expiry and stale-refill races across Gate/FRF; preserve existing per-event tenant/view checks.

Keep the phase's G-PIN, G-REV, G-DATA, G-SYNC, G-NATIVE and G-MEASURE checkpoints. A missing decision blocks its dependent implementation; it does not authorize a default or silent pin override. All new modules and operation contracts described here are proposed until implemented.

## Risks / Trade-offs

Budget selection is an explicit engineering decision before implementation; this plan invents no approved SLA. Protected agent/media activation remains out of scope.

Use synthetic data only. Preserve three evidence states, independently enforced clinical authority, generated tokens and no query cache. Reopen cited source before writing; no file-presence or helper-only test can prove an assembled runtime.

## Validation and rollback

Run per-stack T0 after edits and targeted T1 behavior checks when the unit is complete. Test each scenario in spec.md at the actual boundary, including named denial/race/failure cases. Demonstrate sensitive guards fail under controlled sabotage and restore the code. Run artifact-refiner then isolated adversarial review before completion/archive.

Phase T2 includes Rust workspace test/build, web build, Flutter analyze/test and architecture audit; Rust builds are sequential. Broader T3 is restricted to a reached milestone. Never claim a silently skipped prerequisite passed.

Keep additive schema and compatibility steps reversible where possible; preserve current authorized generation until coherent handover. A failed prerequisite or conformance check leaves this change Blocked and dependent work unstarted.
