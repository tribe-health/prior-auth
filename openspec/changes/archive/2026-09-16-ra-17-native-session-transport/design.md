## Context

This change implements runtime order 5 from the reviewed [phase plan](../../../.kbd-orchestrator/phases/runtime-architecture/plan.md). Source inspection found reusable primitives but no proof that the composed target path works. Read the assessment and its review supplement before editing.

## Goals / Non-Goals

**Goals:** Implement one native session owner and protected credential facility, sanitized renderer projection and per-invocation session-generation/scope checks. Bind all existing HTTP operations to matching host commands; keep the same React feature hooks and model.

**Non-Goals:** No unrelated placeholder views, general dependency refresh, clinical automatic replay or additional graph/query-cache owner. Do not claim native or release evidence from a fixture.

## Decisions

Ownership: ASO: desktop Tauri host/session/IPC and web composition-root transport adapter; shared AppServices contracts; Gate native credential path.

Native operation parity inventory: `gate_state`, `affirm_gate`, `remove_gate`, `lookup_gate_command`, `signing_target`, `sign_letter`, `lookup_sign_letter_command`, `reassess_evidence`, `lookup_reassessment_command`, `save_annotation` and `lookup_annotation_command`. Every command obtains the credential from the host-owned native session, resolves fresh verified scope and calls the same shell-neutral `AppServices` operation used by HTTP. Renderer actor, identity, session, credential, practice-authority, epoch and window claims are untrusted inputs and cannot confer authority. Local Tauri IPC evidence invokes every command with an authorized synthetic identity and with rejected actor, foreign-practice, stale-epoch and unauthorized-window attempts; it preserves distinct policy-denial, provider-unavailable and uncertain-command outcomes. Mutation lookups reconcile the authoritative command ledger. Two-window tests prove logout, account change and native SSO failure synchronously invalidate both renderers without placing a credential in renderer state, URLs, graph snapshots or logs.

Dependencies: ra-16-authorized-source-preview. Confirm their implementation evidence before applying this change. This root OpenSpec artifact coordinates the user-named five-repository workspace; companion implementation must run under its own repository rules and only within the explicitly assigned modules.

- Resolve and document the native credential/encryption/SSO facility before storing real credentials; test pinned native Kratos transport end-to-end.
- Implement the host session owner, constrained IPC and composition-root environment transport with full operation parity for the named native operation inventory.
- Run per-command host-credential/refusal checks and multi-window invalidation checks using synthetic identities.

Keep the phase's G-PIN, G-REV, G-DATA, G-SYNC, G-NATIVE and G-MEASURE checkpoints. A missing decision blocks its dependent implementation; it does not authorize a default or silent pin override. All new modules and operation contracts described here are proposed until implemented.

## Risks / Trade-offs

Credential/encryption and native SSO policy are decision gates; lack of approval leaves native adoption blocked, not silently downgraded to browser storage.

Use synthetic data only. Preserve three evidence states, independently enforced clinical authority, generated tokens and no query cache. Reopen cited source before writing; no file-presence or helper-only test can prove an assembled runtime.

## Validation and rollback

Run per-stack T0 after edits and targeted T1 behavior checks when the unit is complete. Test each scenario in spec.md at the actual boundary, including named denial/race/failure cases. Demonstrate sensitive guards fail under controlled sabotage and restore the code. Run artifact-refiner then isolated adversarial review before completion/archive.

Phase T2 includes Rust workspace test/build, web build, Flutter analyze/test and architecture audit; Rust builds are sequential. Broader T3 is restricted to a reached milestone. Never claim a silently skipped prerequisite passed.

Keep additive schema and compatibility steps reversible where possible; preserve current authorized generation until coherent handover. A failed prerequisite or conformance check leaves this change Blocked and dependent work unstarted.
