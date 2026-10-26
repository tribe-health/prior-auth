# Tasks

Project testing rule: tests are authored and run only after every production
change in this phase is complete (owner `phase-integration-evidence`). Depends on
`uar-embedding-spike` (decision 3 recorded), `uar-embedded-runtime` (options a/c)
and `agui-bridge-and-uar-service`.
Owner roles: team-lead (1), tauri-engineer (2), uar-agent-expert (2).

This change is BLOCKED for implementation until task 1.2 is done.

Host rule (D-018): tasks marked **[Apple Silicon]** run on-device inference or need arm64 targets; the agent stops and tells the operator to switch to the ARM MacBook Pro before starting them. Unmarked tasks can run on the Intel Mac.

## 1. Decision

- [ ] 1.1 Confirm decision 3 is recorded verbatim in the phase `decision-log.md` with the spike report cited; verify the entry exists
- [ ] 1.2 Amend this change with the option-specific tasks (and, for option c, the transport-mirror rule amendment for operator approval) and re-run `openspec validate desktop-uar-topology`; verify validation passes and the operator has reviewed the amendment

## 2. Topology-independent wiring

- [ ] 2.1 Keep the local lane in-process in `desktop/src-tauri/src/lib.rs` independent of UAR start-up, and map UAR start or process failure to `uar_unavailable` without terminating the app; verify `cargo check -p patient-gpt-desktop` passes

## 3. Chosen option (expanded by the amendment in task 1.2)

- [ ] 3.1 **[Apple Silicon]** Implement the chosen option's wiring so a `uar` onboarding run from the Tauri window reaches UAR (tasks replaced by the amendment); verify `cargo check -p patient-gpt-desktop` passes
