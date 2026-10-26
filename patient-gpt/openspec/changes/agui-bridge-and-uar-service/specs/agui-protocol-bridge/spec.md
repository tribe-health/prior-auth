# Spec Delta

## Purpose

Presents UAR's AG-UI 1.0 event stream to every PatientGPT shell as the existing
six-event subset, without losing errors or inventing content.

## ADDED Requirements

### Requirement: UAR runs reach shells as the subset
Events from a UAR run SHALL be delivered to shells only as `RUN_STARTED`,
`TEXT_MESSAGE_START`, `TEXT_MESSAGE_CONTENT`, `TEXT_MESSAGE_END`, `RUN_FINISHED`
and `RUN_ERROR`, preserving run id, thread id, message id and text deltas.

#### Scenario: Text run through the bridge
- **WHEN** UAR streams a run that produces one assistant message
- **THEN** the shell receives `RUN_STARTED`, `TEXT_MESSAGE_START`, at least one `TEXT_MESSAGE_CONTENT`, `TEXT_MESSAGE_END` and `RUN_FINISHED` with UAR's ids

### Requirement: Message boundaries are always present
When UAR emits text content without a preceding start or following end for that
message, the bridge SHALL emit the missing `TEXT_MESSAGE_START` before the first
content and `TEXT_MESSAGE_END` before the run's terminal event.

#### Scenario: Content without start
- **WHEN** UAR's in-process stream delivers `TEXT_MESSAGE_CONTENT` for a message id with no prior start
- **THEN** the shell receives `TEXT_MESSAGE_START` for that id before the content

### Requirement: Unsupported events are surfaced, not dropped
An event type outside the subset that would change what the user sees
(interrupts, state snapshots or deltas carrying A2UI surfaces) SHALL end the run
with `RUN_ERROR` code `unsupported_event` naming the type. Tool-call, reasoning and
step events SHALL be logged and not forwarded: whether a tool may run is decided
by the host's admission port, not by the bridge.

#### Scenario: Interrupt from UAR
- **WHEN** UAR ends a segment with `RUN_FINISHED` carrying an interrupt outcome
- **THEN** the shell receives `RUN_ERROR` with code `unsupported_event` instead of a silent finish

### Requirement: Protocol version is checked
The bridge SHALL accept a service stream only when its `RUN_STARTED` declares
`protocolVersion` `1.0`, and an in-process stream only when its `RUN_STARTED`
declares `profile` `uar.agui/1` (UAR v1.3.0's in-process adapter sends no
`protocolVersion`). Anything else SHALL end the run with `protocol_mismatch`.

#### Scenario: Unexpected version
- **WHEN** a UAR service answers with a protocol version other than `1.0`
- **THEN** the run ends with `RUN_ERROR` code `protocol_mismatch` before any text is shown

#### Scenario: In-process stream accepted by profile
- **WHEN** an embedded run's `RUN_STARTED` carries `profile` `uar.agui/1` and no `protocolVersion`
- **THEN** the bridge accepts the stream
