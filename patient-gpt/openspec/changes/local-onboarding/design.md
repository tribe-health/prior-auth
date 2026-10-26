# Design

## Context

The local lane exists after `inference-contract` and the engine changes. The
frozen mirror has no setup writes (`docs/plan/scaffold-contracts.md:10-17`). The
prototype draws host-owned gates the agent can only pause for
(`docs/design/patient-chat/host-controls.js:1-5`); onboarding reuses that pattern.
`docs/design` has no onboarding screen and no model-progress component.

## Goals / Non-Goals

**Goals:** model-proposed, user-confirmed, host-executed setup; no write path from
model output to state without a confirmation carrying only an id; screens built
from the design system.

**Non-Goals:** connecting to the recorded UAR endpoint; setup proposals on the
`uar` lane (UAR replies are plain chat this phase); multi-step agent loops
(decision 8); background downloads.

## Decisions

1. **Fenced block, not tool calling.** A reply carries at most one
   ` ```patientgpt-setup ` block with JSON `{ "version": 1, "steps": [...] }`. The
   model never calls a tool (decision 8). Alternative: Qwen3 native tool-call
   format — rejected, it reintroduces a tool loop shape and the 0.6B model's
   reliability with it is unmeasured.
2. **The system prompt lists this device's catalog ids and device profile**, so
   the model proposes only ids the host will accept; the host still validates.
3. **Host-side proposal store.** Proposals are kept in the host keyed by a UUID v7
   with state `pending | applied | declined`; the webview or Dart side never sends
   step content back. Failure scenario this guards: a compromised webview turning a
   model-suggested download into an arbitrary write.
4. **Feasibility first.** Before any UI, run Qwen3-0.6B over 20 synthetic
   onboarding prompts through the production local lane and record how many
   replies carry a valid proposal and how many carry an invalid block. The operator
   decides from the numbers whether to proceed, default to 1.7B for onboarding, or
   change the approach; no threshold is assumed here.
5. **Design addition before UI.** design-expert and creative-director draft the
   onboarding screen and a model-progress row as additions to `docs/design`
   using existing tokens, components and the host-controls gate; the operator
   approves before react-engineer and flutter-engineer build.
6. **Settings record** `{ uarEndpointUrl: string | null, updatedAt }`, privacy
   `local`, one per device, in the desktop SurrealDB store and the mobile store.

7. **Two prompts from one source.** The host keeps a base onboarding prompt and adds
   proposal instructions only for the `local` lane. The UAR onboarding agent
   definition (`agui-bridge-and-uar-service` 3.1) embeds the base prompt; task 2.2
   here verifies the agent file's prompt text equals the base constant.
8. **Setup progress DTO.** `SetupProgressEvent` is added in task 2.1 and transported
   as `prepare_models` is: SSE, a Tauri channel, an FFI stream sink.

## Risks / Trade-offs

- [0.6B proposal reliability unknown] → task 1.2 measures it before UI work.
- [Design addition delays UI] → host commands and proposal handling proceed in
  parallel; only screens wait for approval.
- [Recorded URL unused this phase] → stated in the UI copy ("recorded for later
  setup") so the user is not told the device is connected.
