## 1. Eligibility and bounded implementation

- [ ] 1.1 Confirm dependency completion (ra-07-scoped-pem-runtime), the assigned file ownership and applicable phase decision gates before code changes; verify canonical dependency status and retain the gate decision/evidence artifact.
- [ ] 1.2 Define a proposed committed projection contract with scope/generation/batch identity and explicit primary-key mappings. Verification: One committed batch changes evidence, citations, documents and their lists must produce this observed outcome: Subscribers observe a coherent old or new graph, never partial relationships; SQL commit precedes publication.
- [ ] 1.3 Implement atomic entity/list/metadata application and deletion/replacement using scoped stores only. Verification: Reference rows met, gap and void or a row without its declared key arrive must produce this observed outcome: All three valid identities remain distinct; a missing key is rejected instead of becoming undefined.
- [ ] 1.4 Test subscriber observations across multi-entity updates, all three reference keys, invalid identities and stale batches. Verification: Refetch replacement or authorization narrowing removes rows must produce this observed outcome: Obsolete entities/list memberships disappear together; stale-generation batches cannot publish.

## 2. Behavioral acceptance

- [ ] 2.1 Prove: when One committed batch changes evidence, citations, documents and their lists, then Subscribers observe a coherent old or new graph, never partial relationships; SQL commit precedes publication. Record the actual command, prerequisite availability and observed result.
- [ ] 2.2 Prove: when Reference rows met, gap and void or a row without its declared key arrive, then All three valid identities remain distinct; a missing key is rejected instead of becoming undefined. Record the actual command, prerequisite availability and observed result.
- [ ] 2.3 Prove: when Refetch replacement or authorization narrowing removes rows, then Obsolete entities/list memberships disappear together; stale-generation batches cannot publish. Record the actual command, prerequisite availability and observed result.

## 3. Completion evidence

- [ ] 3.1 Complete applicable T0/T1 and the phase-prescribed artifact-refiner then adversarial review; preserve synthetic evidence, confirm real callers and mark only actually satisfied work complete. Do not run broad phase/release tiers early.
