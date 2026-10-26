# Verification

Acceptance for `inference-contract` is defined in the phase contract
`openspec/changes/phase-integration-evidence/verification.md` (all acceptance
fields: production entry, real collaborators, oracle, negative control, boundary,
isolation, final local gate, evidence, invalidation keys). Nothing below has run;
every verdict is pending until the final local gate after all phase changes are
implemented.

| Scenario | Behaviour | Owner task | Boundary |
|---|---|---|---|
| LANE-1 | Missing lane rejected | `inference-contract:2.3` | transport (HTTP, Tauri IPC, FFI) |
| LANE-2 | Unknown lane rejected | `inference-contract:2.3` | transport (HTTP, Tauri IPC, FFI) |
| LANE-3 | Local lane refused in clinical scope | `inference-contract:2.3` | transport (HTTP, Tauri IPC, FFI) |
| LANE-4 | Cloud host has no local inference | `inference-contract:3.1` | transport (HTTP, Tauri IPC, FFI) |
| LANE-5 | Desktop "UAR absent" mode | `inference-contract:2.2` | transport (HTTP, Tauri IPC, FFI) |
| LANE-6 | Onboarding scope round-trips | `inference-contract:1.2` | transport (HTTP, Tauri IPC, FFI) |
| ACQ-6 | Unknown catalog id refused | `inference-contract:2.3` | network (HTTPS) and filesystem |
| CHAT-6 | Chat before model installed | `inference-contract:2.3` | engine and shell IPC |
| EMB-4 | Embed limits | `inference-contract:2.3` | engine and shell IPC |
| PAR-1 | Transport parity (classification: structural, supplemental) | `inference-contract:5.1` | source |
