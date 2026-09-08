## 1. Eligibility and bounded implementation

- [ ] 1.1 Confirm dependency completion (ra-19-native-sqlite-parity, ra-20-safe-browser-updates), the assigned file ownership and applicable phase decision gates before code changes; verify canonical dependency status and retain the gate decision/evidence artifact.
- [ ] 1.2 Implement signed paired-version compatibility and updater staging using verified Tauri mechanisms. Verification: A native update arrives with dirty work or an unresolved command must produce this observed outcome: Activation waits for explicit resolution; relaunch revalidates session/schema and resumes coherently.
- [ ] 1.3 Coordinate native work/command reconciliation, DB ownership, relaunch migration and compatible rollback. Verification: A bundle is unsigned, host/frontend incompatible or rollback cannot read the data must produce this observed outcome: The update/rollback is refused with an actionable state; current authorized data is not silently corrupted.
- [ ] 1.4 Exercise signed/invalid bundles, dirty-work deferral, migration interruption and logout restart on each claimed platform. Verification: The application restarts during migration or with logoutPending set must produce this observed outcome: Recovery and local locking survive restart; the previous identity cannot be passively restored.

## 2. Behavioral acceptance

- [ ] 2.1 Prove: when A native update arrives with dirty work or an unresolved command, then Activation waits for explicit resolution; relaunch revalidates session/schema and resumes coherently. Record the actual command, prerequisite availability and observed result.
- [ ] 2.2 Prove: when A bundle is unsigned, host/frontend incompatible or rollback cannot read the data, then The update/rollback is refused with an actionable state; current authorized data is not silently corrupted. Record the actual command, prerequisite availability and observed result.
- [ ] 2.3 Prove: when The application restarts during migration or with logoutPending set, then Recovery and local locking survive restart; the previous identity cannot be passively restored. Record the actual command, prerequisite availability and observed result.

## 3. Completion evidence

- [ ] 3.1 Complete applicable T0/T1 and the phase-prescribed artifact-refiner then adversarial review; preserve synthetic evidence, confirm real callers and mark only actually satisfied work complete. Do not run broad phase/release tiers early.
