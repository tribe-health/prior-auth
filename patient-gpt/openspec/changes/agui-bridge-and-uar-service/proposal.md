# Proposal

## Why

Goal 4 has the cloud host reach a running UAR by URL, using the same routing code
as the desktop host and the iOS embedding. Today `UarMode::Service` fails at
startup (`crates/patient-gpt-uar/src/lib.rs:22`), no Rust UAR client exists, and
UAR speaks AG-UI 1.0 (`@ag-ui/core` 1.0.2) while the shells consume PatientGPT's
six-event subset (`docs/plan/scaffold-contracts.md:55-69`) and the web stays on
`@ag-ui/core` 0.0.59 because `@prometheus-ags/a2ui-react` 4.2.0 peers `<0.1.0`.
Decision 13 builds this now against a local UAR service.

## What Changes

- An AG-UI 1.0 → PatientGPT subset bridge (B6) in a new module of
  `patient-gpt-uar`: maps run, text-message and error events, synthesizes
  `TEXT_MESSAGE_START`/`END` where UAR omits them, and turns unsupported event
  types into an explicit `RUN_ERROR` rather than dropping them silently.
- `UarMode::Service { url }` implemented: an HTTP/SSE client to
  `POST {url}/api/uar/ag-ui/agents/{agent_id}` with UAR's token exchange, the token
  read from `PATIENTGPT_UAR_TOKEN`.
- A shared routing table from conversation scope to UAR agent id, used by the
  service client now and the embedded runtime later. Onboarding maps to the
  PatientGPT onboarding agent; clinical scopes map to no agent this phase and are
  refused with `agent_unavailable`.
- The PatientGPT onboarding agent definition, authored for UAR v1.3.0 by the UAR
  expert, under `uar/agents/`.
- A lead-scoped handoff `docs/plan/uar-a2ui-catalog-request.md` asking UAR to
  admit `urn:patientgpt:a2ui:catalog:basic:v1` (decision 9). The operator files it.

## Capabilities

### New Capabilities
- `agui-protocol-bridge`: how UAR's AG-UI 1.0 stream is presented to shells as the PatientGPT subset.
- `uar-service-client`: connecting a host to a running UAR service by URL, authentication, and failure behaviour.
- `uar-agent-routing`: which UAR agent serves which conversation scope, and refusal where none is assigned.

### Modified Capabilities
- (none)

## Impact

- `crates/patient-gpt-uar` (bridge, service client, routing), `crates/patient-gpt-server/src/main.rs`
  (service mode boot), `crates/patient-gpt-host/src/error.rs` (new `HostError`
  variant for `agent_unavailable`), the three transport error mappings
  (`crates/patient-gpt-server/src/error.rs`, `desktop/src-tauri/src/error.rs`, the FFI
  error conversion), `crates/patient-gpt-domain` (the shared service-URL rule, reused
  by `local-onboarding`), new `uar/agents/onboarding/` definition files, two docs under `docs/plan/`.
- New dependency for SSE client parsing if `reqwest` streaming is insufficient; pins listed for the operator.
- Prerequisites: a local UAR service built from tag v1.3.0 on its pinned toolchain,
  a PAT for it, and a model provider for UAR usable with synthetic data only.
