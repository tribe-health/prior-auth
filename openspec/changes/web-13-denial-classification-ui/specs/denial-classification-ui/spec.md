## Purpose

Defines the observable behavior required for denial path is human confirmed in the web-first case-to-letter workflow.

## ADDED Requirements

### Requirement: Denial path is human confirmed
The system SHALL satisfy this capability under verified tenant scope while preserving clinical authority, citation, privacy, and no-query-cache invariants.

#### Scenario: Required behavior
- **WHEN** deterministic classification evaluates a determination
- **THEN** the expected corrected-resubmission or clinical-appeal proposal is shown and low-confidence input remains blocked until confirmed

#### Scenario: Scope or authority refusal
- **WHEN** the caller is unauthenticated, foreign to the practice, stale, or lacks the capability required by this operation
- **THEN** the system refuses the operation without publishing protected data or committing a partial effect
