## Purpose

Specify the observable contract for this runtime capability: apply authorized streams and publish committed graph batches. These requirements preserve verified scope and honest delivery evidence across the application.

## ADDED Requirements

### Requirement: Apply authorized streams and publish committed graph batches — outcome 1

The system SHALL satisfy the following outcome: SQL rows/checkpoints and graph entities/lists agree before readiness, including gate-summary updates and met/gap/void reference identities.

#### Scenario: The real authorized stream inserts, updates or deletes related records

- **WHEN** the real authorized stream inserts, updates or deletes related records
- **THEN** SQL rows/checkpoints and graph entities/lists agree before readiness, including gate-summary updates and met/gap/void reference identities.

### Requirement: Apply authorized streams and publish committed graph batches — outcome 2

The system SHALL satisfy the following outcome: Resume cannot skip data, replacement removes stale rows and no partial relationship batch is published.

#### Scenario: A crash, refetch or authorization narrowing interrupts the assembled runtime

- **WHEN** A crash, refetch or authorization narrowing interrupts the assembled runtime
- **THEN** Resume cannot skip data, replacement removes stale rows and no partial relationship batch is published.

### Requirement: Apply authorized streams and publish committed graph batches — outcome 3

The system SHALL satisfy the following outcome: Old-scope work drains or is fenced and cannot publish/write through the next runtime.

#### Scenario: The owner is revoked or disposed while materialization is in flight

- **WHEN** the owner is revoked or disposed while materialization is in flight
- **THEN** Old-scope work drains or is fenced and cannot publish/write through the next runtime.
