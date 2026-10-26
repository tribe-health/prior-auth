# Verification

Acceptance for `local-embedder-and-mobile-store` is defined in the phase contract
`openspec/changes/phase-integration-evidence/verification.md` (all acceptance
fields: production entry, real collaborators, oracle, negative control, boundary,
isolation, final local gate, evidence, invalidation keys). Nothing below has run;
every verdict is pending until the final local gate after all phase changes are
implemented.

| Scenario | Behaviour | Owner task | Boundary |
|---|---|---|---|
| EMB-1 | Desktop embedding | `local-embedder-and-mobile-store:1.2` | engine and shell IPC |
| EMB-5 | Embedder loads only verified files | `local-embedder-and-mobile-store:1.2` | engine and shell IPC |
| EMB-2 | iOS simulator embedding | `local-embedder-and-mobile-store:1.4` | engine and shell IPC |
| EMB-3 | Android emulator embedding | `local-embedder-and-mobile-store:1.4` | engine and shell IPC |
| STORE-1 | Mobile conversations and settings survive restart | `local-embedder-and-mobile-store:2.2` | database (SurrealDB RocksDB) and filesystem |
| STORE-2 | Store open failure is loud | `local-embedder-and-mobile-store:2.2` | database (SurrealDB RocksDB) and filesystem |
