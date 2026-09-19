# ra-09-pem-delivery-gate Specification

## Purpose
Specify the observable contract for this runtime capability: prove and adopt the actual pem package artifact. These requirements preserve verified scope and honest delivery evidence across the application.

## Requirements

### Requirement: Prove and adopt the actual PEM package artifact — outcome 1

The system SHALL satisfy the following outcome: Scoped lifecycle and committed projection tests run through installed public exports, with source and artifact provenance recorded.

#### Scenario: Candidate packages are consumed by the isolated acceptance checkout

- **WHEN** candidate packages are consumed by the isolated acceptance checkout
- **THEN** Scoped lifecycle and committed projection tests run through installed public exports, with source and artifact provenance recorded.

### Requirement: Prove and adopt the actual PEM package artifact — outcome 2

The system SHALL satisfy the following outcome: Adoption stays Blocked; a candidate result is not reported as delivery in the original 4.0.0 installation.

#### Scenario: No authorized pin change or matching published/approved artifact exists

- **WHEN** no authorized pin change or matching published/approved artifact exists
- **THEN** Adoption stays Blocked; a candidate result is not reported as delivery in the original 4.0.0 installation.

### Requirement: Prove and adopt the actual PEM package artifact — outcome 3

The system SHALL satisfy the following outcome: Pin authority, manifests, lockfile, installed versions and package identity agree; no overwritten 4.0.0, silent workspace alias or duplicate core singleton remains.

#### Scenario: An authorized real release is adopted

- **WHEN** an authorized real release is adopted
- **THEN** Pin authority, manifests, lockfile, installed versions and package identity agree; no overwritten 4.0.0, silent workspace alias or duplicate core singleton remains.
