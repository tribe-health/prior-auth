## Purpose

Defines the observable behavior required for prior request reaches signed local submission in the web-first case-to-letter workflow.

## ADDED Requirements

### Requirement: Prior request reaches signed local submission
The system SHALL satisfy this capability under verified tenant scope while preserving clinical authority, citation, privacy, and no-query-cache invariants.

#### Scenario: Required behavior
- **WHEN** an authorized surgeon reviews the current generated request
- **THEN** human claim-support review, QA, approval, signing, and one local submission acknowledgement complete only for the current fully supported revision
- **AND** signing alone does not advance the case to `submitted`

#### Scenario: Scope or authority refusal
- **WHEN** the caller is unauthenticated, foreign to the practice, stale, or lacks the capability required by this operation
- **THEN** the system refuses the operation without publishing protected data or committing a partial effect
