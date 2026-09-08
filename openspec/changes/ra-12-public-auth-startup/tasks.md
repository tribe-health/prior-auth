## 1. Eligibility and bounded implementation

- [ ] 1.1 Confirm dependency completion (ra-11c-sql-materialization), the assigned file ownership and applicable phase decision gates before code changes; verify canonical dependency status and retain the gate decision/evidence artifact.
- [ ] 1.2 Separate public/authenticated route composition and add a sanitized session/runtime store with explicit state transitions. Verification: The browser cold-starts logged out, or Kratos is unavailable must produce this observed outcome: Login/recovery remains usable with zero private DB opens/shape subscriptions; anonymous and unavailable render distinctly.
- [ ] 1.3 Implement the typed Kratos flow hook and shadcn AuthFlowForm against real browser-flow endpoints. Verification: A valid identity starts the application must produce this observed outcome: Migration precedes hydration and required shape catch-up; Ready is never inferred from DB-open or snapshot hydration alone.
- [ ] 1.4 Test public cold start, upstream failure, expired/invalid form flow and authenticated state ordering with an instrumented DB owner. Verification: A flow has field errors, expires or completes recovery/login must produce this observed outcome: The UI renders provider messages and renews only the correct flow; no token/CSRF secret is persisted into a business or interaction store.

## 2. Behavioral acceptance

- [ ] 2.1 Prove: when The browser cold-starts logged out, or Kratos is unavailable, then Login/recovery remains usable with zero private DB opens/shape subscriptions; anonymous and unavailable render distinctly. Record the actual command, prerequisite availability and observed result.
- [ ] 2.2 Prove: when A valid identity starts the application, then Migration precedes hydration and required shape catch-up; Ready is never inferred from DB-open or snapshot hydration alone. Record the actual command, prerequisite availability and observed result.
- [ ] 2.3 Prove: when A flow has field errors, expires or completes recovery/login, then The UI renders provider messages and renews only the correct flow; no token/CSRF secret is persisted into a business or interaction store. Record the actual command, prerequisite availability and observed result.

## 3. Completion evidence

- [ ] 3.1 Complete applicable T0/T1 and the phase-prescribed artifact-refiner then adversarial review; preserve synthetic evidence, confirm real callers and mark only actually satisfied work complete. Do not run broad phase/release tiers early.
