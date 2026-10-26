# Spec Delta

## Purpose

Defines what a user observes from a run on the local lane: one streamed reply
from the on-device chat model, produced without tools, chart access or network
egress of the conversation.

## ADDED Requirements

### Requirement: A local run is a single turn
A `local` run SHALL send the on-device model the onboarding system prompt, at most
the last eight onboarding turns of that conversation held in memory for the app
session, and the user message, and SHALL produce exactly one assistant message. The model SHALL NOT call tools, receive tool
results or start a second step.

#### Scenario: One message produces one reply
- **WHEN** a user sends one onboarding message on the `local` lane
- **THEN** the stream contains exactly one `TEXT_MESSAGE_START` / `TEXT_MESSAGE_END` pair for the assistant, followed by `RUN_FINISHED`

### Requirement: Local replies stream as the AG-UI subset
A local run SHALL emit, in order, `RUN_STARTED`, `TEXT_MESSAGE_START`, one or more
`TEXT_MESSAGE_CONTENT` events carrying generated text as it is produced, then
`TEXT_MESSAGE_END` and `RUN_FINISHED`, using the existing subset event shapes.

#### Scenario: Deltas arrive before the reply completes
- **WHEN** the local model generates a reply of more than one token
- **THEN** at least two `TEXT_MESSAGE_CONTENT` events are delivered to the shell before `TEXT_MESSAGE_END`

### Requirement: Engine and model absence is reported, not hidden
If no local engine is registered on the device, the host SHALL refuse the run with
`engine_unavailable`; if the selected chat model is not installed and verified, it
SHALL refuse with `model_not_installed`. A failure after `RUN_STARTED` SHALL end
the stream with `RUN_ERROR` carrying the code.

#### Scenario: Model not yet downloaded
- **WHEN** a user sends an onboarding message before any chat model is installed
- **THEN** the run is refused with `model_not_installed` and the shell shows that the chat model is not installed

#### Scenario: Engine fails mid-reply
- **WHEN** the engine returns an error after streaming has started
- **THEN** the stream ends with `RUN_ERROR` whose `code` is `runtime_failed` and no `RUN_FINISHED` follows

### Requirement: Local conversation content stays on the device
Text sent to or produced by the local lane, and anything derived from it, SHALL be
classified `local`. The host SHALL NOT transmit it to any network endpoint.

#### Scenario: No network egress during a local run
- **WHEN** a local onboarding run completes on desktop with network access available
- **THEN** the app opens no outbound network connection between `RUN_STARTED` and `RUN_FINISHED`

### Requirement: A run can be cancelled from every shell
`cancel_operation` SHALL take the run id the host emitted in `RUN_STARTED` and stop
that run on every transport. A `local` run's stream SHALL end with `RUN_ERROR`
code `cancelled` and the engine SHALL be free for the next run. A `uar` run SHALL
stop being forwarded and end with `cancelled`; no UAR-side cancel is sent this
phase. Cancelling an unknown or finished operation SHALL be refused with `not_found`.

#### Scenario: Cancel from the Tauri window
- **WHEN** the user leaves an onboarding conversation while a local reply is streaming
- **THEN** the shell calls `cancel_operation`, the stream ends with `RUN_ERROR` code `cancelled`, and a new onboarding run starts streaming without waiting for the old reply's token limit

### Requirement: Setup proposals reach the shell as one custom event
When the host has validated a setup proposal in a local reply, it SHALL emit one
AG-UI `CUSTOM` event named `patientgpt.setup_proposal` after `TEXT_MESSAGE_END`
and before `RUN_FINISHED`, carrying the proposal id, its state and its steps in
plain words, or a notice that the proposal could not be used.

#### Scenario: Proposal event order
- **WHEN** a local reply carries a valid proposal
- **THEN** the shell receives `TEXT_MESSAGE_END`, then the `patientgpt.setup_proposal` event with a proposal id, then `RUN_FINISHED`
