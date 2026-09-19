## Purpose

Specify the observable contract for this runtime capability: fence scope changes and failed logout across tabs and reloads. These requirements preserve verified scope and honest delivery evidence across the application.

## ADDED Requirements

### Requirement: Fence scope changes and failed logout across tabs and reloads — outcome 1

The system SHALL satisfy the following outcome: Old work cannot publish, save into or execute in the new scope; protected content locks immediately, foreground/resume performs authoritative revalidation before reopening access, and Quiescing completes deterministically.

#### Scenario: Account/practice changes during hydration, catch-up, persistence or an attachment request

- **WHEN** account/practice changes during hydration, catch-up, persistence or an attachment request, or a suspended client resumes
- **THEN** old work cannot publish, save into or execute in the new scope; protected content remains locked until authoritative revalidation establishes the current session/practice/authority revision, and Quiescing completes deterministically.

### Requirement: Fence scope changes and failed logout across tabs and reloads — outcome 2

The system SHALL satisfy the following outcome: The durable client marker blocks passive cookie reentry while the shell-neutral server logout coordinator owns ASO denial, retry leases and Kratos confirmation. Only a confirmed server result or explicit fresh login can resolve the marker; marker-storage failure is honestly reported.

#### Scenario: Logout fails offline, then the browser reloads or another tab opens

- **WHEN** logout fails offline, then the browser reloads or another tab opens
- **THEN** the durable marker blocks passive cookie reentry, an incomplete server result keeps the client locked while ASO recovery continues, and only confirmed revocation or explicit fresh login resolves the marker; the client never mutates the server denial/retry journal.

### Requirement: Fence scope changes and failed logout across tabs and reloads — outcome 3

The system SHALL satisfy the following outcome: Only the freshly authorized original user can recover permitted drafts; memory-only loss on emergency lock is explicit; offline access stays locked without a grant.

#### Scenario: A replica rebuild, revocation or unsupported migration intersects unsent work

- **WHEN** A replica rebuild, revocation or unsupported migration intersects unsent work
- **THEN** Only the freshly authorized original user can recover permitted drafts; memory-only loss on emergency lock is explicit; offline access stays locked without a grant.
