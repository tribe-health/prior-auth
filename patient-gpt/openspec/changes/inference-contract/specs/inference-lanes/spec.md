# Spec Delta

## Purpose

Makes the inference lane an explicit per-turn choice so that no run reaches a
model or runtime the caller did not name, and an absent provider is refused
loudly instead of silently replaced.

## ADDED Requirements

### Requirement: Every run names its lane
A run request SHALL carry a `lane` of exactly `local` or `uar`. The host SHALL
reject a request with no lane (code `lane_required`) or any other value (code
`unknown_lane`) before any event is emitted. Every transport SHALL pass the raw
wire value to one shared parser; no transport SHALL supply a default.

#### Scenario: Missing lane is rejected
- **WHEN** a client starts a run whose request has no `lane` field
- **THEN** the HTTP route answers 400 with code `lane_required`, and the Tauri command and FFI function return the same code
- **AND** no AG-UI event is emitted and no conversation record is written

#### Scenario: Unknown lane is rejected
- **WHEN** a client starts a run with `lane` set to `cloud`
- **THEN** every transport answers with code `unknown_lane` (HTTP 400) and emits no event

### Requirement: Local lane is limited to the onboarding scope
The host SHALL accept the `local` lane only for conversations whose scope kind is
`onboarding`. A `local` run in scope `all`, `patient` or `case` SHALL be refused
with code `lane_not_permitted` (HTTP 403) before any model is invoked.

#### Scenario: Local lane in a case conversation is refused
- **WHEN** a client starts a `local` run with scope `case:<patientId>:<caseId>`
- **THEN** the host answers `lane_not_permitted` and the local engine receives no input

#### Scenario: Local lane in onboarding is accepted
- **WHEN** a client starts a `local` run with scope `onboarding` and the local provider is wired
- **THEN** the host starts the run and emits `RUN_STARTED`

### Requirement: Onboarding is a conversation scope
The conversation scope SHALL accept kind `onboarding` with query-string form
`onboarding`. Onboarding conversations SHALL be listed only under that scope and
SHALL never be bound to a patient.

#### Scenario: Onboarding scope round-trips
- **WHEN** a client lists conversations with `scope=onboarding`
- **THEN** only onboarding conversations are returned, each with scope `{ "kind": "onboarding" }`

#### Scenario: Malformed onboarding scope is rejected
- **WHEN** a client lists conversations with `scope=onboarding:x`
- **THEN** the request is rejected as a malformed scope, never defaulted to `all`

### Requirement: A lane without a provider is refused
When the named lane has no provider on this host, the host SHALL refuse the run
with code `lane_unavailable` (HTTP 503) and SHALL NOT route the request to any
other lane, runtime or canned reply.

#### Scenario: Cloud host has no local lane
- **WHEN** the Axum server receives a `local` run in scope `onboarding`
- **THEN** it answers `lane_unavailable` and the deterministic runtime is not invoked

#### Scenario: UAR lane with no runtime configured
- **WHEN** a shell built with UAR linked but no provider configured receives a `uar` run
- **THEN** it answers `lane_unavailable`, and a following `local` onboarding run on the same shell still succeeds

### Requirement: "UAR absent" is an explicit mode
Each shell's UAR mode setting SHALL accept the value `none`, meaning no UAR
runtime is configured. It SHALL remain a required, explicit setting: an unset or
unknown mode SHALL stop startup with an error naming the accepted values.

#### Scenario: Desktop starts with UAR absent
- **WHEN** the desktop app starts with `PATIENTGPT_UAR_MODE=none`
- **THEN** it starts, `uar` runs are refused with `lane_unavailable`, and `local` onboarding runs are served

#### Scenario: Unset mode still fails
- **WHEN** the desktop app starts with `PATIENTGPT_UAR_MODE` unset
- **THEN** startup fails with a message listing `none`, `deterministic` and `service:<url>`

### Requirement: The three transports stay in parity
Every operation added by this capability SHALL exist on the Axum router, as a
Tauri command and as an FFI function with the same name, DTOs and error codes,
all calling the same `AppServices` method.

#### Scenario: Parity is checked from the contract table
- **WHEN** the operations listed in `docs/plan/scaffold-contracts.md` are compared with the router, the Tauri command list and the FFI API
- **THEN** each listed operation is present on all three with identical error codes
