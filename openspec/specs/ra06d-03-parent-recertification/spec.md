# ra06d-03-parent-recertification Specification

## Purpose
Define parent RA06 recertification and the boundary between completed revocation controls and open
downstream runtime work.

## Requirements

### Requirement: Parent Tier 2 begins after child implementation closes

The system SHALL archive every child implementation change before freezing the final candidate,
then validate that candidate before and after running the complete parent Tier 2 command set
locally, and SHALL retain each command's raw observed output.

#### Scenario: Tier 2 evidence predates the implementation boundary

- **WHEN** a receipt or command result was produced before all child implementation changes were archived
- **THEN** it is preserved as stale or premature evidence and cannot certify the child or parent.

#### Scenario: Parent Tier 2 is executed

- **WHEN** the final candidate validates after the implementation boundary
- **THEN** the 12-role local campaign runs once against that source, its T0/T1 roles supply the parent Tier 2 commands, and every result is recorded with the four-word result vocabulary.

### Requirement: Parent review contains the complete source and evidence closure

The system SHALL review tracked and non-ignored untracked source, dependency edges, corrected
contracts, candidate evidence and parent Tier 2 logs together.

#### Scenario: The corrected RA06 scope passes review

- **WHEN** parent c1–c7 refinement passes and isolated adversarial review reports no critical finding
- **THEN** RA06 task 3.1 may complete while RA11c materialization and RA17 native parity remain explicit unchecked obligations.

#### Scenario: A parent requirement or packet input is absent

- **WHEN** candidate validation, a Tier 2 result, a corrected RA06 control, source input or review artifact is missing or failed
- **THEN** RA06 remains Blocked and the child handoff identifies the unsatisfied item without advancing RA07.
