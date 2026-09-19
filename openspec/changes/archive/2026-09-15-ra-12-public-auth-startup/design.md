## Context

This change implements runtime order 4 / UI 2 from the reviewed [phase plan](../../../.kbd-orchestrator/phases/runtime-architecture/plan.md). Source inspection found reusable primitives but no proof that the composed target path works. Read the assessment and its review supplement before editing.

## Goals / Non-Goals

**Goals:** Implement real Kratos browser login/recovery flows with typed nodes and CSRF handling, and separate Anonymous from SessionUnavailable. Route public pages outside private providers; drive startup through environment/session/open/migrate/hydrate/catch-up states with scoped hooks.

**Non-Goals:** No unrelated placeholder views, general dependency refresh, clinical automatic replay or additional graph/query-cache owner. Do not claim native or release evidence from a fixture.

## Decisions

Ownership: ASO: main composition, session/graph providers, public authentication feature and routing, proposed runtime status store/hooks; existing shadcn field/message parts.

Dependencies: ra-11c-sql-materialization. Confirm their implementation evidence before applying this change. This root OpenSpec artifact coordinates the user-named five-repository workspace; companion implementation must run under its own repository rules and only within the explicitly assigned modules.

- Separate public/authenticated route composition and add a sanitized session/runtime store with explicit state transitions.
- Implement the typed Kratos flow hook and shadcn AuthFlowForm against real browser-flow endpoints.
- Test public cold start, upstream failure, expired/invalid form flow and authenticated state ordering with an instrumented DB owner.

Keep the phase's G-PIN, G-REV, G-DATA, G-SYNC, G-NATIVE and G-MEASURE checkpoints. A missing decision blocks its dependent implementation; it does not authorize a default or silent pin override. All new modules and operation contracts described here are proposed until implemented.

## Risks / Trade-offs

The native credential facility is separate. A prototype persona selector cannot count as authentication.

Use synthetic data only. Preserve three evidence states, independently enforced clinical authority, generated tokens and no query cache. Reopen cited source before writing; no file-presence or helper-only test can prove an assembled runtime.

## Validation and rollback

Run per-stack T0 after edits and targeted T1 behavior checks when the unit is complete. Test each scenario in spec.md at the actual boundary, including named denial/race/failure cases. Demonstrate sensitive guards fail under controlled sabotage and restore the code. Run artifact-refiner then isolated adversarial review before completion/archive.

Phase T2 includes Rust workspace test/build, web build, Flutter analyze/test and architecture audit; Rust builds are sequential. Broader T3 is restricted to a reached milestone. Never claim a silently skipped prerequisite passed.

Keep additive schema and compatibility steps reversible where possible; preserve current authorized generation until coherent handover. A failed prerequisite or conformance check leaves this change Blocked and dependent work unstarted.
