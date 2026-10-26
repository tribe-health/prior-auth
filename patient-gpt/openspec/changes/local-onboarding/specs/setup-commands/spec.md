# Spec Delta

## Purpose

Defines the trusted host commands that carry out a user-confirmed setup proposal
and the device settings they write.

## ADDED Requirements

### Requirement: Applying a proposal executes its stored steps
`apply_setup_proposal` SHALL take only a proposal id, SHALL execute the steps the
host stored for that id in order, and SHALL stream `SetupProgressEvent`s (proposal
id, step index, step kind, state `running`, `done` or `failed`, and a code on
failure); a `prepare_models` step's events SHALL also carry the same
`ModelOperationEvent` that `prepare_models` streams.

#### Scenario: Confirm a model step
- **WHEN** the user confirms a stored proposal with one `prepare_models` step
- **THEN** the named model downloads with progress and ends `ready`, and the proposal is marked applied

### Requirement: Proposal content cannot be supplied by the caller
The setup commands SHALL NOT accept step content from the caller. An unknown,
already applied or declined proposal id SHALL be refused with `invalid_input`.

#### Scenario: Replayed confirmation
- **WHEN** `apply_setup_proposal` is called twice with the same id
- **THEN** the second call is refused with `invalid_input` and nothing runs again

### Requirement: The UAR endpoint is recorded, not connected
A `set_uar_endpoint` step SHALL validate the URL by the `uar-service-client` URL
rule, SHALL store it as the device's `uarEndpointUrl` setting, and SHALL NOT open a
connection to it or change the running UAR mode.

#### Scenario: Valid endpoint recorded
- **WHEN** the user confirms a proposal setting `http://127.0.0.1:<port>` where a local listener logs connections
- **THEN** `get_settings` returns that URL and the listener logs no connection

#### Scenario: Endpoint with credentials
- **WHEN** a proposal sets `https://user:pass@uar.example.test`
- **THEN** the proposal fails validation and is shown without a Confirm control

### Requirement: Setup commands exist on every transport
`apply_setup_proposal`, `decline_setup_proposal` and `get_settings` SHALL exist on
Axum, Tauri and FFI with the same names, DTOs and codes. On the Axum cloud host they
SHALL be refused with `host_unsupported`.

#### Scenario: Cloud host settings
- **WHEN** the web shell calls `get_settings` against the Axum server
- **THEN** it receives HTTP 503 with code `host_unsupported`
