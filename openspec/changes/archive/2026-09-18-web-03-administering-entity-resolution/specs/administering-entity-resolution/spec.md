## Purpose

Defines the observable behavior required for controlling entity is resolved in the web-first case-to-letter workflow.

## ADDED Requirements

### Requirement: Controlling entity is resolved
The system SHALL satisfy this capability under verified tenant scope while preserving clinical authority, citation, privacy, and no-query-cache invariants.

#### Scenario: Required behavior
- **WHEN** member, plan, procedure, date, and delegation inputs are evaluated
- **THEN** one versioned entity, criteria set, submission channel, and appeal path resolve or the case is parked with a named blocker

#### Scenario: Scope or authority refusal
- **WHEN** the caller is unauthenticated, foreign to the practice, stale, or lacks the capability required by this operation
- **THEN** the system refuses the operation without publishing protected data or committing a partial effect

#### Scenario: Authoritative inputs change
- **WHEN** the selected entity, plan, member enrollment, delegation rule, path, validity window, or source-document version changes
- **THEN** the affected current resolution is invalidated, its resolution revision advances, and downstream evidence work remains blocked until a new resolution commits

#### Scenario: Resolution races an authoritative input mutation
- **WHEN** resolution and an entity, plan, enrollment, rule, or source-document mutation overlap in either transaction order
- **THEN** they serialize before the resolver reads authoritative inputs, and the committed current row is either based on the new inputs or invalidated by the later mutation

#### Scenario: Compatible path starts after the service date
- **WHEN** a matching plan, enrollment, or delegation rule starts after the case service date and no effective path exists on that date
- **THEN** resolution reports `missing` rather than claiming the path expired

#### Scenario: Historical windows never overlapped
- **WHEN** matching plan, enrollment, and delegation-rule windows are all historical but their intersection is empty
- **THEN** resolution reports `missing` because no compatible path existed to expire

#### Scenario: Coverage path ended
- **WHEN** a compatible path existed but its plan, member enrollment, or delegation rule ended before the service date
- **THEN** resolution reports an expired coverage path without falsely naming one component as the cause

#### Scenario: Exclusive validity end is displayed
- **WHEN** a resolved path has a `validTo` boundary
- **THEN** the interface labels that date as exclusive so it does not claim coverage on the first invalid date

#### Scenario: Resolution command outcome is uncertain
- **WHEN** the browser loses a resolution response and exact command lookup does not yet find the receipt
- **THEN** it retries the same command ID with the retained expected case-input revision before accepting current state, and clears the pending command only after a committed receipt or a terminal absent result

#### Scenario: Resolution remains parked
- **WHEN** resolution produces `missing`, `ambiguous`, `conflicting`, or `expired`
- **THEN** the interface names that state and prevents downstream evidence work

#### Scenario: Required case inputs are incomplete
- **WHEN** resolution returns HTTP `422 case_inputs_incomplete`
- **THEN** the interface says “Complete the member, plan, procedure, and service date before continuing,” opens intake, loads the authorized full case record, and focuses the first missing field in member, plan, procedure, service-date order

#### Scenario: Resolved path is reviewable
- **WHEN** resolution succeeds
- **THEN** its durable receipt and interface identify the entity, criteria set, submission channel, appeal path, validity interval, source name, source effective date, source version, and authoritative input revisions
