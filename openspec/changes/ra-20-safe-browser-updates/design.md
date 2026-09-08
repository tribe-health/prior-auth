## Context

This change implements runtime order 6 from the reviewed [phase plan](../../../.kbd-orchestrator/phases/runtime-architecture/plan.md). Source inspection found reusable primitives but no proof that the composed target path works. Read the assessment and its review supplement before editing.

## Goals / Non-Goals

**Goals:** Version API, shape, logical schema, engine format, graph snapshot and app contracts independently. Stage immutable assets and activate only at a safe user-work boundary; coordinate old tabs/schema leases and use expand/migrate/contract on the server.

**Non-Goals:** No unrelated placeholder views, general dependency refresh, clinical automatic replay or additional graph/query-cache owner. Do not claim native or release evidence from a fixture.

## Decisions

Ownership: ASO: runtime update coordinator, compatibility service/manifest and browser deployment assets; server migration deployment job; scoped draft and replica services.

Dependencies: ra-16-authorized-source-preview. Confirm their implementation evidence before applying this change. This root OpenSpec artifact coordinates the user-named five-repository workspace; companion implementation must run under its own repository rules and only within the explicitly assigned modules.

- Implement compatibility metadata and additive server deployment migration flow for existing installations.
- Add safe activation across tabs with retained chunks, draft resolution and clinical idempotency reconciliation; add a service worker only if required, static-only by default.
- Exercise dirty-work updates, old-tab schema conflicts, migration failure, quota/rebuild and post-activation revalidation.

Keep the phase's G-PIN, G-REV, G-DATA, G-SYNC, G-NATIVE and G-MEASURE checkpoints. A missing decision blocks its dependent implementation; it does not authorize a default or silent pin override. All new modules and operation contracts described here are proposed until implemented.

## Risks / Trade-offs

No unconditional skipWaiting, private API/shape/attachment cache or automatic clinical command replay is permitted.

Use synthetic data only. Preserve three evidence states, independently enforced clinical authority, generated tokens and no query cache. Reopen cited source before writing; no file-presence or helper-only test can prove an assembled runtime.

## Validation and rollback

Run per-stack T0 after edits and targeted T1 behavior checks when the unit is complete. Test each scenario in spec.md at the actual boundary, including named denial/race/failure cases. Demonstrate sensitive guards fail under controlled sabotage and restore the code. Run artifact-refiner then isolated adversarial review before completion/archive.

Phase T2 includes Rust workspace test/build, web build, Flutter analyze/test and architecture audit; Rust builds are sequential. Broader T3 is restricted to a reached milestone. Never claim a silently skipped prerequisite passed.

Keep additive schema and compatibility steps reversible where possible; preserve current authorized generation until coherent handover. A failed prerequisite or conformance check leaves this change Blocked and dependent work unstarted.
