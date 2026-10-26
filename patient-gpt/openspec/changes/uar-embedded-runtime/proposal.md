# Proposal

## Why

Goal 4 says iOS always embeds UAR. UAR embedded refuses to build without four host
components: a driver, a persistence layer, an explicit governance engine and an
explicit tool admission port (`src/embedded.rs:493-595`). Decision 12 accepts the
embedding risk; decision 14 limits the local driver to the onboarding agent;
decision 2 links UAR on iOS with no provider configured for the UAR-absent runs
and keeps UAR out of Android. This change starts only after `uar-embedding-spike`
passes.

## What Changes

- `UarMode::Embedded` in `patient-gpt-uar`, building UAR v1.3.0's
  `EmbeddedRuntime` (profile `embedded-mobile`) from host-supplied components.
- An `ExternalLlmDriver` over the `LocalChatPort`, registered for the onboarding
  agent only. Runs of any other agent on the local driver are refused.
- A tool admission port that admits no tool for the onboarding agent and always
  refuses host-owned clinical commands (affirm, sign, submit, record outcome) for
  every agent.
- UAR persistence and memory under the app data directory, every record
  classified `local`; UAR memory embeddings kept separate from PatientGPT's.
- In-process AG-UI through the bridge from `agui-bridge-and-uar-service`.
- iOS links UAR; its boot mode is `none` (UAR linked, not configured) or
  `embedded`. Android does not link UAR. Desktop wiring is `desktop-uar-topology`.

## Capabilities

### New Capabilities
- `uar-embedded-runtime`: running UAR inside the app process, with which model may drive which agent.
- `agent-tool-admission`: which tools an embedded UAR agent may call and which host commands no agent may reach.

### Modified Capabilities
- (none)

## Impact

- `crates/patient-gpt-uar` (embedded module), `crates/patient-gpt-ffi` (iOS-only
  dependency and boot), workspace `Cargo.toml` (`[patch.crates-io]` overlay as the
  spike prescribes), possibly a toolchain change per the spike and decision 4.
- UAR dependency at tag v1.3.0; pin listed for the operator.
- iOS binary size grows by the amount the spike measured.
