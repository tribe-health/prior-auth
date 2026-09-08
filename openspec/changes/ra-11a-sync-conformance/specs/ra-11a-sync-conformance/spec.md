## Purpose

Specify the observable contract for this runtime capability: prove the selected sql materializer and commit contract. These requirements preserve verified scope and honest delivery evidence across the application.

## ADDED Requirements

### Requirement: Prove the selected SQL materializer and commit contract — outcome 1

The system SHALL satisfy the following outcome: The candidate preserves its transaction boundary and exposes a verifiable committed-data boundary before graph publication; fabricated offsets or independent uncoordinated snapshots fail.

#### Scenario: A related multi-table source transaction crosses the real authorized facade

- **WHEN** A related multi-table source transaction crosses the real authorized facade
- **THEN** The candidate preserves its transaction boundary and exposes a verifiable committed-data boundary before graph publication; fabricated offsets or independent uncoordinated snapshots fail.

### Requirement: Prove the selected SQL materializer and commit contract — outcome 2

The system SHALL satisfy the following outcome: No rows are skipped, replay is idempotent and obsolete refetch rows are removed coherently.

#### Scenario: The test process stops around a checkpoint/data commit and restarts with the same isolated durable synthetic store

- **WHEN** the test process stops around a checkpoint/data commit and restarts with the same isolated durable synthetic store
- **THEN** No rows are skipped, replay is idempotent and obsolete refetch rows are removed coherently.

### Requirement: Prove the selected SQL materializer and commit contract — outcome 3

The system SHALL satisfy the following outcome: Record Blocked and a concrete capability gap; no production adoption proceeds on documentation claims alone.

#### Scenario: The selected artifact lacks the required hook, compatibility or memory budget

- **WHEN** the selected artifact lacks the required hook, compatibility or memory budget
- **THEN** Record Blocked and a concrete capability gap; no production adoption proceeds on documentation claims alone.
