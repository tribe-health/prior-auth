# Verification

Acceptance for `agui-bridge-and-uar-service` is defined in the phase contract
`openspec/changes/phase-integration-evidence/verification.md` (all acceptance
fields: production entry, real collaborators, oracle, negative control, boundary,
isolation, final local gate, evidence, invalidation keys). Nothing below has run;
every verdict is pending until the final local gate after all phase changes are
implemented.

| Scenario | Behaviour | Owner task | Boundary |
|---|---|---|---|
| UAR-1 | Cloud host reaches UAR by URL | `agui-bridge-and-uar-service:2.1` | process, network and AG-UI protocol |
| UAR-2 | UAR failures visible | `agui-bridge-and-uar-service:2.1` | process, network and AG-UI protocol |
| UAR-3 | Unrouted scope refused | `agui-bridge-and-uar-service:2.2` | process, network and AG-UI protocol |
| UAR-10 | Service mode start-up checks | `agui-bridge-and-uar-service:2.1` | process, network and AG-UI protocol |
| BRIDGE-1 | Bridge surfaces unsupported events and version mismatch (classification: supplemental) | `agui-bridge-and-uar-service:1.1` | AG-UI protocol |
