## Purpose

Specify the observable contract for this runtime capability: use verified context for signing and evidence reassessment. These requirements preserve verified scope and honest delivery evidence across the application.

## ADDED Requirements

### Requirement: Use verified context for signing and evidence reassessment — outcome 1

The system SHALL satisfy the following outcome: Signing is denied; request-body identity never grants authority and stale QA/signature revision cannot pass.

#### Scenario: A caller submits a forged surgeon actor or stale letter revision

- **WHEN** A caller submits a forged surgeon actor or stale letter revision
- **THEN** Signing is denied; request-body identity never grants authority and stale QA/signature revision cannot pass.

### Requirement: Use verified context for signing and evidence reassessment — outcome 2

The system SHALL satisfy the following outcome: The persisted command result resolves the outcome and a repeat creates no duplicate clinical effect; signing/affirmation never enter PEM replay.

#### Scenario: An authorized reassessment or signing command loses its response

- **WHEN** an authorized reassessment or signing command loses its response
- **THEN** The persisted command result resolves the outcome and a repeat creates no duplicate clinical effect; signing/affirmation never enter PEM replay.

### Requirement: Use verified context for signing and evidence reassessment — outcome 3

The system SHALL satisfy the following outcome: Each independent clinical control refuses; allowed evidence changes retain met/gap/void and an audit record.

#### Scenario: Administrator or agent directly reaches service/database signing paths

- **WHEN** administrator or agent directly reaches service/database signing paths
- **THEN** Each independent clinical control refuses; allowed evidence changes retain met/gap/void and an audit record.
