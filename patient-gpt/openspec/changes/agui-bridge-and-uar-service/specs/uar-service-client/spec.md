# Spec Delta

## Purpose

Lets a PatientGPT host run conversations on a UAR service reached by URL,
authenticated with an operator-supplied token, failing visibly when the service
cannot be used.

## ADDED Requirements

### Requirement: Service mode runs on a UAR service by URL
With `PATIENTGPT_UAR_MODE=service:<url>` and `PATIENTGPT_UAR_TOKEN` set, a `uar`
run SHALL be sent to that service's AG-UI endpoint for the routed agent and its
events SHALL stream to the shell through the bridge.

#### Scenario: Cloud host reaches a local UAR service
- **WHEN** the Axum server runs in service mode against a UAR v1.3.0 service on localhost and a web user starts a `uar` onboarding run
- **THEN** the browser receives streamed text produced by that UAR service and `RUN_FINISHED`

### Requirement: Service mode requires a token at startup
A host started in service mode without `PATIENTGPT_UAR_TOKEN` SHALL fail startup
with a message naming the variable. The token SHALL never be logged or returned
to a shell.

#### Scenario: Missing token
- **WHEN** the server starts with `PATIENTGPT_UAR_MODE=service:http://127.0.0.1:<port>` and no token
- **THEN** startup fails with a message naming `PATIENTGPT_UAR_TOKEN`

### Requirement: An unreachable or refusing service fails the run visibly
If the service cannot be reached, refuses authentication or ends the stream early,
the run SHALL end with `RUN_ERROR` code `uar_unavailable`, `uar_unauthorized` or
`runtime_failed` respectively, and other lanes SHALL keep working.

#### Scenario: Service stopped
- **WHEN** the UAR service is stopped and a user starts a `uar` run
- **THEN** the run ends with `RUN_ERROR` code `uar_unavailable` within the connect timeout

#### Scenario: Wrong token
- **WHEN** the token is rejected by the service
- **THEN** the run ends with `RUN_ERROR` code `uar_unauthorized`

### Requirement: Service URLs are restricted
The service URL SHALL use `https`, except `http` to `localhost`, `127.0.0.1` or
`[::1]`, and SHALL NOT contain credentials. Other URLs SHALL fail startup.

#### Scenario: Plain HTTP to a remote host
- **WHEN** the mode is `service:http://uar.example.test`
- **THEN** startup fails with a message stating that remote service URLs must use https
