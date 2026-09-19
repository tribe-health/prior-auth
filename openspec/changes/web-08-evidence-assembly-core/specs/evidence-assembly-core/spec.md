## Purpose

Defines the observable behavior required for evidence preserves three states in the web-first case-to-letter workflow.

## ADDED Requirements

### Requirement: Evidence preserves three states
The system SHALL satisfy this capability under verified tenant scope while preserving clinical authority, citation, privacy, and no-query-cache invariants.

#### Scenario: Required behavior
- **WHEN** processed documents are compared with the selected criteria snapshot
- **THEN** one idempotent evidence revision commits met, gap, and void with real citations only where a source exists

#### Scenario: Mandatory evidence work
- **WHEN** the current revision contains a mandatory gap or void
- **THEN** an authorized surgeon can record an exact source-backed gap argument and a coordinator can request and complete void obtain-evidence work through idempotent commands
- **AND** a new evidence revision is required before gate affirmation or generation

#### Scenario: Scope or authority refusal
- **WHEN** the caller is unauthenticated, foreign to the practice, stale, or lacks the capability required by this operation
- **THEN** the system refuses the operation without publishing protected data or committing a partial effect
