## Context

This change implements runtime order UI 3 from the reviewed [phase plan](../../../.kbd-orchestrator/phases/runtime-architecture/plan.md). Source inspection found reusable primitives but no proof that the composed target path works. Read the assessment and its review supplement before editing.

## Goals / Non-Goals

**Goals:** Fetch bounded document bytes through an audited subject/practice/document access service; never expose storage_uri as ambient authority. Integrate an accessible adaptive preview and source-location actions into the timeline, with epoch cancellation and object-URL cleanup.

**Non-Goals:** No unrelated placeholder views, general dependency refresh, clinical automatic replay or additional graph/query-cache owner. Do not claim native or release evidence from a fixture.

## Decisions

Ownership: ASO: attachment authorization/byte service and desktop wrapper, evidence source-preview hooks/parts, shared adaptive dialog/sheet and token source if needed.

Dependencies: ra-15-attributed-annotations. Confirm their implementation evidence before applying this change. This root OpenSpec artifact coordinates the user-named five-repository workspace; companion implementation must run under its own repository rules and only within the explicitly assigned modules.

- Implement document-level authorization and bounded source delivery with HTTP/native parity and no private service-worker cache.
- Add source-preview model/actions and accessible adaptive composition using current shadcn primitives and generated layout tokens.
- Verify forbidden source access, logout during fetch, URL cleanup, 320/600/1200/1440px resize, focus and reduced-motion interruption.

Keep the phase's G-PIN, G-REV, G-DATA, G-SYNC, G-NATIVE and G-MEASURE checkpoints. A missing decision blocks its dependent implementation; it does not authorize a default or silent pin override. All new modules and operation contracts described here are proposed until implemented.

## Risks / Trade-offs

A download URL is not authorization. Preserve medical source content boundaries and use synthetic fixtures only.

Use synthetic data only. Preserve three evidence states, independently enforced clinical authority, generated tokens and no query cache. Reopen cited source before writing; no file-presence or helper-only test can prove an assembled runtime.

## Validation and rollback

Run per-stack T0 after edits and targeted T1 behavior checks when the unit is complete. Test each scenario in spec.md at the actual boundary, including named denial/race/failure cases. Demonstrate sensitive guards fail under controlled sabotage and restore the code. Run artifact-refiner then isolated adversarial review before completion/archive.

Phase T2 includes Rust workspace test/build, web build, Flutter analyze/test and architecture audit; Rust builds are sequential. Broader T3 is restricted to a reached milestone. Never claim a silently skipped prerequisite passed.

Keep additive schema and compatibility steps reversible where possible; preserve current authorized generation until coherent handover. A failed prerequisite or conformance check leaves this change Blocked and dependent work unstarted.
