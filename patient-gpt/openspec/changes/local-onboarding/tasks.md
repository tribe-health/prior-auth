# Tasks

Project testing rule: tests are authored and run only after every production
change in this phase is complete (owner `phase-integration-evidence`). Checks
below are build checkpoints. Depends on `inference-contract`, `model-acquisition`,
`desktop-local-chat`, `local-embedder-and-mobile-store` (settings store), `agui-bridge-and-uar-service`
(the shared service-URL rule in `patient-gpt-domain`), and for mobile screens
`ios-local-chat` / `android-local-chat`.
Owner roles: design-expert and creative-director (1.1), product-manager (1.2
acceptance), rust-domain-engineer (2), storage-engineer (2.3), tauri-engineer and
flint-data-engineer (3), react-engineer (4), flutter-engineer (5).

Host rule (D-018): tasks marked **[Apple Silicon]** run on-device inference or need arm64 targets; the agent stops and tells the operator to switch to the ARM MacBook Pro before starting them. Unmarked tasks can run on the Intel Mac.

## 1. Gates before UI

- [ ] 1.1 Draft the onboarding screen and model-progress row as additions to `docs/design/` (prototype HTML/CSS/JS using existing tokens, components and the host-controls gate, both themes, labelled states); verify the operator has approved the addition before tasks 4 and 5 start
- [ ] 1.2 **[Apple Silicon]** Run (as a design input allowed mid-phase by D-018) Qwen3-0.6B over 20 synthetic onboarding prompts through the desktop local lane with the onboarding system prompt, and record valid-proposal and invalid-block counts with the prompts and replies in `docs/plan/onboarding-proposal-feasibility.md`; verify the operator has chosen how to proceed

## 2. Host

- [ ] 2.1 Add `SetupProposal`, `SetupStep`, `ProposalState`, `Settings`, `SetupProgressEvent` and the setup DTOs to `crates/patient-gpt-domain`; verify `cargo check -p patient-gpt-domain` passes
- [ ] 2.2 Implement in `crates/patient-gpt-host` the streaming block withholder, the block extractor and validator, the host-side proposal store, emission of the `patientgpt.setup_proposal` event, proposal instructions added to the local-lane onboarding prompt only (verify `uar/agents/onboarding/` still embeds the base prompt text exactly), and `apply_setup_proposal` / `decline_setup_proposal` / `get_settings` on `AppServices`; verify `cargo check -p patient-gpt-host` passes
- [ ] 2.3 Add the settings record to the desktop SurrealDB store in `crates/patient-gpt-storage` (the record type and the mobile store came from `local-embedder-and-mobile-store` 2.1); verify `cargo check -p patient-gpt-storage --features surreal` passes

## 3. Transports

- [ ] 3.1 Add the three setup commands to `crates/patient-gpt-server/src/routes.rs` (refusing with `host_unsupported`), `desktop/src-tauri/src/commands.rs` and the FFI API, regenerate the Dart bridge, and add the rows to `docs/plan/scaffold-contracts.md`; verify `cargo check --workspace` passes and each command appears in all three by name

## 4. Web and desktop screens

- [ ] 4.1 Build `web/src/features/onboarding/` (kebab-case files) from the approved design: prepare control with progress, onboarding thread whose lane follows `model_status` lanes, proposal gate, invalid-proposal notice; route it in `web/src/app/router.tsx`; durable entities through the entity graph, transient state in Zustand, no query cache; verify `pnpm -C web typecheck` and `pnpm -C web build` pass and `rg -n '"(@tanstack/react-query|swr|@apollo/client)"' web/package.json` finds nothing (the parent `scripts/audit.sh` checks the parent's web app, not this one)
- [ ] 4.2 **[Apple Silicon]** Show the onboarding entry on desktop first launch when no chat model is ready; verify a debug Tauri launch with a scratch data directory shows it

## 5. Mobile screens

- [ ] 5.1 **[Apple Silicon]** Build `mobile/lib/features/onboarding/` from the approved design with Riverpod presentation state and route it in `mobile/lib/app/router.dart`; verify `flutter analyze` shows no new errors and a debug run on the iPhone 17 simulator shows the prepare control
