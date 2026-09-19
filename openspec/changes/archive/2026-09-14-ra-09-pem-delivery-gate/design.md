## Context

This change implements runtime order 3 from the reviewed [phase plan](../../../.kbd-orchestrator/phases/runtime-architecture/plan.md). Source inspection found reusable primitives but no proof that the composed target path works. Read the assessment and its review supplement before editing.

## Goals / Non-Goals

**Goals:** Build a uniquely identified candidate package closure and test its exported dist entrypoints in an isolated ASO acceptance checkout. Record source revision, artifact hash and actual resolved packages. Retain the project's exact 4.0.0 installation until an explicit release/pin decision authorizes a real produced version.

**Non-Goals:** No unrelated placeholder views, general dependency refresh, clinical automatic replay or additional graph/query-cache owner. Do not claim native or release evidence from a fixture.

## Decisions

Ownership: PEM: package exports/build/release metadata and consumer contract harness; ASO: package/lock adoption only after pin authority is resolved. Operator owns versions.toml.

Dependencies: ra-08-committed-graph-projection. Confirm their implementation evidence before applying this change. This root OpenSpec artifact coordinates the user-named five-repository workspace; companion implementation must run under its own repository rules and only within the explicitly assigned modules.

- Produce and verify the candidate package closure without republishing or relabeling 4.0.0.
- Attach a concrete package-diff/provenance and consumer-test receipt for the operator-controlled pin decision.
- After that decision, adopt the actual artifact and rerun resolved-entrypoint/pin/singleton checks; otherwise record the downstream block.

Keep the phase's G-PIN, G-REV, G-DATA, G-SYNC, G-NATIVE and G-MEASURE checkpoints. A missing decision blocks its dependent implementation; it does not authorize a default or silent pin override. All new modules and operation contracts described here are proposed until implemented.

## Risks / Trade-offs

This is a real prerequisite to first-row delivery in the main application. Unchanged 4.0.0 pins and new companion behavior cannot both be assumed.

Use synthetic data only. Preserve three evidence states, independently enforced clinical authority, generated tokens and no query cache. Reopen cited source before writing; no file-presence or helper-only test can prove an assembled runtime.

## Validation and rollback

Run per-stack T0 after edits and targeted T1 behavior checks when the unit is complete. Test each scenario in spec.md at the actual boundary, including named denial/race/failure cases. Demonstrate sensitive guards fail under controlled sabotage and restore the code. Run artifact-refiner then isolated adversarial review before completion/archive.

Phase T2 includes Rust workspace test/build, web build, Flutter analyze/test and architecture audit; Rust builds are sequential. Broader T3 is restricted to a reached milestone. Never claim a silently skipped prerequisite passed.

Keep additive schema and compatibility steps reversible where possible; preserve current authorized generation until coherent handover. A failed prerequisite or conformance check leaves this change Blocked and dependent work unstarted.
