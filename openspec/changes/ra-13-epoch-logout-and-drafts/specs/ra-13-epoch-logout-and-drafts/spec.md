## Purpose

Specify the observable contract for this runtime capability: fence scope changes and failed logout across tabs and reloads. These requirements preserve verified scope and honest delivery evidence across the application.

## ADDED Requirements

### Requirement: Fence scope changes and failed logout across tabs and reloads — outcome 1

The system SHALL satisfy the following outcome: Old work cannot publish, save into or execute in the new scope; protected content locks immediately and Quiescing completes deterministically.

#### Scenario: Account/practice changes during hydration, catch-up, persistence or an attachment request

- **WHEN** account/practice changes during hydration, catch-up, persistence or an attachment request
- **THEN** Old work cannot publish, save into or execute in the new scope; protected content locks immediately and Quiescing completes deterministically.

### Requirement: Fence scope changes and failed logout across tabs and reloads — outcome 2

The system SHALL satisfy the following outcome: The durable marker blocks passive cookie reentry; only confirmed revocation or explicit fresh login can resolve it; marker-storage failure is honestly reported.

#### Scenario: Logout fails offline, then the browser reloads or another tab opens

- **WHEN** logout fails offline, then the browser reloads or another tab opens
- **THEN** The durable marker blocks passive cookie reentry; only confirmed revocation or explicit fresh login can resolve it; marker-storage failure is honestly reported.

### Requirement: Fence scope changes and failed logout across tabs and reloads — outcome 3

The system SHALL satisfy the following outcome: Only the freshly authorized original user can recover permitted drafts; memory-only loss on emergency lock is explicit; offline access stays locked without a grant.

#### Scenario: A replica rebuild, revocation or unsupported migration intersects unsent work

- **WHEN** A replica rebuild, revocation or unsupported migration intersects unsent work
- **THEN** Only the freshly authorized original user can recover permitted drafts; memory-only loss on emergency lock is explicit; offline access stays locked without a grant.
