## 1. Eligibility and bounded implementation

- [ ] 1.1 Confirm dependency completion (ra-14-live-evidence-timeline, ra-15-attributed-annotations, ra-16-authorized-source-preview, ra-19-native-sqlite-parity, ra-20-safe-browser-updates, ra-21-safe-native-updates), the assigned file ownership and applicable phase decision gates before code changes; verify canonical dependency status and retain the gate decision/evidence artifact.
- [ ] 1.2 Assemble explicit non-skipping service/fixture checks and run the complete scenario/UI mapping after relevant T0/T1 gates. Verification: The full configured deployment is certified must produce this observed outcome: Every required scenario has observed command/service/browser evidence, artifact versions and a Passed/Build-only/Blocked/Failed result; no prerequisite silently skips.
- [ ] 1.3 At phase completion run required T2 gates sequentially for Rust; only then perform appropriate release/device T3 certification. Verification: A claimed native OS/browser or hard pin/policy gate lacks evidence must produce this observed outcome: That surface and publication remain Blocked; successful browser/fixture tests do not substitute.
- [ ] 1.4 Run artifact-refiner followed by isolated adversarial review, record warning disposition and evidence, then reflect and update only genuinely satisfied completion dimensions. Verification: A new guard is relied on or a new runtime adapter is exported must produce this observed outcome: Its failure mode is demonstrated at the real integration boundary and caller tracing shows the intended runtime path is actually mounted.

## 2. Behavioral acceptance

- [ ] 2.1 Prove: when The full configured deployment is certified, then Every required scenario has observed command/service/browser evidence, artifact versions and a Passed/Build-only/Blocked/Failed result; no prerequisite silently skips. Record the actual command, prerequisite availability and observed result.
- [ ] 2.2 Prove: when A claimed native OS/browser or hard pin/policy gate lacks evidence, then That surface and publication remain Blocked; successful browser/fixture tests do not substitute. Record the actual command, prerequisite availability and observed result.
- [ ] 2.3 Prove: when A new guard is relied on or a new runtime adapter is exported, then Its failure mode is demonstrated at the real integration boundary and caller tracing shows the intended runtime path is actually mounted. Record the actual command, prerequisite availability and observed result.

## 3. Completion evidence

- [ ] 3.1 Complete applicable T0/T1 and the phase-prescribed artifact-refiner then adversarial review; preserve synthetic evidence, confirm real callers and mark only actually satisfied work complete. Do not run broad phase/release tiers early.
