## Purpose

Defines the observable behavior required for both response types reach governed signing in the web-first case-to-letter workflow.

## ADDED Requirements

### Requirement: Both response types reach governed signing
The system SHALL satisfy this capability under verified tenant scope while preserving clinical authority, citation, privacy, and no-query-cache invariants.

#### Scenario: Required behavior
- **WHEN** an authorized user reviews a current response revision
- **THEN** separate corrected-resubmission and clinical-appeal cases complete support review, QA and signing with fresh authority and scoped responsive state
- **AND** the case remains `response_ready` until a distinct local response acknowledgement commits atomically with `resubmitted` or `appealed`

#### Scenario: Scope or authority refusal
- **WHEN** the caller is unauthenticated, foreign to the practice, stale, or lacks the capability required by this operation
- **THEN** the system refuses the operation without publishing protected data or committing a partial effect
