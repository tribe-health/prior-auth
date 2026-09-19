## Purpose

Specify the observable certification contract for the assembled browser runtime and complete case workflow.

## ADDED Requirements

### Requirement: Certify the complete browser product scenario

The system SHALL certify one frozen local browser candidate through startup, the complete case-to-letter workflow and both denial-response paths with observed service and actual-browser evidence.

#### Scenario: The configured browser deployment is certified

- **WHEN** `web-17` and `ra-20` have Passed and the frozen browser candidate is exercised
- **THEN** case creation, upload and processing, administering-entity resolution, criteria selection, met/gap/void evidence, prior request generation/review/signing, local submission acknowledgement, denial classification, corrected resubmission, and clinical appeal response generation/review/signing each have an observed result
- **AND** each result is recorded as Passed, Build-only, Blocked or Failed with artifact versions and no silently skipped prerequisite

### Requirement: Preserve citation and authority invariants in the assembled browser

The system SHALL reject documentless generated assertions and unauthorized clinical actions at their mounted boundaries.

#### Scenario: Locked negative campaign remains complete
- **WHEN** browser runtime certification consumes the web-17 evidence
- **THEN** it requires Passed results for the exact `foreign-practice-case`, `missing-citation-claim`, `unrelated-page-claim`, and `low-confidence-denial` controls
- **AND** an additional stale-revision scenario cannot substitute for any locked control

#### Scenario: A generated assertion lacks complete source provenance

- **WHEN** an assertion lacks a source document, positive page number or source date
- **THEN** it is excluded from every generated letter with the message `This assertion has no source document. It will not be included.`
- **AND** an annotation or criterion link cannot substitute for the missing source provenance

#### Scenario: An administrator or agent attempts a clinical action

- **WHEN** an administrator or agent attempts affirmation or signing through the assembled browser path
- **THEN** Gate, AppServices and PostgreSQL each retain their independently testable refusal

### Requirement: Certify browser startup, updates and recovery

The system SHALL preserve scope, committed data and dirty work across the browser runtime lifecycle.

#### Scenario: Startup, scope change and safe update are exercised

- **WHEN** cold and warm startup, account/practice switching, revocation, a dirty-work update, quota or migration recovery, and post-update revalidation are run against the frozen candidate
- **THEN** no previous-scope entity or pending action appears in the new scope
- **AND** an update does not force loss of dirty work or replay a clinical command

### Requirement: Keep platform certification claims separate

The system SHALL scope this change's result to the browser deployment.

#### Scenario: Native or mobile evidence is absent

- **WHEN** browser certification passes without Tauri, native database, native updater or physical mobile evidence
- **THEN** the browser result may be Passed
- **AND** those deferred platforms remain unverified and receive no inferred certification

### Requirement: Prove mounted guards and adapters

The system SHALL demonstrate relied-on guards and exported runtime adapters at the real assembled boundary.

#### Scenario: A guard or adapter is part of the certified path

- **WHEN** certification relies on a guard or exported runtime adapter
- **THEN** its failure mode is demonstrated under controlled sabotage and restored
- **AND** caller tracing shows the intended browser runtime path is mounted
