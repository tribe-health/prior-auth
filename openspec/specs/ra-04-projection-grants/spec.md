# ra-04-projection-grants Specification

## Purpose
Specify the observable contract for this runtime capability: derive replica grants and frf identity on the server. These requirements preserve verified scope and honest delivery evidence across the application.

## Requirements

### Requirement: Derive replica grants and FRF identity on the server — outcome 1

The system SHALL satisfy the following outcome: Only authorized rows/columns are permitted; evidence_states explicitly uses key; remaining metadata is treated as protected unless approved otherwise.

#### Scenario: The five-table projection registry is evaluated for two practices

- **WHEN** the five-table projection registry is evaluated for two practices
- **THEN** Only authorized rows/columns are permitted; evidence_states explicitly uses key; remaining metadata is treated as protected unless approved otherwise.

### Requirement: Derive replica grants and FRF identity on the server — outcome 2

The system SHALL satisfy the following outcome: None broadens the server grant; wrong issuer/audience/scope/revision is rejected.

#### Scenario: A caller supplies table/where/columns, forged traits, headers or another service token

- **WHEN** A caller supplies table/where/columns, forged traits, headers or another service token
- **THEN** None broadens the server grant; wrong issuer/audience/scope/revision is rejected.

### Requirement: Derive replica grants and FRF identity on the server — outcome 3

The system SHALL satisfy the following outcome: Protected downstream access is denied; no permissive pass-through or invented session linkage is used.

#### Scenario: Required token minting or membership resolution fails

- **WHEN** required token minting or membership resolution fails
- **THEN** Protected downstream access is denied; no permissive pass-through or invented session linkage is used.

### Requirement: Derive replica grants and FRF identity on the server — outcome 4

The system SHALL satisfy the following outcome: The authoritative producer clears cases.gate_affirmed_at; the approved projection and mounted authorized route preserve the nullable field, and the navigation handoff names this entity field for its future graph owner.

#### Scenario: A committed gate affirmation is removed in another session at the authoritative repository boundary

- **WHEN** A committed gate affirmation is removed in another session at the authoritative repository boundary
- **THEN** The authoritative producer clears cases.gate_affirmed_at; the approved projection and mounted authorized route preserve the nullable field, and the navigation handoff names this entity field for its future graph owner.

### Requirement: Derive replica grants and FRF identity on the server — outcome 5

The system SHALL satisfy the following outcome: The existing case_evidence, evidence_citations and documents triggers overwrite forged derived practice IDs and preserve tested cascades. Cases use authorized practice ownership/RLS; evidence_states remains explicitly approved reference data without an invented practice trigger.

#### Scenario: Fresh and upgraded databases receive forged practice_id, parent-key changes and permitted parent transfers under the non-bypass role

- **WHEN** fresh and upgraded databases receive forged practice_id, parent-key changes and permitted parent transfers under the non-bypass role
- **THEN** The existing case_evidence, evidence_citations and documents triggers overwrite forged derived practice IDs and preserve tested cascades. Cases use authorized practice ownership/RLS; evidence_states remains explicitly approved reference data without an invented practice trigger.
