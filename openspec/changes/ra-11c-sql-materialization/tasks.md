## 1. Eligibility and bounded implementation

- [ ] 1.1 Confirm dependency completion (ra-11b-worker-ownership), the assigned file ownership and applicable phase decision gates before code changes; verify canonical dependency status and retain the gate decision/evidence artifact.
- [ ] 1.2 Connect the ra-11a materializer within ra-11b ownership and remove the unused/synthetic-offset read-path seam from active use. Verification: The real authorized stream inserts, updates or deletes related records must produce this observed outcome: SQL rows/checkpoints and graph entities/lists agree before readiness, including gate-summary updates and met/gap/void reference identities.
- [ ] 1.3 Implement committed SQL-to-graph publication with explicit primary keys, replacement generations and catch-up status. Verification: A crash, refetch or authorization narrowing interrupts the assembled runtime must produce this observed outcome: Resume cannot skip data, replacement removes stale rows and no partial relationship batch is published.
- [ ] 1.4 Run real Postgres→Gate/FRF→SQL→graph acceptance with update/delete/crash/refetch; use isolated durable synthetic storage for restart cases and memory-only browser baseline until persistence policy is approved. Verification: The owner is revoked or disposed while materialization is in flight must produce this observed outcome: Old-scope work drains or is fenced and cannot publish/write through the next runtime.

## 2. Behavioral acceptance

- [ ] 2.1 Prove: when The real authorized stream inserts, updates or deletes related records, then SQL rows/checkpoints and graph entities/lists agree before readiness, including gate-summary updates and met/gap/void reference identities. Record the actual command, prerequisite availability and observed result.
- [ ] 2.2 Prove: when A crash, refetch or authorization narrowing interrupts the assembled runtime, then Resume cannot skip data, replacement removes stale rows and no partial relationship batch is published. Record the actual command, prerequisite availability and observed result.
- [ ] 2.3 Prove: when The owner is revoked or disposed while materialization is in flight, then Old-scope work drains or is fenced and cannot publish/write through the next runtime. Record the actual command, prerequisite availability and observed result.

## 3. Completion evidence

- [ ] 3.1 Complete applicable T0/T1 and the phase-prescribed artifact-refiner then adversarial review; preserve synthetic evidence, confirm real callers and mark only actually satisfied work complete. Do not run broad phase/release tiers early.
