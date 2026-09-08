## 1. Eligibility and bounded implementation

- [ ] 1.1 Confirm dependency completion (ra-05-authorized-shape-facade), the assigned file ownership and applicable phase decision gates before code changes; verify canonical dependency status and retain the gate decision/evidence artifact.
- [ ] 1.2 Before code, define and record the numeric bound, component budgets, clock assumptions and invalidation authority; add a deterministic conformance harness. Verification: Logout, membership removal or session expiry occurs while a response remains open must produce this observed outcome: Protected delivery stops within the recorded pre-implementation budget, including cache/token propagation and clock allowance; new requests deny.
- [ ] 1.3 Implement expiry-aware caching/invalidation and a bounded active-response lease, including reconnect and failure behavior. Verification: Invalidation races a cached identity refill or the authority service becomes unavailable must produce this observed outcome: Old authorization cannot be resurrected; protected output stops by the same deadline.
- [ ] 1.4 Measure logout, role removal, expiry and stale-refill races across Gate/FRF; preserve existing per-event tenant/view checks. Verification: A clinical command arrives after revocation must produce this observed outcome: Fresh validation refuses it even when a former replica grant/token remains otherwise time-valid.

## 2. Behavioral acceptance

- [ ] 2.1 Prove: when Logout, membership removal or session expiry occurs while a response remains open, then Protected delivery stops within the recorded pre-implementation budget, including cache/token propagation and clock allowance; new requests deny. Record the actual command, prerequisite availability and observed result.
- [ ] 2.2 Prove: when Invalidation races a cached identity refill or the authority service becomes unavailable, then Old authorization cannot be resurrected; protected output stops by the same deadline. Record the actual command, prerequisite availability and observed result.
- [ ] 2.3 Prove: when A clinical command arrives after revocation, then Fresh validation refuses it even when a former replica grant/token remains otherwise time-valid. Record the actual command, prerequisite availability and observed result.

## 3. Completion evidence

- [ ] 3.1 Complete applicable T0/T1 and the phase-prescribed artifact-refiner then adversarial review; preserve synthetic evidence, confirm real callers and mark only actually satisfied work complete. Do not run broad phase/release tiers early.
