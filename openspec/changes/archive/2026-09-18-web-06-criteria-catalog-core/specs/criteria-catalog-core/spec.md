## Purpose

Defines the observable behavior required for criteria provenance is canonical in the web-first case-to-letter workflow.

## ADDED Requirements

### Requirement: Criteria provenance is canonical
The system SHALL satisfy this capability under verified tenant scope while preserving clinical authority, citation, privacy, and no-query-cache invariants.

#### Scenario: Required behavior
- **WHEN** legacy or newly loaded criteria enter the catalog
- **THEN** criteria is the canonical relation with immutable content, valid provenance, effective range, and refused legacy writes

#### Scenario: Scope or authority refusal
- **WHEN** the caller is unauthenticated, foreign to the practice, stale, or lacks the capability required by this operation
- **THEN** the system refuses the operation without publishing protected data or committing a partial effect
