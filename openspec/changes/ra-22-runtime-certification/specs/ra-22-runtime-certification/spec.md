## Purpose

Specify the observable contract for this runtime capability: certify the assembled runtime against the full acceptance matrix. These requirements preserve verified scope and honest delivery evidence across the application.

## ADDED Requirements

### Requirement: Certify the assembled runtime against the full acceptance matrix — outcome 1

The system SHALL satisfy the following outcome: Every required scenario has observed command/service/browser evidence, artifact versions and a Passed/Build-only/Blocked/Failed result; no prerequisite silently skips.

#### Scenario: The full configured deployment is certified

- **WHEN** the full configured deployment is certified
- **THEN** Every required scenario has observed command/service/browser evidence, artifact versions and a Passed/Build-only/Blocked/Failed result; no prerequisite silently skips.

### Requirement: Certify the assembled runtime against the full acceptance matrix — outcome 2

The system SHALL satisfy the following outcome: That surface and publication remain Blocked; successful browser/fixture tests do not substitute.

#### Scenario: A claimed native OS/browser or hard pin/policy gate lacks evidence

- **WHEN** A claimed native OS/browser or hard pin/policy gate lacks evidence
- **THEN** That surface and publication remain Blocked; successful browser/fixture tests do not substitute.

### Requirement: Certify the assembled runtime against the full acceptance matrix — outcome 3

The system SHALL satisfy the following outcome: Its failure mode is demonstrated at the real integration boundary and caller tracing shows the intended runtime path is actually mounted.

#### Scenario: A new guard is relied on or a new runtime adapter is exported

- **WHEN** A new guard is relied on or a new runtime adapter is exported
- **THEN** Its failure mode is demonstrated at the real integration boundary and caller tracing shows the intended runtime path is actually mounted.
