# Verification

Acceptance for `desktop-local-chat` is defined in the phase contract
`openspec/changes/phase-integration-evidence/verification.md` (all acceptance
fields: production entry, real collaborators, oracle, negative control, boundary,
isolation, final local gate, evidence, invalidation keys). Nothing below has run;
every verdict is pending until the final local gate after all phase changes are
implemented.

| Scenario | Behaviour | Owner task | Boundary |
|---|---|---|---|
| CHAT-1 | Desktop streamed reply, UAR absent | `desktop-local-chat:1.2` | engine and shell IPC |
| CHAT-7 | Cancel frees the engine | `desktop-local-chat:1.2` | engine and shell IPC |
| CHAT-8 | Intel desktop has no engine or embedder | `desktop-local-chat:2.1` | engine and shell IPC |
| PRIV-1 | No egress during local run or embed | `desktop-local-chat:1.2` | network |
