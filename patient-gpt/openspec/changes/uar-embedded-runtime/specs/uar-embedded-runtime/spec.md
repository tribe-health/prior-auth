# Spec Delta

## Purpose

Runs UAR inside the app process on iOS (and on desktop where the chosen topology
embeds it), with the on-device model allowed to drive only the onboarding agent.

## ADDED Requirements

### Requirement: Embedded UAR serves onboarding on the local driver
With UAR mode `embedded` and a `ready` chat model, a `uar` run in scope
`onboarding` SHALL execute in the embedded UAR runtime on the onboarding agent,
driven by the local chat model, and SHALL stream through the bridge.

#### Scenario: Embedded onboarding run on the Mac destination
- **WHEN** the iOS app running as "Designed for iPad" with mode `embedded` receives a `uar` onboarding run
- **THEN** UAR executes the onboarding agent, the local model produces the text, and the shell receives the subset events ending with `RUN_FINISHED`

### Requirement: The local driver drives no other agent
An embedded runtime whose only driver is local SHALL have only the onboarding
agent installed, and the host SHALL refuse a run of any other agent id with code
`driver_not_permitted` before calling UAR, so the model receives no input.

#### Scenario: Clinical agent on the local driver
- **WHEN** an embedded runtime with only the local driver is asked to run an agent other than the onboarding agent
- **THEN** the run is refused with `driver_not_permitted` and the local engine receives no input

### Requirement: UAR linked but not configured is UAR absent
With UAR linked and mode `none`, the app SHALL not start the embedded runtime;
`uar` runs SHALL be refused with `lane_unavailable` and `local` runs SHALL work.

#### Scenario: iOS with mode none
- **WHEN** the iOS app starts with mode `none` and a `local` onboarding run follows a refused `uar` run
- **THEN** the `uar` run is refused with `lane_unavailable` and the `local` run streams a reply

### Requirement: UAR's stored data is local and separate
UAR persistence and memory SHALL live under the app data directory, SHALL be
classified `local`, and UAR memory vectors SHALL never be compared with
PatientGPT embedder vectors.

#### Scenario: UAR store location
- **WHEN** an embedded onboarding run completes on iOS
- **THEN** UAR's persistence files exist only inside the app container's data directory

### Requirement: Android does not link UAR
The Android build SHALL NOT link UAR this phase, and Android boot SHALL accept only
UAR mode `none`.

#### Scenario: Android dependency graph
- **WHEN** the Android target's dependency tree is listed
- **THEN** UAR is absent from it, and the app's `uar` runs are refused with `lane_unavailable`

#### Scenario: Android started with another mode
- **WHEN** the Android app is built with `PATIENTGPT_UAR_MODE=deterministic`
- **THEN** boot fails with a message that Android accepts only `none` this phase
