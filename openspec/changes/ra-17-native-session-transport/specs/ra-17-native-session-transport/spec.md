## Purpose

Specify the observable contract for this runtime capability: own native credentials and verified commands in the tauri host. These requirements preserve verified scope and honest delivery evidence across the application.

## ADDED Requirements

### Requirement: Own native credentials and verified commands in the Tauri host — outcome 1

The system SHALL satisfy the following outcome: Opaque credentials stay in the approved host facility, the renderer receives sanitized state, and Gate/service/database checks remain independent.

#### Scenario: A native login/session is created and a protected command is invoked

- **WHEN** A native login/session is created and a protected command is invoked
- **THEN** Opaque credentials stay in the approved host facility, the renderer receives sanitized state, and Gate/service/database checks remain independent.

### Requirement: Own native credentials and verified commands in the Tauri host — outcome 2

The system SHALL satisfy the following outcome: The host rejects it; renderer hints cannot confer signing or practice authority.

#### Scenario: A renderer supplies an actor, stale epoch or unauthorized window request

- **WHEN** A renderer supplies an actor, stale epoch or unauthorized window request
- **THEN** The host rejects it; renderer hints cannot confer signing or practice authority.

### Requirement: Own native credentials and verified commands in the Tauri host — outcome 3

The system SHALL satisfy the following outcome: Both lock consistently; incomplete authentication is explicit and no token appears in URLs, Zustand, graph snapshots or logs.

#### Scenario: Two windows observe logout/account change or native SSO completion fails

- **WHEN** two windows observe logout/account change or native SSO completion fails
- **THEN** Both lock consistently; incomplete authentication is explicit and no token appears in URLs, Zustand, graph snapshots or logs.
