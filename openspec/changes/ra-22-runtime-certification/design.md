## Context

This change implements runtime order 7 from the reviewed [phase plan](../../../.kbd-orchestrator/phases/runtime-architecture/plan.md). Source inspection found reusable primitives but no proof that the composed target path works. Read the assessment and its review supplement before editing.

## Goals / Non-Goals

**Goals:** Run the 19 runtime scenarios and relevant UI gates against the actual adopted artifacts, with per-surface evidence. Recheck all four invariants, document performance thresholds before measurement, and keep first-row closure separate from full publication certification.

**Non-Goals:** No unrelated placeholder views, general dependency refresh, clinical automatic replay or additional graph/query-cache owner. Do not claim native or release evidence from a fixture.

## Decisions

Ownership: ASO: explicit cross-repository acceptance runner/evidence and phase reflection; all companion owners supply prerequisite services/artifacts and their gate results.

Dependencies: ra-14-live-evidence-timeline, ra-15-attributed-annotations, ra-16-authorized-source-preview, ra-19-native-sqlite-parity, ra-20-safe-browser-updates, ra-21-safe-native-updates. Confirm their implementation evidence before applying this change. This root OpenSpec artifact coordinates the user-named five-repository workspace; companion implementation must run under its own repository rules and only within the explicitly assigned modules.

- Assemble explicit non-skipping service/fixture checks and run the complete scenario/UI mapping after relevant T0/T1 gates.
- At phase completion run required T2 gates sequentially for Rust; only then perform appropriate release/device T3 certification.
- Run artifact-refiner followed by isolated adversarial review, record warning disposition and evidence, then reflect and update only genuinely satisfied completion dimensions.

Keep the phase's G-PIN, G-REV, G-DATA, G-SYNC, G-NATIVE and G-MEASURE checkpoints. A missing decision blocks its dependent implementation; it does not authorize a default or silent pin override. All new modules and operation contracts described here are proposed until implemented.

## Risks / Trade-offs

The first row is necessary and insufficient. Unsatisfied native/policy/pin gates remain visible rather than being removed from the matrix.

Use synthetic data only. Preserve three evidence states, independently enforced clinical authority, generated tokens and no query cache. Reopen cited source before writing; no file-presence or helper-only test can prove an assembled runtime.

## Validation and rollback

Run per-stack T0 after edits and targeted T1 behavior checks when the unit is complete. Test each scenario in spec.md at the actual boundary, including named denial/race/failure cases. Demonstrate sensitive guards fail under controlled sabotage and restore the code. Run artifact-refiner then isolated adversarial review before completion/archive.

Phase T2 includes Rust workspace test/build, web build, Flutter analyze/test and architecture audit; Rust builds are sequential. Broader T3 is restricted to a reached milestone. Never claim a silently skipped prerequisite passed.

Keep additive schema and compatibility steps reversible where possible; preserve current authorized generation until coherent handover. A failed prerequisite or conformance check leaves this change Blocked and dependent work unstarted.
