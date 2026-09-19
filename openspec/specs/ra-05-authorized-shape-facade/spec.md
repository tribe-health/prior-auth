# ra-05-authorized-shape-facade Specification

## Purpose
Specify the observable contract for this runtime capability: serve electric snapshots and continuations through the authorized facade. These requirements preserve verified scope and honest delivery evidence across the application.

## Requirements

### Requirement: Serve Electric snapshots and continuations through the authorized facade — outcome 1

The system SHALL satisfy the following outcome: Initial and continued responses preserve Electric protocol semantics, contain only approved columns for the authorized practice, and carry the committed cases.gate_affirmed_at transition to null.

#### Scenario: A persisted synthetic clinical row is requested and its gate affirmation is later removed in another session

- **WHEN** A persisted synthetic clinical row is requested through Gate and FRF and its gate affirmation is later removed in another session
- **THEN** Initial and continued responses preserve Electric protocol semantics, contain only approved columns for the authorized practice, and carry the committed cases.gate_affirmed_at transition to null.

### Requirement: Serve Electric snapshots and continuations through the authorized facade — outcome 2

The system SHALL satisfy the following outcome: A real Gate-minted token verifies only for the configured issuer and audience; the facade denies every scope or handle mismatch and never exposes the other scope's rows or headers identifying its shape.

#### Scenario: A real Gate-minted token reaches FRF and a client changes scope or reuses another identity's handle

- **WHEN** a real Gate-minted token is presented to the FRF verifier and a client changes scope/projection or reuses another identity's handle on continuation/refetch
- **THEN** The configured token verifies only for the required issuer and audience; the facade denies every scope or handle mismatch and never exposes the other scope's rows or headers identifying its shape.

### Requirement: Serve Electric snapshots and continuations through the authorized facade — outcome 3

The system SHALL satisfy the following outcome: The certified topology denies the bypass; local diagnostic access is separately isolated and cannot be mistaken for the certified route.

#### Scenario: The client network attempts direct Electric access

- **WHEN** the client network attempts direct Electric access
- **THEN** The certified topology denies the bypass; local diagnostic access is separately isolated and cannot be mistaken for the certified route.
