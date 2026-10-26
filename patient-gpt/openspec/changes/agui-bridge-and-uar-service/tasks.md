# Tasks

Project testing rule: tests are authored and run only after every production
change in this phase is complete (owner `phase-integration-evidence`). Checks
below are build checkpoints. Depends on `inference-contract` (including its onboarding prompt constant).
Owner roles: uar-agent-expert (1, 3), flint-data-engineer (2), team-lead (4).

Host rule (D-018): tasks marked **[Apple Silicon]** run on-device inference or need arm64 targets; the agent stops and tells the operator to switch to the ARM MacBook Pro before starting them. Unmarked tasks can run on the Intel Mac.

## 1. Bridge

- [ ] 1.1 Implement the AG-UI 1.0 → subset bridge module in `crates/patient-gpt-uar` (event mapping, boundary synthesis, `unsupported_event`, `protocol_mismatch`), with event types taken from UAR v1.3.0 `docs/AGUI_V1.md`; verify `cargo check -p patient-gpt-uar` passes

## 2. Service client

- [ ] 2.1 Read UAR v1.3.0 `docs/API_KEYS.md` and `docs/AGUI_V1.md` at the tag and implement the service client: token exchange and refresh, request body, SSE parsing, connect timeout, error codes; read the token from `PATIENTGPT_UAR_TOKEN` and validate the URL rule at startup; verify `cargo check -p patient-gpt-uar` passes
- [ ] 2.2 Implement the scope → agent routing table and `agent_unavailable` refusal, and make `build_runtime` return the service client for `UarMode::Service`; verify `cargo check --workspace` passes
- [ ] 2.3 Add a `HostError` variant for `agent_unavailable` (503), put the service-URL rule in `crates/patient-gpt-domain` as one function, and add the new codes (`agent_unavailable`, `uar_unavailable`, `uar_unauthorized`, `unsupported_event`, `protocol_mismatch`) to the HTTP, Tauri and FFI error mappings and to `docs/plan/scaffold-contracts.md`; verify each code appears in all three mappings by name

## 3. UAR side

- [ ] 3.1 Establish from UAR v1.3.0 docs how an agent is defined and installed on a local service; author the onboarding agent definition under `uar/agents/onboarding/` (no tools, no clinical instructions; its static system prompt is copied from the host's onboarding prompt constant without device catalog ids, because setup proposals are parsed only on the local lane this phase), and record the build, start, token and installation steps for a local UAR service in `docs/plan/local-inference-runbook.md`; verify the definition validates with UAR's own validator if one exists at the tag, else record that none exists
- [ ] 3.2 Write `docs/plan/uar-a2ui-catalog-request.md` as a lead-scoped handoff asking UAR to admit `urn:patientgpt:a2ui:catalog:basic:v1`, citing `src/uar/a2ui/protocol.rs` at the tag; verify it names the requested change, the reason and the PatientGPT catalog source; the operator files it

## 4. Build-stage demo

- [ ] 4.1 Start a local UAR v1.3.0 service per the runbook and the Axum server in service mode, and send one onboarding `uar` run with `curl -N` to `POST /api/runs` (the onboarding screen arrives in `local-onboarding`); record the observation in the phase's `evidence/build-stage/` folder as a build-stage demo (not acceptance), or record which prerequisite was missing
