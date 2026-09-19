## Purpose

Specify the observable contract for this runtime capability: own hydration, status, listeners and persistence per runtime. These requirements preserve verified scope and honest delivery evidence across the application.

## ADDED Requirements

### Requirement: Own hydration, status, listeners and persistence per runtime — outcome 1

The system SHALL satisfy the following outcome: Releasing A's operation causes no publication, action or write in B; disposal settles tracked work and closes A's namespace.

#### Scenario: Identity A hydration or a persistence save is delayed, then runtime B mounts

- **WHEN** identity A hydration or a persistence save is delayed, then runtime B mounts
- **THEN** Releasing A's operation causes no publication, action or write in B; disposal settles tracked work and closes A's namespace.

### Requirement: Own hydration, status, listeners and persistence per runtime — outcome 2

The system SHALL satisfy the following outcome: No later callback publishes, no listener leaks, and cleanup is safe when repeated.

#### Scenario: Dispose occurs during a timer, listener registration or queued graph flush

- **WHEN** dispose occurs during a timer, listener registration or queued graph flush
- **THEN** No later callback publishes, no listener leaks, and cleanup is safe when repeated.

### Requirement: Own hydration, status, listeners and persistence per runtime — outcome 3

The system SHALL satisfy the following outcome: Clinical replay is refused/disabled and hydration readiness is not reported as server catch-up.

#### Scenario: A stored queue contains a signing/affirmation action or hydration alone completes

- **WHEN** A stored queue contains a signing/affirmation action or hydration alone completes
- **THEN** Clinical replay is refused/disabled and hydration readiness is not reported as server catch-up.
