# Verification

Acceptance for `uar-embedded-runtime` is defined in the phase contract
`openspec/changes/phase-integration-evidence/verification.md` (all acceptance
fields: production entry, real collaborators, oracle, negative control, boundary,
isolation, final local gate, evidence, invalidation keys). Nothing below has run;
every verdict is pending until the final local gate after all phase changes are
implemented.

| Scenario | Behaviour | Owner task | Boundary |
|---|---|---|---|
| UAR-4 | iOS embedded onboarding on local driver | `uar-embedded-runtime:1.2` | process, network and AG-UI protocol |
| UAR-5 | Local driver refuses other agents (classification: boundary guard; the shipped app routes only the onboarding agent, so this runs through the production `UarMode::Embedded` builder in a `scripts/evidence/` harness built on macOS with feature `embedded`, whatever decision 3 chooses) | `uar-embedded-runtime:2.1` | process, network and AG-UI protocol |
| UAR-6 | Tool admission denies (classification: boundary guard, same harness as UAR-5) | `uar-embedded-runtime:2.2` | process, network and AG-UI protocol |
| UAR-7 | iOS UAR linked, not configured | `uar-embedded-runtime:3.1` | process, network and AG-UI protocol |
| UAR-11 | Android links no UAR (classification: structural, supplemental) | `uar-embedded-runtime:3.1` | process, network and AG-UI protocol |
