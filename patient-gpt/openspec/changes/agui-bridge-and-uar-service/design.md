# Design

## Context

UAR v1.3.0 documents `POST /api/uar/ag-ui/agents/{agent_id}` as authenticated,
taking AG-UI 1.0 input and returning SSE (`docs/AGUI_V1.md:3`), with personal
access tokens exchanged for short-lived JWTs (`docs/API_KEYS.md:3`). In-process
consumers must synthesize `TEXT_MESSAGE_START`/`END`; only UAR's server loop emits
them (`src/server.rs:7063-7125`, read from `origin/main`; re-checked at the tag by
`uar-embedding-spike` task 1.1). No Rust AG-UI crate is adopted (D-008).

## Goals / Non-Goals

**Goals:** one bridge used by the service client and the embedded runtime; a
service client with explicit auth and failure codes; one routing table.

**Non-Goals:** moving the web to `@ag-ui/core` 1.x (blocked by a2ui-react's peer
range); rendering tool calls, interrupts or A2UI surfaces from UAR (refused as
`unsupported_event` this phase); clinical UAR agents.

## Decisions

1. **Bridge in `patient-gpt-uar`.** It already owns the facade adapters; the host
   keeps naming no runtime. Input is UAR's event JSON, not a typed UAR crate type,
   so the service path builds without linking UAR.
2. **Refuse, do not drop.** Tool calls and interrupts change the conversation's
   meaning; dropping them would show a partial run as complete. Informational
   step events are ignored with a log line.
3. **Token exchange in the client.** The PAT comes from `PATIENTGPT_UAR_TOKEN`;
   the client exchanges it per UAR's documented flow and refreshes on expiry. The
   exact exchange endpoint is read from UAR v1.3.0 `docs/API_KEYS.md` in task 2.1.
   The token is a secret: never logged, never sent to shells.
4. **Routing table is data.** A constant map `ScopeKind → Option<AgentId>` in
   `patient-gpt-uar`; this phase maps only `onboarding`. Adding a clinical agent is
   a later change with its own BAA-covered driver decision (D-016 decision 14).
5. **Connect timeout** is a named constant (10 s); no automatic retry — a retried
   run could duplicate a UAR thread turn.
6. **Agent definition format** follows UAR v1.3.0's documented agent installation
   path, established by the UAR expert in task 3.1 from the tag's docs, not from
   `origin/main`.

## Risks / Trade-offs

- [UAR's agent installation flow is complex (AgentDefinition, DeploymentBinding)]
  → task 3.1 records the exact steps; if the onboarding agent cannot be installed
  on a local service, UAR-1 is BLOCKED.
- [UAR needs a model provider to answer] → the provider is configured on the UAR
  side with synthetic data only; if none is available, UAR-1 is BLOCKED.
- [Upstream AG-UI drift] → protocol version check fails closed.
