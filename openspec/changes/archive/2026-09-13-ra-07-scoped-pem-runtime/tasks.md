## 1. Eligibility and bounded implementation

- [x] 1.1 Confirm dependency completion (ra-06-bounded-revocation), the assigned file ownership and applicable phase decision gates before code changes; verify canonical dependency status and retain the gate decision/evidence artifact.
- [x] 1.2 Add scope-bound runtime/status/action ownership while preserving existing callers through explicit compatibility adapters. Verification: Identity A hydration or a persistence save is delayed, then runtime B mounts must produce this observed outcome: Releasing A's operation causes no publication, action or write in B; disposal settles tracked work and closes A's namespace.
- [x] 1.3 Track async hydration, saves, listener registration and flush work so cancellation/drain have testable completion semantics. Verification: Dispose occurs during a timer, listener registration or queued graph flush must produce this observed outcome: No later callback publishes, no listener leaks, and cleanup is safe when repeated.
- [x] 1.4 Exercise adversarial interleavings with real persistence and package-level scoped React consumers; exclude clinical actions from replay. Verification: A stored queue contains a signing/affirmation action or hydration alone completes must produce this observed outcome: Clinical replay is refused/disabled and hydration readiness is not reported as server catch-up.

## 2. Behavioral acceptance

- [x] 2.1 Prove: when Identity A hydration or a persistence save is delayed, then runtime B mounts, then Releasing A's operation causes no publication, action or write in B; disposal settles tracked work and closes A's namespace. Record the actual command, prerequisite availability and observed result.
- [x] 2.2 Prove: when Dispose occurs during a timer, listener registration or queued graph flush, then No later callback publishes, no listener leaks, and cleanup is safe when repeated. Record the actual command, prerequisite availability and observed result.
- [x] 2.3 Prove: when A stored queue contains a signing/affirmation action or hydration alone completes, then Clinical replay is refused/disabled and hydration readiness is not reported as server catch-up. Record the actual command, prerequisite availability and observed result.

## 3. Completion evidence

- [x] ra07-final-review — 3.1 Complete applicable T0/T1 and the phase-prescribed artifact-refiner then adversarial review; preserve synthetic evidence, confirm real callers and mark only actually satisfied work complete. Do not run broad phase/release tiers early.
