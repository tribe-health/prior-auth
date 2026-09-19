## Purpose

Defines the observable behavior required for denial responses are distinct and cited in the web-first case-to-letter workflow.

## ADDED Requirements

### Requirement: Denial responses are distinct and cited
The system SHALL satisfy this capability under verified tenant scope while preserving clinical authority, citation, privacy, and no-query-cache invariants.

#### Scenario: Required behavior
- **WHEN** a confirmed denial branch generates a response
- **THEN** the correct response purpose links the determination and original request and every assertion carries an exact immutable document version/page/span/date plus current human support decision

#### Scenario: Scope or authority refusal
- **WHEN** the caller is unauthenticated, foreign to the practice, stale, or lacks the capability required by this operation
- **THEN** the system refuses the operation without publishing protected data or committing a partial effect
