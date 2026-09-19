# ra-12-public-auth-startup Specification

## Purpose
Specify the observable contract for this runtime capability: mount real public authentication and explicit startup states. These requirements preserve verified scope and honest delivery evidence across the application.

## Requirements

### Requirement: Mount real public authentication and explicit startup states — outcome 1

The system SHALL satisfy the following outcome: Login/recovery remains usable with zero private DB opens/shape subscriptions; anonymous and unavailable render distinctly.

#### Scenario: The browser cold-starts logged out, or Kratos is unavailable

- **WHEN** the browser cold-starts logged out, or Kratos is unavailable
- **THEN** Login/recovery remains usable with zero private DB opens/shape subscriptions; anonymous and unavailable render distinctly.

### Requirement: Mount real public authentication and explicit startup states — outcome 2

The system SHALL satisfy the following outcome: Migration precedes hydration and required shape catch-up; Ready is never inferred from DB-open or snapshot hydration alone.

#### Scenario: A valid identity starts the application

- **WHEN** A valid identity starts the application
- **THEN** Migration precedes hydration and required shape catch-up; Ready is never inferred from DB-open or snapshot hydration alone.

### Requirement: Mount real public authentication and explicit startup states — outcome 3

The system SHALL satisfy the following outcome: The UI renders provider messages and renews only the correct flow; no token/CSRF secret is persisted into a business or interaction store.

#### Scenario: A flow has field errors, expires or completes recovery/login

- **WHEN** A flow has field errors, expires or completes recovery/login
- **THEN** The UI renders provider messages and renews only the correct flow; no token/CSRF secret is persisted into a business or interaction store.
