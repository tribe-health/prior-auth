## Purpose

Define durable, replayable authority changes for bounded session and membership revocation.

## ADDED Requirements

### Requirement: Authority changes are durable and ordered

The system SHALL commit a deployment-qualified monotonic authority event in the same PostgreSQL
transaction as a membership or capability revision. Event allocation SHALL be serialized through
commit so a replay cursor cannot advance past an uncommitted lower sequence.

#### Scenario: Authority transaction commits or rolls back

- **WHEN** a membership or capability change commits or rolls back
- **THEN** commit produces one replayable event with ASO incarnation and revision, while rollback produces neither revision nor event.

#### Scenario: Concurrent authority events commit out of requested order

- **WHEN** one authority transaction remains open while another attempts to append an event
- **THEN** the second event waits, and every visible higher sequence commits after every lower visible sequence.

### Requirement: Logout denial survives partial failure

The system SHALL persist a verified session denial and retry intent before asking Kratos to revoke
the session, and SHALL retain denial through original expiry plus skew.

#### Scenario: Logout crashes at any side-effect boundary

- **WHEN** logout crashes before denial commit, after denial commit, or after Kratos revocation
- **THEN** no premature success is reported, committed denial remains effective, and one leased recovery owner can confirm revocation idempotently.

#### Scenario: A stalled retry worker loses its lease

- **WHEN** a retry worker observes failure after its claim lease has expired
- **THEN** it cannot change retry scheduling, confirmation state or lease ownership for that denial.

### Requirement: Trusted external revocation observation is propagated

The system SHALL persist the same denial when a mounted protected path holding a previously
verified session identity observes that Kratos made the session inactive.

#### Scenario: Kratos administrator revokes an active session

- **WHEN** the real mounted protected path next validates that signed session identity
- **THEN** it cancels access from first server observation and commits a denial without accepting a caller-selected session ID.
