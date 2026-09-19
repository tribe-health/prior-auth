## Purpose

Defines the observable behavior required for prior request assertions are cited in the web-first case-to-letter workflow.

## ADDED Requirements

### Requirement: Prior request assertions are cited
The system SHALL satisfy this capability under verified tenant scope while preserving clinical authority, citation, privacy, and no-query-cache invariants.

#### Scenario: Required behavior
- **WHEN** the current clinical gate and evidence revision generate a request
- **THEN** a revisioned draft includes only assertions with an exact immutable document version/page/span/date and refuses stale or unauthorized inputs
- **AND** generation is refused while mandatory void work or an unargued mandatory gap remains

#### Scenario: Scope or authority refusal
- **WHEN** the caller is unauthenticated, foreign to the practice, stale, or lacks the capability required by this operation
- **THEN** the system refuses the operation without publishing protected data or committing a partial effect
