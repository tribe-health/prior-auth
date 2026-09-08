## 1. Eligibility and bounded implementation

- [ ] 1.1 Confirm dependency completion (ra-18-tauri-pglite-baseline), the assigned file ownership and applicable phase decision gates before code changes; verify canonical dependency status and retain the gate decision/evidence artifact.
- [ ] 1.2 Define engine-neutral conformance fixtures and record SQLite/encryption dependency choices against verified artifacts before adoption. Verification: The same synthetic stream including deletes/refetch is applied to both engines must produce this observed outcome: Normalized IDs, nulls, dates, ordering, relationships and checkpoint recovery match. Annotation entities, gate summary and every relation in the ra-18 projection are included; a five-table-only experiment cannot pass release parity.
- [ ] 1.3 Implement native relational materialization/repositories/migrations for that complete revision, extending the original five-table contract to every projection required by the native reference slice. Verification: Two windows, migration failure or an interrupted commit are exercised must produce this observed outcome: A single host owner preserves transaction/isolation and recovery behavior equivalent to the baseline.
- [ ] 1.4 Measure parity and resource/latency trade-offs, then record an evidence-based engine disposition without changing the UI API. Verification: Parity, approved encryption/storage or a measured benefit is absent must produce this observed outcome: SQLite release selection remains blocked and the tested PGlite baseline remains the candidate; no parity success is fabricated.

## 2. Behavioral acceptance

- [ ] 2.1 Prove: when The same synthetic stream including deletes/refetch is applied to both engines, then Normalized IDs, nulls, dates, ordering, relationships and checkpoint recovery match. Annotation entities, gate summary and every relation in the ra-18 projection are included; a five-table-only experiment cannot pass release parity. Record the actual command, prerequisite availability and observed result.
- [ ] 2.2 Prove: when Two windows, migration failure or an interrupted commit are exercised, then A single host owner preserves transaction/isolation and recovery behavior equivalent to the baseline. Record the actual command, prerequisite availability and observed result.
- [ ] 2.3 Prove: when Parity, approved encryption/storage or a measured benefit is absent, then SQLite release selection remains blocked and the tested PGlite baseline remains the candidate; no parity success is fabricated. Record the actual command, prerequisite availability and observed result.

## 3. Completion evidence

- [ ] 3.1 Complete applicable T0/T1 and the phase-prescribed artifact-refiner then adversarial review; preserve synthetic evidence, confirm real callers and mark only actually satisfied work complete. Do not run broad phase/release tiers early.
