# Tasks

Project testing rule: tests are authored and run only after every production
change in this phase is complete (owner `phase-integration-evidence`). Checks
below are build checkpoints. Depends on `uar-embedding-spike` (report accepted,
decision 3 and if needed decision 4 recorded), `agui-bridge-and-uar-service`,
`ios-local-chat` and `local-embedder-and-mobile-store`.
Owner roles: uar-agent-expert (1–2), rust-domain-engineer (2.2), flutter-engineer (3),
identity-security-engineer reviews 2 at the phase boundary.

Host rule (D-018): tasks marked **[Apple Silicon]** run on-device inference or need arm64 targets; the agent stops and tells the operator to switch to the ARM MacBook Pro before starting them. Unmarked tasks can run on the Intel Mac.

## 1. Embedded runtime

- [ ] 1.1 **[Apple Silicon]** Add UAR at the v1.3.0 commit as an optional dependency of `crates/patient-gpt-uar` behind feature `embedded` (enabled by the iOS FFI build, by the `scripts/evidence/` harness on macOS whatever decision 3 chooses, and by the desktop app only under options a/c), apply the spike's patch overlay at the workspace root, and list the pin for the operator; verify `cargo check -p patient-gpt-uar --features embedded` passes on the host
- [ ] 1.2 **[Apple Silicon]** Implement `UarMode::Embedded`: build `EmbeddedRuntime` with `seed_defaults(false)` (so no built-in agents are seeded), persistence under the data directory, PatientGPT's governance policy, the admission port and the local driver; start runs in-process and stream through the bridge (in-process profile check); verify `cargo check -p patient-gpt-uar --features embedded` passes

## 2. Authority

- [ ] 2.1 **[Apple Silicon]** Implement the `ExternalLlmDriver` over `LocalChatPort`, install only the onboarding agent in a local-driver-only runtime, and add the facade's `driver_not_permitted` check on the agent id before `start_run`; verify `cargo check -p patient-gpt-uar --features embedded` passes
- [ ] 2.2 **[Apple Silicon]** Implement the deny-by-default admission port with an empty allowlist, denial logging and the start-up refusal of clinical command names; add `driver_not_permitted` to the three transport error mappings and `docs/plan/scaffold-contracts.md`; verify each code appears in all three mappings

## 3. Shell wiring

- [ ] 3.1 Wire `none` and `embedded` modes into the iOS FFI boot and pass the mode from Dart; keep Android's build free of UAR and make Android FFI boot accept only mode `none`; verify `cargo check -p patient-gpt-ffi` passes on the host
- [ ] 3.2 **[Apple Silicon]** Run the iOS app in the simulator with mode `none` and confirm it reaches the home view; record as a build-stage observation (not acceptance)

## 4. Change-boundary build batch

- [ ] 4.1 **[Apple Silicon]** Once tasks 1–3 are done, run the one consolidated cross-target batch the Rust rule allows at a change boundary: `cargo check -p patient-gpt-ffi --features embedded --target aarch64-apple-ios-sim`, the same for `aarch64-apple-ios`, and `cargo tree -p patient-gpt-ffi --target aarch64-linux-android -i universal-agent-runtime` (expected: not found); record the output
