## 1. Eligibility and bounded implementation

- [ ] 1.1 Confirm dependency completion (ra-09-pem-delivery-gate), the assigned file ownership and applicable phase decision gates before code changes; verify canonical dependency status and retain the gate decision/evidence artifact.
- [ ] 1.2 Record actual compatible artifact versions, source/API evidence, representative synthetic data size and pass thresholds before the experiment. Verification: A related multi-table source transaction crosses the real authorized facade must produce this observed outcome: The candidate preserves its transaction boundary and exposes a verifiable committed-data boundary before graph publication; fabricated offsets or independent uncoordinated snapshots fail.
- [ ] 1.3 Build a narrow real-facade/PGlite conformance test for multi-shape commits, durable resume, refetch and memory peak. Verification: The test process stops around a checkpoint/data commit and restarts with the same isolated durable synthetic store must produce this observed outcome: No rows are skipped, replay is idempotent and obsolete refetch rows are removed coherently.
- [ ] 1.4 Record pass/failure and the materializer contract consumed by the worker implementation; remove isolated test data afterward. Verification: The selected artifact lacks the required hook, compatibility or memory budget must produce this observed outcome: Record Blocked and a concrete capability gap; no production adoption proceeds on documentation claims alone.

## 2. Behavioral acceptance

- [ ] 2.1 Prove: when A related multi-table source transaction crosses the real authorized facade, then The candidate preserves its transaction boundary and exposes a verifiable committed-data boundary before graph publication; fabricated offsets or independent uncoordinated snapshots fail. Record the actual command, prerequisite availability and observed result.
- [ ] 2.2 Prove: when The test process stops around a checkpoint/data commit and restarts with the same isolated durable synthetic store, then No rows are skipped, replay is idempotent and obsolete refetch rows are removed coherently. Record the actual command, prerequisite availability and observed result.
- [ ] 2.3 Prove: when The selected artifact lacks the required hook, compatibility or memory budget, then Record Blocked and a concrete capability gap; no production adoption proceeds on documentation claims alone. Record the actual command, prerequisite availability and observed result.

## 3. Completion evidence

- [ ] 3.1 Complete applicable T0/T1 and the phase-prescribed artifact-refiner then adversarial review; preserve synthetic evidence, confirm real callers and mark only actually satisfied work complete. Do not run broad phase/release tiers early.
