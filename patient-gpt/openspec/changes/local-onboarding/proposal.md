# Proposal

## Why

Goal 5 has the local model drive the onboarding that sets up the decentralized
deployment, without agentic clinical work. Decision 8 makes onboarding single
turns: the model proposes, the trusted host executes only after the user confirms.
Decision 15 scopes the setup to choosing and downloading the local chat model and
embedder, and recording a UAR endpoint URL when one exists. The setup commands do
not exist (B10), and `docs/design` has no onboarding or model-progress screen.

## What Changes

- A host-driven first step: on first launch with no `ready` chat model, the app
  offers a host-owned "Prepare on-device assistant" control that runs
  `prepare_models` with the preflight defaults. The model cannot run before it is
  installed, so this step is not model-proposed.
- An onboarding conversation (scope `onboarding`) whose `local`-lane replies
  may contain one structured setup proposal in a fenced `patientgpt-setup` block.
- Host validation of proposals: schema version 1, steps `prepare_models` (catalog
  ids for this platform) and `set_uar_endpoint` (URL rule as in
  `uar-service-client`). Invalid proposals are shown as plain text with no control.
- Proposals are stored host-side and rendered as a host-owned confirmation gate
  (the prototype's host-controls pattern). Confirming sends only the proposal id.
- Mirrored setup commands on Axum, Tauri and FFI: `apply_setup_proposal`
  (streamed `SetupProgressEvent`s, transported like `prepare_models`),
  `decline_setup_proposal`, `get_settings`; refused with `host_unsupported` on the
  Axum cloud host.
- The onboarding screen's lane follows the host: `uar` when UAR is configured,
  `local` otherwise. This is the product path for the UAR onboarding scenarios.
- Settings record `uarEndpointUrl` stored locally (desktop SurrealDB, mobile store).
  Recorded only: connecting to it is not part of this phase.
- Onboarding screens for the shared React app and Flutter, composed from existing
  `docs/design` components, after the design addition in task 1.1 is approved.
- A feasibility check of Qwen3-0.6B producing valid proposals before the UI work.

## Capabilities

### New Capabilities
- `onboarding-conversation`: the onboarding flow the user sees, from first launch through proposals and their confirmation.
- `setup-commands`: the host commands that execute confirmed setup proposals and the settings they write.

### Modified Capabilities
- (none)

## Impact

- `crates/patient-gpt-domain`, `crates/patient-gpt-host` (proposal parser,
  proposal store, setup service), `crates/patient-gpt-storage` (settings),
  `crates/patient-gpt-server`, `desktop/src-tauri`, `crates/patient-gpt-ffi`.
- `web/src/features/onboarding/` (new, kebab-case filenames), `web/src/app/router.tsx`;
  `mobile/lib/features/onboarding/` (new), `mobile/lib/app/router.dart`.
- `docs/design/` gains onboarding and model-progress surfaces only through the
  design-authority process (task 1.1), never by improvisation in code.
