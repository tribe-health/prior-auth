## Purpose

Define candidate-bound local evidence for the complete bounded-revocation contract.

## ADDED Requirements

### Requirement: Every receipt belongs to one exact candidate

The campaign SHALL identify source, locks, sanitized configuration, toolchains, fixtures and built
artifacts for prior-auth, flint-gate and flint-realtime-fabric before execution.

#### Scenario: A reviewer opens a result receipt

- **WHEN** a local command or integration log is used as completion evidence
- **THEN** it names the candidate digest and a later immutable index hashes its finalized contents.

### Requirement: The assembled campaign exercises every revocation boundary

The local campaign SHALL run application logout, direct Kratos revocation, membership change and
expiry against a nonempty FRF response and two Gate replicas, including cache/event failure modes.

#### Scenario: A required service or scenario is unavailable

- **WHEN** any prerequisite, second replica, body frame or failure injection is absent
- **THEN** the campaign fails visibly and cannot emit a passing completion result.

### Requirement: Shared UI fencing remains responsive and synchronous

The shared React session boundary SHALL hide protected content and mutation controls synchronously
for wide and compact layouts while retaining one command owner across resize.

#### Scenario: Access ends during a responsive command interaction

- **WHEN** logout, membership loss, expiry or an observed replica failure reaches Zustand
- **THEN** protected UI is fenced before motion, late callbacks cannot commit, and resizing does not remount or duplicate the command owner.

### Requirement: Parent certification uses the same candidate

The parent RA06 phase SHALL run T2 and renewed final review against the child candidate digest.

#### Scenario: Source, artifact or configuration changes after the child campaign

- **WHEN** any candidate input changes before parent completion
- **THEN** child and parent evidence are invalidated and the local campaign runs again before archive.
