## 1. Eligibility and bounded implementation

- [ ] 1.1 Confirm dependency completion (ra-11a-sync-conformance), the assigned file ownership and applicable phase decision gates before code changes; verify canonical dependency status and retain the gate decision/evidence artifact.
- [ ] 1.2 Implement worker lifetime and owner/follower coordination with explicit close/drain boundaries. Verification: Two tabs open the same approved replica and one owner closes must produce this observed outcome: Exactly one replacement owner opens/writes the database, with no stale owner resuming after handover.
- [ ] 1.3 Implement migration ledger/checksums, logical version validation and generation handover under exclusive ownership. Verification: A new generation, checksum drift or unsupported newer schema is encountered must produce this observed outcome: Migration occurs under exclusive ownership or returns RecoveryRequired; incompatible old writers are fenced and the current generation is not partially mutated.
- [ ] 1.4 Test leader death, old-tab conflict, migration failure and scope invalidation using isolated durable synthetic replicas. Verification: Identity changes during opening or migration must produce this observed outcome: The old namespace closes or remains quarantined; the new identity never receives its handle/data.

## 2. Behavioral acceptance

- [ ] 2.1 Prove: when Two tabs open the same approved replica and one owner closes, then Exactly one replacement owner opens/writes the database, with no stale owner resuming after handover. Record the actual command, prerequisite availability and observed result.
- [ ] 2.2 Prove: when A new generation, checksum drift or unsupported newer schema is encountered, then Migration occurs under exclusive ownership or returns RecoveryRequired; incompatible old writers are fenced and the current generation is not partially mutated. Record the actual command, prerequisite availability and observed result.
- [ ] 2.3 Prove: when Identity changes during opening or migration, then The old namespace closes or remains quarantined; the new identity never receives its handle/data. Record the actual command, prerequisite availability and observed result.

## 3. Completion evidence

- [ ] 3.1 Complete applicable T0/T1 and the phase-prescribed artifact-refiner then adversarial review; preserve synthetic evidence, confirm real callers and mark only actually satisfied work complete. Do not run broad phase/release tiers early.
