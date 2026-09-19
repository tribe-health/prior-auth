# ra06d-02-refreeze-and-replay Specification

## Purpose

Define candidate immutability and evidence closure after the RA06 contract repair.

## Requirements

### Requirement: Corrected RA06 evidence tooling produces one immutable candidate

The system SHALL provide freeze tooling that binds exact source, effective configuration, build,
fixture and runtime artifact identity before acceptance execution, and replay tooling that requires
every receipt to name the resulting digest.

#### Scenario: A candidate input changes after freeze

- **WHEN** source, contract, verification code, effective configuration or a prebuilt artifact differs before or after a campaign command
- **THEN** candidate validation fails and no downstream receipt or parent completion claim may use that digest.

### Requirement: The complete local campaign executes only at the child phase boundary

The system SHALL defer all 12 required receipt roles until the implementation changes are archived,
then regenerate them locally once under `ra06d-03-parent-recertification` and close them in a
content-hashed evidence index before candidate review.

#### Scenario: A campaign starts before implementation closes

- **WHEN** any Tier 2 or full-integration receipt is produced before the implementation changes are archived
- **THEN** that receipt set is premature, is preserved for audit, and cannot certify the child or parent phase.

#### Scenario: A receipt, prerequisite or transitive harness input is absent

- **WHEN** the evidence index or complete packet lacks any required role, log, output, configuration identity or dynamically loaded harness dependency
- **THEN** deterministic validation fails and the candidate cannot be reviewed as complete.

### Requirement: Revocation timing uses one outer monotonic deadline

The system SHALL measure from the conservative local trigger through correlated server terminal
observation and denial of a subsequent protected request on one monotonic 5,000 ms deadline.

#### Scenario: Either terminal observation or later denial exceeds the deadline

- **WHEN** the FRF terminal event or the subsequent protected refusal occurs after trigger plus 5,000 ms
- **THEN** the scenario is Failed even if the other observation completed earlier.
