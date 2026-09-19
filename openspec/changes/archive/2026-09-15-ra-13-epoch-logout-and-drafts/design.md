## Context

This change implements runtime order 4 / lifecycle 6 from the reviewed [phase plan](../../../.kbd-orchestrator/phases/runtime-architecture/plan.md). Source inspection found reusable primitives but no proof that the composed target path works. Read the assessment and its review supplement before editing.

## Goals / Non-Goals

**Goals:** Invalidate the session epoch synchronously, lock protected rendering, drain old resources, and create a fresh graph on identity/practice/revision changes. Own foreground/resume revalidation and persist a noncredential `logoutPending` marker before requesting server logout. Consume the coordinator's confirmed or incomplete result without duplicating its durable ASO retry state. Separate recoverable draft entities from disposable replica generations; clinical commands are never queued for replay.

**Non-Goals:** No unrelated placeholder views, general dependency refresh, clinical automatic replay or additional graph/query-cache owner. Do not claim native or release evidence from a fixture.

## Decisions

Ownership: ASO client: runtime/session coordinator, per-view store factories, foreground/resume checks, logout control storage and draft repository; ASO server: the RA06 repair owns durable session denial, bounded recovery leases and Kratos confirmation; PEM: adopted lifecycle APIs. RA11c owns the real materializer caller that publishes replica authority failure into the RA06 session event seam.

Dependencies: ra-12-public-auth-startup. Confirm their implementation evidence before applying this change. This root OpenSpec artifact coordinates the user-named five-repository workspace; companion implementation must run under its own repository rules and only within the explicitly assigned modules.

- Implement epoch invalidation, coordinated cross-tab hints and authoritative revalidation before foreground/resume can expose protected content; scope view state by identity/practice/epoch/case/view instance.
- Implement `logoutPending` durability around the shell-neutral server logout operation. Keep credentials in their protected facility, retain the marker while the server reports incomplete confirmation, and let the ASO recovery runner own retry leases and journal transitions.
- Implement separately scoped draft persistence/recovery and test delayed old work, reload/new-tab logout, unavailable storage and migration/rebuild behavior.

Keep the phase's G-PIN, G-REV, G-DATA, G-SYNC, G-NATIVE and G-MEASURE checkpoints. A missing decision blocks its dependent implementation; it does not authorize a default or silent pin override. All new modules and operation contracts described here are proposed until implemented.

## Risks / Trade-offs

Memory-only draft loss on emergency logout is preferable to leaking data; do not claim durable recovery without an approved persistence policy.

Use synthetic data only. Preserve three evidence states, independently enforced clinical authority, generated tokens and no query cache. Reopen cited source before writing; no file-presence or helper-only test can prove an assembled runtime.

## Validation and rollback

Run per-stack T0 after edits and targeted T1 behavior checks when the unit is complete. Test each scenario in spec.md at the actual boundary, including named denial/race/failure cases. Demonstrate sensitive guards fail under controlled sabotage and restore the code. Run artifact-refiner then isolated adversarial review before completion/archive.

Phase T2 includes Rust workspace test/build, web build, Flutter analyze/test and architecture audit; Rust builds are sequential. Broader T3 is restricted to a reached milestone. Never claim a silently skipped prerequisite passed.

Keep additive schema and compatibility steps reversible where possible; preserve current authorized generation until coherent handover. A failed prerequisite or conformance check leaves this change Blocked and dependent work unstarted.
