# ra-10-remove-transitive-query-cache Specification

## Purpose
Specify the observable contract for this runtime capability: remove the unused bridge that brings swr into the application. These requirements preserve verified scope and honest delivery evidence across the application.

## Requirements

### Requirement: Remove the unused bridge that brings SWR into the application — outcome 1

The system SHALL satisfy the following outcome: Resolved dependencies contain no SWR/TanStack Query/Apollo query-cache path and exact existing pins remain unchanged.

#### Scenario: The dependency cleanup is installed from the updated lockfile

- **WHEN** the dependency cleanup is installed from the updated lockfile
- **THEN** Resolved dependencies contain no SWR/TanStack Query/Apollo query-cache path and exact existing pins remain unchanged.

### Requirement: Remove the unused bridge that brings SWR into the application — outcome 2

The system SHALL satisfy the following outcome: Type/lint and relevant render tests pass; no active import points at the removed bridge.

#### Scenario: The current presentation components and timeline are checked

- **WHEN** the current presentation components and timeline are checked
- **THEN** Type/lint and relevant render tests pass; no active import points at the removed bridge.

### Requirement: Remove the unused bridge that brings SWR into the application — outcome 3

The system SHALL satisfy the following outcome: The dependency guard fails, proving it detects the assessment's manifest-only blind spot.

#### Scenario: A transitive forbidden query cache is deliberately introduced in a test fixture

- **WHEN** A transitive forbidden query cache is deliberately introduced in a test fixture
- **THEN** The dependency guard fails, proving it detects the assessment's manifest-only blind spot.
