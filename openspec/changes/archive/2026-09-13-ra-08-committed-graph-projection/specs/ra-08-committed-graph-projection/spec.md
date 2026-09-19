## Purpose

Specify the observable contract for this runtime capability: publish committed replica batches atomically into pem. These requirements preserve verified scope and honest delivery evidence across the application.

## ADDED Requirements

### Requirement: Publish committed replica batches atomically into PEM — outcome 1

The system SHALL satisfy the following outcome: Subscribers observe a coherent old or new graph, never partial relationships; SQL commit precedes publication.

#### Scenario: One committed batch changes evidence, citations, documents and their lists

- **WHEN** one committed batch changes evidence, citations, documents and their lists
- **THEN** Subscribers observe a coherent old or new graph, never partial relationships; SQL commit precedes publication.

### Requirement: Publish committed replica batches atomically into PEM — outcome 2

The system SHALL satisfy the following outcome: All three valid identities remain distinct; a missing key is rejected instead of becoming undefined.

#### Scenario: Reference rows met, gap and void or a row without its declared key arrive

- **WHEN** reference rows met, gap and void or a row without its declared key arrive
- **THEN** All three valid identities remain distinct; a missing key is rejected instead of becoming undefined.

### Requirement: Publish committed replica batches atomically into PEM — outcome 3

The system SHALL satisfy the following outcome: Obsolete entities/list memberships disappear together; stale-generation batches cannot publish.

#### Scenario: Refetch replacement or authorization narrowing removes rows

- **WHEN** refetch replacement or authorization narrowing removes rows
- **THEN** Obsolete entities/list memberships disappear together; stale-generation batches cannot publish.
