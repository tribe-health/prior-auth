# Spec Delta

## Purpose

Defines the onboarding flow a practice user sees on desktop and mobile: preparing
the on-device assistant, talking to it, and confirming the setup steps it proposes.

## ADDED Requirements

### Requirement: First launch offers to prepare the on-device assistant
On desktop and mobile, when no chat model is `ready`, the app SHALL offer a
host-owned control to prepare the on-device assistant. Activating it SHALL run
`prepare_models` with the preflight defaults and SHALL show per-file progress.

#### Scenario: Fresh install on desktop
- **WHEN** a user opens the desktop app on a fresh data directory and activates the prepare control
- **THEN** the screen shows download progress for the chat model and the embedder, then that the assistant is ready

### Requirement: The onboarding lane follows the host's UAR mode
The onboarding screen SHALL open a conversation in scope `onboarding` and send each
message on the `uar` lane when `model_status` reports `uar` available, and on the
`local` lane otherwise (after a chat model is `ready`). On the web shell against the
Axum host in service mode, the screen SHALL send `uar` runs and offer no prepare
control.

#### Scenario: Ask the assistant with UAR absent
- **WHEN** a user types a question on the onboarding screen of a desktop app started with mode `none`
- **THEN** a `local` run starts in scope `onboarding` and the reply streams into the thread

#### Scenario: Ask the assistant with UAR configured
- **WHEN** the same question is typed on a shell whose UAR mode is `service`, `embedded` or the desktop topology's mode
- **THEN** a `uar` run starts in scope `onboarding` and the reply streams into the thread

### Requirement: A valid proposal is shown as a host-owned gate
When a local reply contains one valid `patientgpt-setup` block, the host SHALL
store the proposal and emit it as the `patientgpt.setup_proposal` event; the shell
SHALL render its steps in plain words with Confirm and Decline controls drawn by
the app. Proposals are parsed only on the `local` lane this phase.

#### Scenario: Model proposes the embedder
- **WHEN** a reply contains a valid proposal with one `prepare_models` step for the embedder
- **THEN** the thread shows the step in words with Confirm and Decline, and nothing is downloaded yet

### Requirement: The raw setup block is never displayed
The host SHALL withhold streamed text from the opening ` ```patientgpt-setup `
marker through its closing fence, holding back any trailing partial marker split
across deltas, so no part of the block reaches the shell as reply text.

#### Scenario: Marker split across deltas
- **WHEN** the model emits the opening marker split over two `TEXT_MESSAGE_CONTENT` deltas
- **THEN** the thread never shows any part of the marker or the JSON, and the reply text before the block is shown in full

### Requirement: Declining or ignoring a proposal changes nothing
Declining a proposal, leaving it unanswered or closing the app SHALL execute no
step. A proposal SHALL be confirmable at most once.

#### Scenario: Decline
- **WHEN** the user declines a proposal
- **THEN** no download starts, settings are unchanged, and the gate shows that the proposal was declined

### Requirement: An invalid proposal has no control
A reply whose setup block fails validation (malformed JSON, unknown version, unknown
step kind, catalog id not on this platform, rejected URL, or more than one block)
SHALL be shown as plain reply text with a notice that the proposal could not be
used, and SHALL have no Confirm control.

#### Scenario: Unknown catalog id
- **WHEN** a reply proposes `prepare_models` with a catalog id not in this platform's catalog
- **THEN** the thread shows the reply with a notice that the proposal could not be used and no Confirm control

### Requirement: Onboarding never touches clinical records
The onboarding conversation SHALL have no access to patients, cases or documents,
and no onboarding step SHALL read or write a clinical record.

#### Scenario: Clinical question in onboarding
- **WHEN** a user asks the onboarding assistant about a patient
- **THEN** the run sends the model no patient data and no step can reference a patient
