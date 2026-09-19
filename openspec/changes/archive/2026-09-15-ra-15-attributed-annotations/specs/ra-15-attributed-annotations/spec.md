## Purpose

Specify the observable contract for this runtime capability: persist attributed annotations with scoped draft recovery. These requirements preserve verified scope and honest delivery evidence across the application.

## ADDED Requirements

### Requirement: Persist attributed annotations with scoped draft recovery — outcome 1

The system SHALL satisfy the following outcome: One server audit/record is committed and projected reactively; attribution and source are preserved and chart facts remain separate.

#### Scenario: An authorized user saves, includes or holds an annotation

- **WHEN** an authorized user saves, includes or holds an annotation
- **THEN** One server audit/record is committed and projected reactively; attribution and source are preserved and chart facts remain separate.

### Requirement: Persist attributed annotations with scoped draft recovery — outcome 2

The system SHALL satisfy the following outcome: Draft text, caret/IME state and independent selection are preserved without remounting or global interaction leakage.

#### Scenario: The editor crosses desktop/mobile widths or opens another view of the same case

- **WHEN** the editor crosses desktop/mobile widths or opens another view of the same case
- **THEN** Draft text, caret/IME state and independent selection are preserved without remounting or global interaction leakage.

### Requirement: Persist attributed annotations with scoped draft recovery — outcome 3

The system SHALL satisfy the following outcome: Old autosave/submission is fenced, another user cannot recover the draft, and conflicts/refusals are explicit.

#### Scenario: The session changes or a stale annotation revision is submitted

- **WHEN** the session changes or a stale annotation revision is submitted
- **THEN** Old autosave/submission is fenced, another user cannot recover the draft, and conflicts/refusals are explicit.
