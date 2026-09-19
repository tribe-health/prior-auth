## Context

This change implements runtime order 3 from the reviewed [phase plan](../../../.kbd-orchestrator/phases/runtime-architecture/plan.md). Source inspection found reusable primitives but no proof that the composed target path works. Read the assessment and its review supplement before editing.

## Goals / Non-Goals

**Goals:** Provide a strict explicit-scope runtime entrypoint with cancellable hydration, tracked saves, drainable disposal and queued-flush cancellation. Keep compatibility APIs separated; ASO must not use global fallback status/actions or automatic clinical replay.

**Non-Goals:** No unrelated placeholder views, general dependency refresh, clinical automatic replay or additional graph/query-cache owner. Do not claim native or release evidence from a fixture.

## Decisions

Ownership: PEM: core local-first-runtime/graph-actions/realtime-manager/Electric listener cleanup and React graph-store binding; public exports and focused package tests.

Dependencies: ra-06-bounded-revocation. Confirm their implementation evidence before applying this change. This root OpenSpec artifact coordinates the user-named five-repository workspace; companion implementation must run under its own repository rules and only within the explicitly assigned modules.

- Add scope-bound runtime/status/action ownership while preserving existing callers through explicit compatibility adapters.
- Track async hydration, saves, listener registration and flush work so cancellation/drain have testable completion semantics.
- Exercise adversarial interleavings with real persistence and package-level scoped React consumers; exclude clinical actions from replay.

Keep the phase's G-PIN, G-REV, G-DATA, G-SYNC, G-NATIVE and G-MEASURE checkpoints. A missing decision blocks its dependent implementation; it does not authorize a default or silent pin override. All new modules and operation contracts described here are proposed until implemented.

## Risks / Trade-offs

Creating a fresh graph object without replacing global action/status ownership cannot satisfy this change.

Use synthetic data only. Preserve three evidence states, independently enforced clinical authority, generated tokens and no query cache. Reopen cited source before writing; no file-presence or helper-only test can prove an assembled runtime.

## Validation and rollback

Run per-stack T0 after edits and targeted T1 behavior checks when the unit is complete. Test each scenario in spec.md at the actual boundary, including named denial/race/failure cases. Demonstrate sensitive guards fail under controlled sabotage and restore the code. Run artifact-refiner then isolated adversarial review before completion/archive.

Phase T2 includes Rust workspace test/build, web build, Flutter analyze/test and architecture audit; Rust builds are sequential. Broader T3 is restricted to a reached milestone. Never claim a silently skipped prerequisite passed.

Keep additive schema and compatibility steps reversible where possible; preserve current authorized generation until coherent handover. A failed prerequisite or conformance check leaves this change Blocked and dependent work unstarted.
