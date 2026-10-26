# Tasks

Spike observations are design inputs for decisions 3 and 4, allowed mid-phase by D-018. They are not phase
acceptance evidence; acceptance reruns at the final boundary
(`phase-integration-evidence`). Depends on `inference-contract`,
`model-acquisition` and `desktop-local-chat` (the driver wraps the macOS adapter).
Owner roles: uar-agent-expert (1–3), rust-domain-engineer (2.2), team-lead (4).
One Cargo build at a time on this machine.

Host rule (D-018): tasks marked **[Apple Silicon]** run on-device inference or need arm64 targets; the agent stops and tells the operator to switch to the ARM MacBook Pro before starting them. Unmarked tasks can run on the Intel Mac.

## 1. Version facts

- [ ] 1.1 Re-check every UAR citation in `analysis.md` and `assessment.md` at tag v1.3.0 (`git -C <UAR repo> show v1.3.0:<path>`), and record each as confirmed, moved or changed in the report; verify the report lists every cited path
- [ ] 1.2 Record whether v1.3.0's CHANGELOG still reads "verification pending" and what the tag's `docs/product-support-matrix.json` says for the mobile platform and `embedded-mobile` profile; verify the quotes in the report match the tag

## 2. Build

- [ ] 2.1 **[Apple Silicon]** Create `spikes/uar-embedding/` as its own Cargo workspace depending on UAR at the v1.3.0 commit with `--no-default-features --features embedded-mobile`, plus path dependencies on `patient-gpt-host` and `patient-gpt-inference`, replicating UAR's `[patch.crates-io]` overlay at the spike root; record whether `cargo check` passes on stable 1.99.1 and, only if not, on UAR's pinned nightly. If nightly is required, the report states that a toolchain applies to the whole build that links UAR (the FFI crate, and the desktop crate under options a/c), not to UAR's crates alone, because decision 4's wording assumed a per-crate pin
- [ ] 2.2 **[Apple Silicon]** Record the overlay's effect on PatientGPT's `surrealdb =3.3.0` (resolved version and source in the spike's `Cargo.lock`, and whether `patient-gpt-storage` still compiles under it)
- [ ] 2.3 **[Apple Silicon]** Compile and link for `aarch64-apple-ios` and `aarch64-apple-ios-sim`; record pass or the first error
- [ ] 2.4 **[Apple Silicon]** Record binary size added by UAR for `aarch64-apple-ios`. A debug size is recorded as debug; a release size needs the operator's tier gate (decision 11 opens it for evidence runs only) — ask once, and if not opened, record release size as UNKNOWN

## 3. Run

- [ ] 3.1 **[Apple Silicon]** Build `EmbeddedRuntime` with an `ExternalLlmDriver` over the macOS local chat adapter, an explicit persistence layer under a scratch directory, an explicit governance engine and a tool admission port that admits nothing; start one in-process run, subscribe, convert events with UAR's AG-UI adapter, and record the event sequence and whether `TEXT_MESSAGE_START`/`END` had to be synthesized
- [ ] 3.2 **[Apple Silicon]** Repeat the run 20 times starting the subscription immediately after `start_run`; record how many runs lost events before subscription (the start/subscribe race)

## 4. Report and decision

- [ ] 4.1 **[Apple Silicon]** Write `docs/plan/uar-embedding-spike.md` with each measurement, its command and its observed output, a pass/fail verdict per item, and the consequence for desktop options (a), (b), (c); verify every item from tasks 1–3 appears
- [ ] 4.2 Put decision 3 (and decision 4 if stable failed) to the operator with the report, record the answer verbatim in the phase `decision-log.md`, copy the working `[patch.crates-io]` overlay and resolved versions into the report, and only then delete `spikes/uar-embedding/` (after the operator accepts the report)
