## 1. Eligibility and bounded implementation

The checked items below retain their original single-host and empty-response receipts. The RA06
adversarial review superseded them as proof of the corrected distributed/final-frame contract.
They do not establish durable authority events, a cross-replica Gate fence or nonempty FRF body
cancellation. The `ra06-revocation-contract-repair` child must supply that evidence before the
parent final review can complete.

- [x] 1.1 Confirm dependency completion (ra-05-authorized-shape-facade), the assigned file ownership and applicable phase decision gates before code changes; verify canonical dependency status and retain the gate decision/evidence artifact.
- [x] 1.2 Before code, define and record the numeric bound, component budgets, clock assumptions and invalidation authority; add a deterministic conformance harness. Verification: Logout, membership removal or session expiry occurs while a response remains open must produce this observed outcome: Protected delivery stops within the recorded pre-implementation budget, including cache/token propagation and clock allowance; new requests deny.
- [x] 1.3 Implement expiry-aware caching/invalidation and a bounded active-response lease, including reconnect and failure behavior. Verification: Invalidation races a cached identity refill or the authority service becomes unavailable must produce this observed outcome: Old authorization cannot be resurrected; protected output stops by the same deadline.
- [x] 1.4 Measure logout, role removal, expiry and stale-refill races across Gate/FRF; preserve existing per-event tenant/view checks. Verification: A clinical command arrives after revocation must produce this observed outcome: Fresh validation refuses it even when a former replica grant/token remains otherwise time-valid.

## 2. Behavioral acceptance

- [x] 2.1 Prove: when Logout, membership removal or session expiry occurs while a response remains open, then Protected delivery stops within the recorded pre-implementation budget, including cache/token propagation and clock allowance; new requests deny. Record the actual command, prerequisite availability and observed result.
- [x] 2.2 Prove: when Invalidation races a cached identity refill or the authority service becomes unavailable, then Old authorization cannot be resurrected; protected output stops by the same deadline. Record the actual command, prerequisite availability and observed result.
- [x] 2.3 Prove: when A clinical command arrives after revocation, then Fresh validation refuses it even when a former replica grant/token remains otherwise time-valid. Record the actual command, prerequisite availability and observed result.

## 3. Completion evidence

- [x] ra06-final-review — 3.1 After `ra06-revocation-contract-repair` completes, run parent T2 and renewed artifact-refiner/adversarial review against the same candidate digest. Confirm durable ASO events, the distributed Gate fence, nonempty FRF final-frame cancellation, the responsive React/Zustand fence, and the candidate-bound open-obligation receipt proving the real RA11c materializer caller remains visibly open and assigned. Do not claim the RA11c producer; mark only actually satisfied RA06 work complete.
