# Verification

Acceptance for `ios-local-chat` is defined in the phase contract
`openspec/changes/phase-integration-evidence/verification.md` (all acceptance
fields: production entry, real collaborators, oracle, negative control, boundary,
isolation, final local gate, evidence, invalidation keys). Nothing below has run;
every verdict is pending until the final local gate after all phase changes are
implemented.

| Scenario | Behaviour | Owner task | Boundary |
|---|---|---|---|
| CHAT-2 | iOS reply on Mac (Designed for iPad) | `ios-local-chat:2.2` | engine and shell IPC |
| CHAT-3 | iOS reply on a physical iPhone | `ios-local-chat:2.2` | engine and shell IPC |
| CHAT-4 | iOS simulator states no engine | `ios-local-chat:1.2` | engine and shell IPC |
