# case-command-core Specification

## Purpose
Defines the observable behavior required for verified case commands in the web-first case-to-letter workflow.

## Requirements

### Requirement: Verified case commands
The system SHALL satisfy this capability under verified tenant scope while preserving clinical authority, citation, privacy, and no-query-cache invariants.

#### Scenario: Required behavior
- **WHEN** an authenticated coordinator creates or updates a case with a stable command ID
- **THEN** one tenant-scoped result commits and retry reconciles while forged or foreign scope is refused

#### Scenario: Scope or authority refusal
- **WHEN** the caller is unauthenticated, foreign to the practice, stale, or lacks the capability required by this operation
- **THEN** the system refuses the operation without publishing protected data or committing a partial effect

#### Scenario: Write authority returns a minimal receipt
- **WHEN** an authenticated coordinator has `case_write` but does not have `case:read` and creates, updates, transitions, or reconciles a case command
- **THEN** the system returns only the command ID, action, case ID, and commit time, and requires a separately authorized read to return the case record
