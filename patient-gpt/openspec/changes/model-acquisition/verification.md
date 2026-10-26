# Verification

Acceptance for `model-acquisition` is defined in the phase contract
`openspec/changes/phase-integration-evidence/verification.md` (all acceptance
fields: production entry, real collaborators, oracle, negative control, boundary,
isolation, final local gate, evidence, invalidation keys). Nothing below has run;
every verdict is pending until the final local gate after all phase changes are
implemented.

| Scenario | Behaviour | Owner task | Boundary |
|---|---|---|---|
| ACQ-1 | Fresh acquisition with progress | `model-acquisition:2.3` | network (HTTPS) and filesystem |
| ACQ-2 | Corrupted file rejected | `model-acquisition:2.1` | network (HTTPS) and filesystem |
| ACQ-3 | Resume after interruption | `model-acquisition:2.1` | network (HTTPS) and filesystem |
| ACQ-4 | Memory picks the model | `model-acquisition:2.2` | network (HTTPS) and filesystem |
| ACQ-5 | Models out of backups | `model-acquisition:4.1` | network (HTTPS) and filesystem |
