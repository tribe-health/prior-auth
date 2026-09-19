## Purpose

Defines the observable behavior required for the complete web scenario is certified in the web-first case-to-letter workflow.

## ADDED Requirements

### Requirement: The complete web scenario is certified
The system SHALL satisfy this capability under verified tenant scope while preserving clinical authority, citation, privacy, and no-query-cache invariants.

#### Scenario: Required behavior
- **WHEN** the frozen local candidate runs in an actual browser
- **THEN** the request flow and both denial branches pass Tier 2 with responsive, restart, session, tenant, citation, and stale-revision controls
- **AND** the campaign runs the exact `foreign-practice-case`, `missing-citation-claim`, `unrelated-page-claim`, and `low-confidence-denial` controls from the locked manifest

#### Scenario: Scope or authority refusal
- **WHEN** the caller is unauthenticated, foreign to the practice, stale, or lacks the capability required by this operation
- **THEN** the system refuses the operation without publishing protected data or committing a partial effect
