## Purpose

Specify the observable contract for this runtime capability: coordinate compatible web code, schema and draft updates. These requirements preserve verified scope and honest delivery evidence across the application.

## ADDED Requirements

### Requirement: Coordinate compatible web code, schema and draft updates — outcome 1

The system SHALL satisfy the following outcome: The page does not force reload or lose work; command outcome is reconciled before activation.

#### Scenario: A compatible update arrives with dirty drafts or an unresolved clinical command

- **WHEN** A compatible update arrives with dirty drafts or an unresolved clinical command
- **THEN** The page does not force reload or lose work; command outcome is reconciled before activation.

### Requirement: Coordinate compatible web code, schema and draft updates — outcome 2

The system SHALL satisfy the following outcome: It is fenced or the upgrade waits; checksummed migration/generation handover cannot partially corrupt the active replica.

#### Scenario: An incompatible old tab resumes while schema migration begins

- **WHEN** an incompatible old tab resumes while schema migration begins
- **THEN** It is fenced or the upgrade waits; checksummed migration/generation handover cannot partially corrupt the active replica.

### Requirement: Coordinate compatible web code, schema and draft updates — outcome 3

The system SHALL satisfy the following outcome: RecoveryRequired distinguishes rebuildable rows from retained drafts; session and data are revalidated after recovery.

#### Scenario: Quota eviction, incompatible snapshot or migration failure occurs

- **WHEN** quota eviction, incompatible snapshot or migration failure occurs
- **THEN** RecoveryRequired distinguishes rebuildable rows from retained drafts; session and data are revalidated after recovery.
