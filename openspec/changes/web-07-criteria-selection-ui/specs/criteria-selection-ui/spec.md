## Purpose

Defines the observable behavior required for effective criteria are selected in the web-first case-to-letter workflow.

## ADDED Requirements

### Requirement: Effective criteria are selected
The system SHALL satisfy this capability under verified tenant scope while preserving clinical authority, citation, privacy, and no-query-cache invariants.

#### Scenario: Required behavior
- **WHEN** a resolved case requests criteria for its plan, procedure, and date
- **THEN** one immutable effective snapshot is bound and displayed, or a specific blocker prevents downstream work

#### Scenario: Scope or authority refusal
- **WHEN** the caller is unauthenticated, foreign to the practice, stale, or lacks the capability required by this operation
- **THEN** the system refuses the operation without publishing protected data or committing a partial effect
