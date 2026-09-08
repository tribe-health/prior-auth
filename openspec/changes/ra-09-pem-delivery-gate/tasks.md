## 1. Eligibility and bounded implementation

- [ ] 1.1 Confirm dependency completion (ra-08-committed-graph-projection), the assigned file ownership and applicable phase decision gates before code changes; verify canonical dependency status and retain the gate decision/evidence artifact.
- [ ] 1.2 Produce and verify the candidate package closure without republishing or relabeling 4.0.0. Verification: Candidate packages are consumed by the isolated acceptance checkout must produce this observed outcome: Scoped lifecycle and committed projection tests run through installed public exports, with source and artifact provenance recorded.
- [ ] 1.3 Attach a concrete package-diff/provenance and consumer-test receipt for the operator-controlled pin decision. Verification: No authorized pin change or matching published/approved artifact exists must produce this observed outcome: Adoption stays Blocked; a candidate result is not reported as delivery in the original 4.0.0 installation.
- [ ] 1.4 After that decision, adopt the actual artifact and rerun resolved-entrypoint/pin/singleton checks; otherwise record the downstream block. Verification: An authorized real release is adopted must produce this observed outcome: Pin authority, manifests, lockfile, installed versions and package identity agree; no overwritten 4.0.0, silent workspace alias or duplicate core singleton remains.

## 2. Behavioral acceptance

- [ ] 2.1 Prove: when Candidate packages are consumed by the isolated acceptance checkout, then Scoped lifecycle and committed projection tests run through installed public exports, with source and artifact provenance recorded. Record the actual command, prerequisite availability and observed result.
- [ ] 2.2 Prove: when No authorized pin change or matching published/approved artifact exists, then Adoption stays Blocked; a candidate result is not reported as delivery in the original 4.0.0 installation. Record the actual command, prerequisite availability and observed result.
- [ ] 2.3 Prove: when An authorized real release is adopted, then Pin authority, manifests, lockfile, installed versions and package identity agree; no overwritten 4.0.0, silent workspace alias or duplicate core singleton remains. Record the actual command, prerequisite availability and observed result.

## 3. Completion evidence

- [ ] 3.1 Complete applicable T0/T1 and the phase-prescribed artifact-refiner then adversarial review; preserve synthetic evidence, confirm real callers and mark only actually satisfied work complete. Do not run broad phase/release tiers early.
