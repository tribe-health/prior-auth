## Purpose

Defines the observable behavior required for full-flow fixtures are deterministic in the web-first case-to-letter workflow.

## ADDED Requirements

### Requirement: Full-flow fixtures are deterministic
The system SHALL satisfy this capability under verified tenant scope while preserving clinical authority, citation, privacy, and no-query-cache invariants.

#### Scenario: Required behavior
- **WHEN** the local browser scenario is prepared
- **THEN** synthetic request, corrected-resubmission, and clinical-appeal cases have immutable inputs and expected outputs with no real PHI

#### Scenario: Scope or authority refusal
- **WHEN** the caller is unauthenticated, foreign to the practice, stale, or lacks the capability required by this operation
- **THEN** the system refuses the operation without publishing protected data or committing a partial effect
