# RA-02 refinement decisions

### Iteration 1 decision

Decision: terminate refinement after validator exit 0. Iteration: 1 of 1. Blocking violations remaining: 0. The caller audit found one concrete contract mismatch: the Gate policy route reached through `AppServices` into the case repository. It now uses the public `read_verified_gate` service method, and the route's 10 focused tests pass. Mounted browser UI and Tauri IPC remain outside this change and are reported as unverified. Independent adversarial review remains the next parent-owned gate.

### Iteration 2 decision

Decision: terminate after a fresh complete-packet review returns no critical findings. Iteration: 2 of 2. Blocking violations remaining after implementation: 0. The judge's principal-provenance finding was valid at the shared session boundary and is fixed with an authoritative identity-provider field plus an accepting-membership refusal test. The three warnings are also fixed: typed hook options, a process-wide hardened Gate client, and parsed database-target equality at startup. These changes stay within RA-02's authority and transport scope.

### Iteration 3 decision

Decision: terminate only after a fresh complete-packet review returns no critical findings. Iteration: 3 of 3. Blocking violations remaining after implementation: 0. The judge correctly found that target-case authority preceded command conflict resolution. Both `AppServices` and PostgreSQL now resolve an existing command within identity and practice before examining a changed target, with real missing-case and foreign-case controls. The hook also clears `lastCommandId` after a definitive 403 and retains it only for uncertain reconciliation.
