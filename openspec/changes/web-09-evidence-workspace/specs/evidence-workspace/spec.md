## Purpose

Defines the observable behavior required for evidence views share one revision in the web-first case-to-letter workflow.

## ADDED Requirements

### Requirement: Evidence views share one revision
The system SHALL satisfy this capability under verified tenant scope while preserving clinical authority, citation, privacy, and no-query-cache invariants.

#### Scenario: Required behavior
- **WHEN** a committed evidence revision is published
- **THEN** queue counts, criteria crosswalk, pathway, and timeline render the same graph revision with responsive scoped state

#### Scenario: Scope or authority refusal
- **WHEN** the caller is unauthenticated, foreign to the practice, stale, or lacks the capability required by this operation
- **THEN** the system refuses the operation without publishing protected data or committing a partial effect
