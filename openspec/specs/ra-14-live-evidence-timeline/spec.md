# ra-14-live-evidence-timeline Specification

## Purpose
Specify the observable contract for this runtime capability: render the first authorized persisted row through graph selectors. These requirements preserve verified scope and honest delivery evidence across the application.

## Requirements

### Requirement: Render the first authorized persisted row through graph selectors — outcome 1

The system SHALL satisfy the following outcome: The existing timeline and a second subscriber update from the same graph, with no reload or copied clinical React state; SQL/graph/network/rendered values agree.

#### Scenario: A synthetic Postgres row is inserted then updated/deleted through the authorized source

- **WHEN** A synthetic Postgres row is inserted then updated/deleted through the authorized source
- **THEN** The existing timeline and a second subscriber update from the same graph, with no reload or copied clinical React state; SQL/graph/network/rendered values agree.

### Requirement: Render the first authorized persisted row through graph selectors — outcome 2

The system SHALL satisfy the following outcome: They are denied and excluded fields never arrive; all three reference state identities remain distinct.

#### Scenario: Wrong-practice or broadened-column requests are attempted, including continuation

- **WHEN** wrong-practice or broadened-column requests are attempted, including continuation
- **THEN** They are denied and excluded fields never arrive; all three reference state identities remain distinct.

### Requirement: Render the first authorized persisted row through graph selectors — outcome 3

The system SHALL satisfy the following outcome: Public routes remain usable, old protected state disappears immediately, per-view state survives ordinary resize, and no protected document-transition snapshot remains.

#### Scenario: The browser exercises logged-out start, account change, reduced motion and resize

- **WHEN** the browser exercises logged-out start, account change, reduced motion and resize
- **THEN** Public routes remain usable, old protected state disappears immediately, per-view state survives ordinary resize, and no protected document-transition snapshot remains.
