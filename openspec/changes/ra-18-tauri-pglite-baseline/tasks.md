## 1. Eligibility and bounded implementation

- [x] 1.1 Confirm dependency completion (ra-17-native-session-transport), the assigned file ownership and applicable phase decision gates before code changes; verify canonical dependency status and retain the gate decision/evidence artifact.
- [x] 1.2 Implement the native PGlite owner/follower adapter and retain the same committed replica and graph contracts. Verification: Two Tauri windows show the same case must produce this observed outcome: One DB/sync owner supplies identical entities/lists while selection/filter state remains independent.
- [x] 1.3 Run lifecycle and data conformance fixtures in an actual Tauri window, then two windows. Verification: A window closes, the owner exits, or identity changes must produce this observed outcome: Ownership transfers or restarts without duplicate commits and stale windows cannot read/write the old scope.
- [x] 1.4 Record OS/webview/persistence policy and cold/warm/catch-up/teardown measurements for the baseline. Verification: The baseline runs on a claimed OS/webview must produce this observed outcome: Actual first-row/catch-up/teardown measurements and runtime evidence are recorded; a browser build is not substituted.

## 2. Behavioral acceptance

- [x] 2.1 Prove: when Two Tauri windows show the same case, then One DB/sync owner supplies identical entities/lists while selection/filter state remains independent. Record the actual command, prerequisite availability and observed result.
- [x] 2.2 Prove: when A window closes, the owner exits, or identity changes, then Ownership transfers or restarts without duplicate commits and stale windows cannot read/write the old scope. Record the actual command, prerequisite availability and observed result.
- [x] 2.3 Prove: when The baseline runs on a claimed OS/webview, then Actual first-row/catch-up/teardown measurements and runtime evidence are recorded; a browser build is not substituted. Record the actual command, prerequisite availability and observed result.

## 3. Completion evidence

- [x] 3.1 Complete applicable T0/T1 and the phase-prescribed artifact-refiner then adversarial review; preserve synthetic evidence, confirm real callers and mark only actually satisfied work complete. Do not run broad phase/release tiers early.
