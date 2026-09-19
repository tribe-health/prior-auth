# case-publication-ui Specification

## Purpose
Defines the observable behavior required for case queue and intake are live in the web-first case-to-letter workflow.

## Requirements

### Requirement: Case queue and intake are live
The system SHALL satisfy this capability under verified tenant scope while preserving clinical authority, citation, privacy, and no-query-cache invariants.

#### Scenario: Required behavior
- **WHEN** a committed case summary changes or the viewport resizes
- **THEN** the scoped queue and intake views rejoin the approved PEM record without leaking tenant or transient view state

#### Scenario: Scope or authority refusal
- **WHEN** the caller is unauthenticated, foreign to the practice, stale, or lacks the capability required by this operation
- **THEN** the system refuses the operation without publishing protected data or committing a partial effect

#### Scenario: Exact case summary publication
- **WHEN** the authorized cases shape reaches the current projection revision
- **THEN** the browser materializes only the approved twelve-column case summary into the practice-scoped `Case` records and ordered `replica:cases` list
- **AND** member, facility, procedure, plan, arbitrary case data, clinical actor identity, and command revision fields remain outside that replica row

#### Scenario: Mounted browser case workflow
- **WHEN** an authenticated operator opens the root case route, a case dashboard, or case intake
- **THEN** the protected browser router mounts the queue, detail, or intake component inside the session-scoped graph provider
- **AND** create, update, read, command lookup, and status transition use the verified HTTP case routes rather than a local database write

#### Scenario: Committed command confirmation
- **WHEN** a create or update command returns a receipt
- **THEN** the browser retains command ownership until the committed summary reaches the captured revision and an authorized detail read matches every submitted intake field
- **AND** an uncertain response is reconciled using the command ID and the revision, target status, and fingerprints captured before submission
- **AND** no optimistic case row is written to PEM or PGlite

#### Scenario: Isolated responsive interaction state
- **WHEN** two queue views are mounted or one intake form resizes between mobile and desktop widths
- **THEN** each queue keeps independent identity/session/practice/epoch/view-scoped filters and selection
- **AND** the intake form retains one labeled semantic DOM and its entered values across resize

#### Scenario: Clinical materializer storage refusal
- **WHEN** persistent browser storage and the experimental clinical materializer are both configured
- **THEN** startup refuses the unsupported combination before PGlite opens
- **AND** the runtime does not silently change the requested storage mode
