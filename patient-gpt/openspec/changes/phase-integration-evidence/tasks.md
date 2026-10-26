# Tasks

Starts only when every task in the other eleven changes is done. One Cargo build
at a time. Missing prerequisites are recorded BLOCKED, never skipped as success.
Owner roles: team-lead (1, 4), product-manager (acceptance), platform-release-engineer
(2), phase-verifier, artifact-critic and ui-critic (3).

Host rule (D-018): tasks marked **[Apple Silicon]** run on-device inference or need arm64 targets; the agent stops and tells the operator to switch to the ARM MacBook Pro before starting them. Unmarked tasks can run on the Intel Mac.

## 1. Readiness

- [ ] 1.1 Confirm every other change reports `all_done` (`openspec instructions apply --change <c> --json`), or that each unfinished task is recorded in the phase `decision-log.md` as Blocked with the operator's verbatim approval (for example `uar-embedded-runtime` after a failed spike); verify the list, and the scenarios each Blocked task leaves BLOCKED, are recorded in the evidence README
- [ ] 1.2 Ask the operator once for the boundary approvals in `verification.md` → Prerequisites (tier gate for release evidence builds, device availability, UAR provider and PAT); record the answers verbatim in the evidence README

## 2. Scenario scripts and runs

- [ ] 2.1 Author `scripts/evidence/` scenario scripts for every scenario ID in `verification.md` except SPIKE-1 (a design input recorded by the spike), each creating its own scratch roots, exercising the production entry point named there, checking the oracle and the negative control, and writing a receipt; verify every scenario ID maps to exactly one script
- [ ] 2.2 **[Apple Silicon]** Run the desktop batch (LANE-1/2/3/5/6, ACQ-1/2/3/4/6, CHAT-1/6/7, PRIV-1, EMB-1/4/5, UAR-5/6/8/9, BRIDGE-1, ONB-1–5, ONB-8, ONB-9, PAR-1) and record receipts
- [ ] 2.3 **[Apple Silicon]** Run the iOS batch (LANE-1/2/6 over FFI, CHAT-2/3/4, EMB-2, STORE-1/2, ACQ-5, UAR-4/7, ONB-6) and record receipts
- [ ] 2.4 **[Apple Silicon]** Run the Android batch (CHAT-5, EMB-3, STORE-1, ACQ-4/5, UAR-11, ONB-6) on the arm64 AVD and record receipts
- [ ] 2.5 On the Intel Mac, run the desktop-intel batch (CHAT-8), then the cloud batch (LANE-1/2/4, UAR-1/2/3/10, ONB-7) against a local UAR v1.3.0 service and record receipts

## 3. Independent review

- [ ] 3.1 Give `artifact-critic` and `ui-critic` only the evidence folder, the changed source and this contract; apply one batched correction cycle and rerun the affected scenarios

## 4. Record

- [ ] 4.1 Write the evidence README verdict table (PASS / FAIL / BLOCKED / NOT_EXERCISED per scenario, with source revision and receipt path) and report goal status in the project's four words (Passed, Build-only, Blocked, Failed); verify every scenario ID has exactly one verdict
