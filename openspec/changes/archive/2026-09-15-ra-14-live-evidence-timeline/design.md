## Context

This change implements runtime order 4 / first delivery from the reviewed [phase plan](../../../.kbd-orchestrator/phases/runtime-architecture/plan.md). Source inspection found reusable primitives but no proof that the composed target path works. Read the assessment and its review supplement before editing.

## Goals / Non-Goals

**Goals:** Replace the copied one-shot SQL result with scoped PEM entity/list selectors. Preserve three-state counts and citation semantics, use committed gate/readiness/read permissions for navigation, and prove the complete persisted synthetic row path in a real browser. Leave twelve placeholder routes intact. Navigation reads the streamed cases.gate_affirmed_at entity field from ra-02/04; a remote revocation clears reachability without a route reload.

**Non-Goals:** No unrelated placeholder views, general dependency refresh, clinical automatic replay or additional graph/query-cache owner. Do not claim native or release evidence from a fixture.

## Decisions

Ownership: ASO: evidence-timeline hooks/model/components, scoped interaction provider, committed gate navigation hook, explicit browser acceptance runner; cross-repo services as configured.

Dependencies: ra-13-epoch-logout-and-drafts, ra-10-remove-transitive-query-cache. Confirm their implementation evidence before applying this change. This root OpenSpec artifact coordinates the user-named five-repository workspace; companion implementation must run under its own repository rules and only within the explicitly assigned modules.

- Wire scoped graph selectors and intent commands into the existing timeline; replace citation-absence-as-void and the false gate placeholder with explicit semantic/committed states.
- Recheck every newly exported runtime adapter's caller and use the actual installed package entrypoint.
- Capture the real synthetic Postgres→Gate→FRF→Electric→SQL→graph→browser path, denied payloads, update/delete and logout evidence; keep screenshots/logs synthetic.

Keep the phase's G-PIN, G-REV, G-DATA, G-SYNC, G-NATIVE and G-MEASURE checkpoints. A missing decision blocks its dependent implementation; it does not authorize a default or silent pin override. All new modules and operation contracts described here are proposed until implemented.

## Risks / Trade-offs

Only this evidence can close the specific old read-path blocker. It does not certify all UI stage 3, native support or publication.

Use synthetic data only. Preserve three evidence states, independently enforced clinical authority, generated tokens and no query cache. Reopen cited source before writing; no file-presence or helper-only test can prove an assembled runtime.

## Validation and rollback

Run per-stack T0 after edits and targeted T1 behavior checks when the unit is complete. Test each scenario in spec.md at the actual boundary, including named denial/race/failure cases. Demonstrate sensitive guards fail under controlled sabotage and restore the code. Run artifact-refiner then isolated adversarial review before completion/archive.

Phase T2 includes Rust workspace test/build, web build, Flutter analyze/test and architecture audit; Rust builds are sequential. Broader T3 is restricted to a reached milestone. Never claim a silently skipped prerequisite passed.

Keep additive schema and compatibility steps reversible where possible; preserve current authorized generation until coherent handover. A failed prerequisite or conformance check leaves this change Blocked and dependent work unstarted.
