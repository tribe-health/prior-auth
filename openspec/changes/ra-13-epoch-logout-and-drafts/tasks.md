## 1. Eligibility and bounded implementation

- [ ] 1.1 Confirm dependency completion (ra-12-public-auth-startup), the assigned file ownership and applicable phase decision gates before code changes; verify canonical dependency status and retain the gate decision/evidence artifact.
- [ ] 1.2 Implement epoch invalidation, coordinated cross-tab hints and revalidation on resume; scope view state by identity/practice/epoch/case/view instance. Verification: Account/practice changes during hydration, catch-up, persistence or an attachment request must produce this observed outcome: Old work cannot publish, save into or execute in the new scope; protected content locks immediately and Quiescing completes deterministically.
- [ ] 1.3 Implement logoutPending durability and revocation retry using credentials only in their protected facility. Verification: Logout fails offline, then the browser reloads or another tab opens must produce this observed outcome: The durable marker blocks passive cookie reentry; only confirmed revocation or explicit fresh login can resolve it; marker-storage failure is honestly reported.
- [ ] 1.4 Implement separately scoped draft persistence/recovery and test delayed old work, reload/new-tab logout, unavailable storage and migration/rebuild behavior. Verification: A replica rebuild, revocation or unsupported migration intersects unsent work must produce this observed outcome: Only the freshly authorized original user can recover permitted drafts; memory-only loss on emergency lock is explicit; offline access stays locked without a grant.

## 2. Behavioral acceptance

- [ ] 2.1 Prove: when Account/practice changes during hydration, catch-up, persistence or an attachment request, then Old work cannot publish, save into or execute in the new scope; protected content locks immediately and Quiescing completes deterministically. Record the actual command, prerequisite availability and observed result.
- [ ] 2.2 Prove: when Logout fails offline, then the browser reloads or another tab opens, then The durable marker blocks passive cookie reentry; only confirmed revocation or explicit fresh login can resolve it; marker-storage failure is honestly reported. Record the actual command, prerequisite availability and observed result.
- [ ] 2.3 Prove: when A replica rebuild, revocation or unsupported migration intersects unsent work, then Only the freshly authorized original user can recover permitted drafts; memory-only loss on emergency lock is explicit; offline access stays locked without a grant. Record the actual command, prerequisite availability and observed result.

## 3. Completion evidence

- [ ] 3.1 Complete applicable T0/T1 and the phase-prescribed artifact-refiner then adversarial review; preserve synthetic evidence, confirm real callers and mark only actually satisfied work complete. Do not run broad phase/release tiers early.
