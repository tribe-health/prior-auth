## 1. Eligibility and bounded implementation

- [ ] 1.1 Confirm dependency completion (NONE), the assigned file ownership and applicable phase decision gates before code changes; verify canonical dependency status and retain the gate decision/evidence artifact.
- [ ] 1.2 Recheck static/dynamic consumers and the resolved SWR dependency chain before removal; stop this change for replanning if an active bridge consumer is found. Verification: The dependency cleanup is installed from the updated lockfile must produce this observed outcome: Resolved dependencies contain no SWR/TanStack Query/Apollo query-cache path and exact existing pins remain unchanged.
- [ ] 1.3 Remove the unused bridge and regenerate only the necessary lock closure. Verification: The current presentation components and timeline are checked must produce this observed outcome: Type/lint and relevant render tests pass; no active import points at the removed bridge.
- [ ] 1.4 Extend the architecture dependency guard to cover transitive paths, prove its negative case, and verify presentation/pins. Verification: A transitive forbidden query cache is deliberately introduced in a test fixture must produce this observed outcome: The dependency guard fails, proving it detects the assessment's manifest-only blind spot.

## 2. Behavioral acceptance

- [ ] 2.1 Prove: when The dependency cleanup is installed from the updated lockfile, then Resolved dependencies contain no SWR/TanStack Query/Apollo query-cache path and exact existing pins remain unchanged. Record the actual command, prerequisite availability and observed result.
- [ ] 2.2 Prove: when The current presentation components and timeline are checked, then Type/lint and relevant render tests pass; no active import points at the removed bridge. Record the actual command, prerequisite availability and observed result.
- [ ] 2.3 Prove: when A transitive forbidden query cache is deliberately introduced in a test fixture, then The dependency guard fails, proving it detects the assessment's manifest-only blind spot. Record the actual command, prerequisite availability and observed result.

## 3. Completion evidence

- [ ] 3.1 Complete applicable T0/T1 and the phase-prescribed artifact-refiner then adversarial review; preserve synthetic evidence, confirm real callers and mark only actually satisfied work complete. Do not run broad phase/release tiers early.
