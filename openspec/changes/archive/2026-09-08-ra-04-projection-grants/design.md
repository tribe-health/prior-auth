## Context

This change implements runtime order 1→2 from the reviewed [phase plan](../../../.kbd-orchestrator/phases/runtime-architecture/plan.md). Source inspection found reusable primitives but no proof that the composed target path works. Read the assessment and its review supplement before editing.

## Goals / Non-Goals

**Goals:** Define approved shape identifiers for the five current base tables, exact primary keys and approved columns, then bind them to verified scope and projection revision. Mint an allowlisted FRF token through verified identity enhancement, not Kratos OAuth exchange; carry originating session and bounded expiry. Explicitly add cases.gate_affirmed_at to the versioned approved projection for reactive navigation, keeping gate_affirmed_by excluded unless separately justified.

**Non-Goals:** No unrelated placeholder views, general dependency refresh, clinical automatic replay or additional graph/query-cache owner. Do not claim native or release evidence from a fixture.

## Decisions

Ownership: ASO: session/membership service and proposed projection registry; Gate: jwt_mint, claims-enhancement pipeline and ASO routes; FRF: identity claims/port/verifier.

Dependencies: ra-03-clinical-command-parity. Confirm their implementation evidence before applying this change. This root OpenSpec artifact coordinates the user-named five-repository workspace; companion implementation must run under its own repository rules and only within the explicitly assigned modules.

- Record the privacy/projection contract and negative request fixtures in the mounted grant boundary; keep existing exclusions and defer criterion-label expansion.
- Implement strict claim allowlisting, originating-session linkage, expiry and issuer/audience validation across Gate and FRF.
- Prove modified clients cannot broaden grant scope and required mint failure refuses access. Re-run the seven established practice-derivation cases against fresh and upgraded schema, including direct practice_id writes and parent changes.

Keep the phase's G-PIN, G-REV, G-DATA, G-SYNC, G-NATIVE and G-MEASURE checkpoints. A missing decision blocks its dependent implementation; it does not authorize a default or silent pin override. All new modules and operation contracts described here are proposed until implemented.

## Risks / Trade-offs

Privacy approval for real clinical persistence remains a decision gate; synthetic data permits contract testing only.

Use synthetic data only. Preserve three evidence states, independently enforced clinical authority, generated tokens and no query cache. Reopen cited source before writing; no file-presence or helper-only test can prove an assembled runtime.

## Validation and rollback

Run per-stack T0 after edits and targeted T1 behavior checks when the unit is complete. Test each scenario in spec.md at the actual boundary, including named denial/race/failure cases. Demonstrate sensitive guards fail under controlled sabotage and restore the code. Run artifact-refiner then isolated adversarial review before completion/archive.

Phase T2 includes Rust workspace test/build, web build, Flutter analyze/test and architecture audit; Rust builds are sequential. Broader T3 is restricted to a reached milestone. Never claim a silently skipped prerequisite passed.

Keep additive schema and compatibility steps reversible where possible; preserve current authorized generation until coherent handover. A failed prerequisite or conformance check leaves this change Blocked and dependent work unstarted.
