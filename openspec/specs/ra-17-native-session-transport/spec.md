# ra-17-native-session-transport Specification

## Purpose
Specify the observable contract for this runtime capability: own native credentials and verified commands in the tauri host. These requirements preserve verified scope and honest delivery evidence across the application.

## Requirements

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

### Requirement: Native clinical operation parity is explicit and complete

The system SHALL expose `gate_state`, `affirm_gate`, `remove_gate`, `lookup_gate_command`,
`signing_target`, `sign_letter`, `lookup_sign_letter_command`, `reassess_evidence`,
`lookup_reassessment_command`, `save_annotation` and `lookup_annotation_command` through constrained
Tauri IPC. Every command SHALL obtain credentials
from the host-owned native session and invoke the same shell-neutral service contract and independent
Gate, AppServices and Postgres authority checks used by HTTP.

#### Scenario: Every native clinical operation is invoked with verified scope

- **WHEN** an authorized synthetic native session invokes each named command through local Tauri IPC
- **THEN** each operation derives current identity and practice authority from the host-owned credential, returns the matching HTTP-domain outcome, and mutation lookups reconcile the authoritative command ledger.

#### Scenario: Renderer hints attempt to confer native authority

- **WHEN** each named command is attempted with a renderer actor, foreign-practice authority, stale epoch or unauthorized window claim
- **THEN** the host rejects the attempt, policy denial remains distinct from authentication/provider unavailability, and no renderer value grants signing, affirmation, reassessment or annotation authority.
