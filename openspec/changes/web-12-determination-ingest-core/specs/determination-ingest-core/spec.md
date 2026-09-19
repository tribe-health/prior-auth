## Purpose

Defines the observable behavior required for determination is sourced and linked in the web-first case-to-letter workflow.

## ADDED Requirements

### Requirement: Determination is sourced and linked
The system SHALL satisfy this capability under verified tenant scope while preserving clinical authority, citation, privacy, and no-query-cache invariants.

#### Scenario: Required behavior
- **WHEN** a synthetic payer determination is entered for an acknowledged submission
- **THEN** one immutable source-backed determination links to the exact case, submission, and original request without guessed fields

#### Scenario: Scope or authority refusal
- **WHEN** the caller is unauthenticated, foreign to the practice, stale, or lacks the capability required by this operation
- **THEN** the system refuses the operation without publishing protected data or committing a partial effect
