## 1. Eligibility and bounded implementation

- [x] 1.1 Confirm dependency completion (ra-16-authorized-source-preview), the assigned file ownership and applicable phase decision gates before code changes; verify canonical dependency status and retain the gate decision/evidence artifact.
- [x] 1.2 Resolve and document the native credential/encryption/SSO facility before storing real credentials; test pinned native Kratos transport end-to-end. Verification: A native login/session is created and a protected command is invoked must produce this observed outcome: Opaque credentials stay in the approved host facility, the renderer receives sanitized state, and Gate/service/database checks remain independent.
- [x] 1.3 Implement the host session owner, constrained IPC and composition-root environment transport with full operation parity for `gate_state`, `affirm_gate`, `remove_gate`, `lookup_gate_command`, `signing_target`, `sign_letter`, `lookup_sign_letter_command`, `reassess_evidence`, `lookup_reassessment_command`, `save_annotation` and `lookup_annotation_command`. Verification: Invoke every command through local Tauri IPC with a host-owned credential; when a renderer supplies an actor, foreign-practice authority, stale epoch or unauthorized window request, the host rejects it and the same Gate/AppServices/Postgres authority checks used by HTTP remain independently enforceable.
- [x] 1.4 Run per-command host-boundary refusal and two-window invalidation checks using synthetic identities. Verification: Every inventory command distinguishes policy refusal, native-authentication/provider unavailability and uncertain command reconciliation; when two windows observe logout/account change or native SSO completion fails, both lock consistently and no token appears in URLs, Zustand, graph snapshots or logs.

## 2. Behavioral acceptance

- [x] 2.1 Prove: when A native login/session is created and a protected command is invoked, then Opaque credentials stay in the approved host facility, the renderer receives sanitized state, and Gate/service/database checks remain independent. Record the actual command, prerequisite availability and observed result.
- [x] 2.2 Prove: when A renderer supplies an actor, stale epoch or unauthorized window request, then The host rejects it; renderer hints cannot confer signing or practice authority. Record the actual command, prerequisite availability and observed result.
- [x] 2.3 Prove: when Two windows observe logout/account change or native SSO completion fails, then Both lock consistently; incomplete authentication is explicit and no token appears in URLs, Zustand, graph snapshots or logs. Record the actual command, prerequisite availability and observed result.

## 3. Completion evidence

- [x] 3.1 Complete applicable T0/T1 and the phase-prescribed artifact-refiner then adversarial review; preserve synthetic evidence, confirm real callers and mark only actually satisfied work complete. Do not run broad phase/release tiers early.
