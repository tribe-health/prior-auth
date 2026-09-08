## 1. Eligibility and bounded implementation

- [x] 1.1 Confirm dependency completion (ra-01-verified-session), the assigned file ownership and applicable phase decision gates before code changes; verify canonical dependency status and retain the gate decision/evidence artifact.
- [x] 1.2 Add an additive, checksummed server migration and least-privilege repository transaction for affirmation and its command-result record. Include the existing gate-summary read/trigger behavior and direct-column write refusal. Verification: An authorized surgeon affirms with a stable command ID must produce this observed outcome: Gate policy, AppServices capability and the database each enforce authority; one durable affirmation and audited result commit atomically.
- [x] 1.3 Remove body-selected actor authority from mounted affirmation; implement Gate/service/database refusal and the equivalent desktop wrapper contract. Verification: Administrator, agent or foreign-practice actor attempts affirmation at each enforcement layer separately must produce this observed outcome: Each layer refuses independently, even when the other two are bypassed by the test harness.
- [x] 1.4 Test fresh and upgrade installs, all three independent refusals and lost-response/payload-conflict behavior against real Postgres. Verification: The response is lost, or the same command ID carries a different payload must produce this observed outcome: A lookup/retry reconciles the committed result without a second effect; payload conflict is explicit.

## 2. Behavioral acceptance

- [x] 2.1 Prove: when An authorized surgeon affirms with a stable command ID, then Gate policy, AppServices capability and the database each enforce authority; one durable affirmation and audited result commit atomically. Record the actual command, prerequisite availability and observed result.
- [x] 2.2 Prove: when Administrator, agent or foreign-practice actor attempts affirmation at each enforcement layer separately, then Each layer refuses independently, even when the other two are bypassed by the test harness. Record the actual command, prerequisite availability and observed result.
- [x] 2.3 Prove: when The response is lost, or the same command ID carries a different payload, then A lookup/retry reconciles the committed result without a second effect; payload conflict is explicit. Record the actual command, prerequisite availability and observed result.
- [x] 2.4 Prove: when Another authorized surgeon adds or removes a required affirmation, then The cases.gate_affirmed_at derived value updates or clears transactionally, and a caller cannot directly spoof it. Record the actual command, prerequisite availability and observed result.

## 3. Completion evidence

- [x] 3.1 Complete applicable T0/T1 and the phase-prescribed artifact-refiner then adversarial review; preserve synthetic evidence, confirm real callers and mark only actually satisfied work complete. Do not run broad phase/release tiers early.
