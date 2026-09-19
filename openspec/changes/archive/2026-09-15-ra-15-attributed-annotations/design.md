## Context

This change implements runtime order UI 3 from the reviewed [phase plan](../../../.kbd-orchestrator/phases/runtime-architecture/plan.md). Source inspection found reusable primitives but no proof that the composed target path works. Read the assessment and its review supplement before editing.

## Goals / Non-Goals

**Goals:** Implement the prototype's annotation intent as an authoritative audited opinion record, separate from chart facts, with author/time/source and include/hold state. Drafts use the scoped draft repository and a stable editor instance across responsive layout changes.

**Non-Goals:** No unrelated placeholder views, general dependency refresh, clinical automatic replay or additional graph/query-cache owner. Do not claim native or release evidence from a fixture.

## Decisions

Ownership: ASO: proposed annotation feature/command/repository and desktop wrapper, PEM entity registration/projection configuration through approved APIs, Gate projection/command policy.

Dependencies: ra-14-live-evidence-timeline. Confirm their implementation evidence before applying this change. This root OpenSpec artifact coordinates the user-named five-repository workspace; companion implementation must run under its own repository rules and only within the explicitly assigned modules.

- Add the annotation domain/revision/audit and projection contract, authenticated HTTP routes and fail-closed desktop wrappers. Executable desktop parity requires the host-owned credential and is delivered by ra-17-native-session-transport.
- Advance the replica contract to revision 3 with the exact approved `annotation_types` reference projection (`id`, `key`, `name`, `description`). The first-annotation UI selects that server-owned identity; JSON Schema remains server-side and the client cannot invent or widen a type.
- Apply annotation command authorization independently at Gate, `AppServices`, and the PostgreSQL command function. The mounted browser campaign creates the first annotation through the UI and proves administrator refusal commits no annotation command.
- Implement scoped draft/command hooks and shadcn annotation parts/cards within the evidence feature.
- Verify live save/refusal/projection, include/hold semantics, resize editor continuity and recovery isolation.

Keep the phase's G-PIN, G-REV, G-DATA, G-SYNC, G-NATIVE and G-MEASURE checkpoints. A missing decision blocks its dependent implementation; it does not authorize a default or silent pin override. All new modules and operation contracts described here are proposed until implemented.

## Risks / Trade-offs

No annotation becomes a generated clinical assertion without document/page/date provenance and the separate generation/QA contract.

The uncomfortable trade-off is that the approved annotation-type catalog is shared across practice scopes. Its compiled relation and four-column allowlist therefore form a privacy boundary in both FRF and the client schema; adding tenant-specific configuration or JSON Schema to that projection would invalidate this decision.

Use synthetic data only. Preserve three evidence states, independently enforced clinical authority, generated tokens and no query cache. Reopen cited source before writing; no file-presence or helper-only test can prove an assembled runtime.

## Validation and rollback

Run per-stack T0 after edits and targeted T1 behavior checks when the unit is complete. Test each scenario in spec.md at the actual boundary, including named denial/race/failure cases. Demonstrate sensitive guards fail under controlled sabotage and restore the code. Run artifact-refiner then isolated adversarial review before completion/archive.

Phase T2 includes Rust workspace test/build, web build, Flutter analyze/test and architecture audit; Rust builds are sequential. Broader T3 is restricted to a reached milestone. Never claim a silently skipped prerequisite passed.

Keep additive schema and compatibility steps reversible where possible; preserve current authorized generation until coherent handover. A failed prerequisite or conformance check leaves this change Blocked and dependent work unstarted.
