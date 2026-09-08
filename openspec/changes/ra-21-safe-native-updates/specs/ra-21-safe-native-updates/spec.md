## Purpose

Specify the observable contract for this runtime capability: update paired native host/frontend bundles safely. These requirements preserve verified scope and honest delivery evidence across the application.

## ADDED Requirements

### Requirement: Update paired native host/frontend bundles safely — outcome 1

The system SHALL satisfy the following outcome: Activation waits for explicit resolution; relaunch revalidates session/schema and resumes coherently.

#### Scenario: A native update arrives with dirty work or an unresolved command

- **WHEN** A native update arrives with dirty work or an unresolved command
- **THEN** Activation waits for explicit resolution; relaunch revalidates session/schema and resumes coherently.

### Requirement: Update paired native host/frontend bundles safely — outcome 2

The system SHALL satisfy the following outcome: The update/rollback is refused with an actionable state; current authorized data is not silently corrupted.

#### Scenario: A bundle is unsigned, host/frontend incompatible or rollback cannot read the data

- **WHEN** A bundle is unsigned, host/frontend incompatible or rollback cannot read the data
- **THEN** The update/rollback is refused with an actionable state; current authorized data is not silently corrupted.

### Requirement: Update paired native host/frontend bundles safely — outcome 3

The system SHALL satisfy the following outcome: Recovery and local locking survive restart; the previous identity cannot be passively restored.

#### Scenario: The application restarts during migration or with logoutPending set

- **WHEN** the application restarts during migration or with logoutPending set
- **THEN** Recovery and local locking survive restart; the previous identity cannot be passively restored.
