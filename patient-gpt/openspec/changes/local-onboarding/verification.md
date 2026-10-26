# Verification

Acceptance for `local-onboarding` is defined in the phase contract
`openspec/changes/phase-integration-evidence/verification.md` (all acceptance
fields: production entry, real collaborators, oracle, negative control, boundary,
isolation, final local gate, evidence, invalidation keys). Nothing below has run;
every verdict is pending until the final local gate after all phase changes are
implemented.

| Scenario | Behaviour | Owner task | Boundary |
|---|---|---|---|
| ONB-1 | First-run onboarding | `local-onboarding:4.1` | UI, shell IPC and local store |
| ONB-2 | Confirmed proposal executes once | `local-onboarding:2.2` | UI, shell IPC and local store |
| ONB-3 | Declined proposal changes nothing | `local-onboarding:2.2` | UI, shell IPC and local store |
| ONB-4 | Invalid proposal has no control | `local-onboarding:2.2` | UI, shell IPC and local store |
| ONB-5 | UAR endpoint recorded, not connected | `local-onboarding:2.2` | UI, shell IPC and local store |
| ONB-6 | Mobile onboarding parity | `local-onboarding:5.1` | UI, shell IPC and local store |
| ONB-7 | Cloud host refuses setup | `local-onboarding:3.1` | UI, shell IPC and local store |
| ONB-8 | Onboarding has no clinical input (classification: structural, supplemental) | `local-onboarding:2.2` | UI, shell IPC and local store |
| ONB-9 | Raw setup block never displayed | `local-onboarding:2.2` | UI, shell IPC and local store |
