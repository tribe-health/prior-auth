## Purpose

Specify the observable contract for this runtime capability: own database opening, migrations and leader handover. These requirements preserve verified scope and honest delivery evidence across the application.

## ADDED Requirements

### Requirement: Own database opening, migrations and leader handover — outcome 1

The system SHALL satisfy the following outcome: Exactly one replacement owner opens/writes the database, with no stale owner resuming after handover.

#### Scenario: Two tabs open the same approved replica and one owner closes

- **WHEN** two tabs open the same approved replica and one owner closes
- **THEN** Exactly one replacement owner opens/writes the database, with no stale owner resuming after handover.

### Requirement: Own database opening, migrations and leader handover — outcome 2

The system SHALL satisfy the following outcome: Migration occurs under exclusive ownership or returns RecoveryRequired; incompatible old writers are fenced and the current generation is not partially mutated.

#### Scenario: A new generation, checksum drift or unsupported newer schema is encountered

- **WHEN** A new generation, checksum drift or unsupported newer schema is encountered
- **THEN** Migration occurs under exclusive ownership or returns RecoveryRequired; incompatible old writers are fenced and the current generation is not partially mutated.

### Requirement: Own database opening, migrations and leader handover — outcome 3

The system SHALL satisfy the following outcome: The old namespace closes or remains quarantined; the new identity never receives its handle/data.

#### Scenario: Identity changes during opening or migration

- **WHEN** identity changes during opening or migration
- **THEN** The old namespace closes or remains quarantined; the new identity never receives its handle/data.
