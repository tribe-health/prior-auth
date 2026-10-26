# Spec Delta

## Purpose

Defines how the macOS desktop app reaches UAR, whichever topology the operator
chooses, and how a UAR failure is kept from taking the local floor down with it.

## ADDED Requirements

### Requirement: The desktop UAR path works once configured
With UAR configured for desktop in the chosen topology and a driver available to
it (the local model under options a and c, UAR's own configured provider under
option b), a `uar` onboarding run from the Tauri window SHALL execute in UAR and
stream through the bridge as the subset events.

#### Scenario: Desktop UAR onboarding run
- **WHEN** a user starts a `uar` onboarding run in the Tauri window with UAR configured
- **THEN** UAR executes the onboarding agent and the thread shows a streamed reply ending with `RUN_FINISHED`

### Requirement: The local floor does not depend on UAR
The local lane SHALL run in the Tauri process. A UAR failure (runtime error,
sidecar exit or start failure) SHALL NOT stop `local` runs or close the window.

#### Scenario: UAR fails, local still answers
- **WHEN** UAR is made unavailable (sidecar killed, or runtime start failure under option a) and the user then starts a `local` onboarding run
- **THEN** the `local` run streams a reply and the window stays open

### Requirement: UAR failure is visible on the run
A `uar` run that cannot reach a working UAR SHALL end with `RUN_ERROR` code
`uar_unavailable` within the connect timeout.

#### Scenario: UAR down at run time
- **WHEN** a user starts a `uar` run while UAR is unavailable
- **THEN** the run ends with `RUN_ERROR` code `uar_unavailable` and the thread shows that the agent runtime is unavailable

### Requirement: The topology decision is recorded before code
The chosen option and the operator's words SHALL be recorded in the phase
decision log before any option-specific implementation begins.

#### Scenario: Decision present
- **WHEN** option-specific tasks are added to this change
- **THEN** the phase decision log holds the operator's verbatim decision 3 answer citing the spike report
