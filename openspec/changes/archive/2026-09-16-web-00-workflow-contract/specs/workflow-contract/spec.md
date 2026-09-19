## Purpose

Defines the observable behavior required for workflow contracts are complete in the web-first case-to-letter workflow.

## ADDED Requirements

### Requirement: Workflow contracts are complete
The system SHALL satisfy this capability under verified tenant scope while preserving clinical authority, citation, privacy, and no-query-cache invariants.

#### Scenario: Required behavior
- **WHEN** the web-first phase is planned
- **THEN** the criteria migration, lifecycle, command parity, privacy matrix, fixtures, error mapping, and invalidation keys are fixed before implementation

#### Scenario: Generated assertion provenance
- **WHEN** a generated assertion lacks a source document, positive page number, or source date
- **THEN** it is excluded with `This assertion has no source document. It will not be included.`
- **AND** an annotation or criterion link cannot substitute for that provenance
- **AND** policy assertions use `effective_date`, clinical records use their applicable `service_date`, `authored_date`, or `effective_date`, and determination assertions use `determination_date`
- **AND** the client request cannot supply a generated claim; the inference adapter produces candidates and the service validates them before persistence
- **AND** composite database relationships require each cited document and letter to belong to the same case

#### Scenario: Letter versions are scoped by purpose
- **WHEN** one case has an initial request and a corrected-resubmission or clinical-appeal response
- **THEN** each purpose may begin at version 1 under the durable `(case_id, purpose, version)` key
- **AND** every response links its challenged determination and original request letter

#### Scenario: Citation support review
- **WHEN** a candidate assertion has a document, page, and date but its exact immutable source span does not support the assertion
- **THEN** a human review records it as unsupported and the assertion is excluded with `This citation does not support the assertion. It will not be included.`
- **AND** the letter cannot be approved while any included claim lacks a current supported decision

#### Scenario: Mandatory evidence work precedes authority
- **WHEN** the current evidence revision contains a mandatory void or a mandatory gap without an accepted source-backed surgeon argument
- **THEN** gate affirmation, generation, approval, and signing are refused
- **AND** coordinator obtain-evidence work and surgeon argument work remain distinct and visible

#### Scenario: Response transition requires acknowledgement
- **WHEN** a denial-response letter is signed
- **THEN** the case remains `response_ready`
- **AND** only an atomic local response acknowledgement advances it to `resubmitted` or `appealed`

#### Scenario: Web-first certification order
- **WHEN** the runtime phase advances beyond the web child
- **THEN** `web-17` and `ra-20` must pass before browser-scoped `ra-22` begins
- **AND** native or mobile certification cannot block or substitute for the browser result

#### Scenario: Deterministic fixture contract
- **WHEN** downstream changes implement or certify the request, corrected-resubmission, or clinical-appeal workflow
- **THEN** they load the locked synthetic input and expected-output manifests from `docs/architecture/fixtures/web-case-to-letter`
- **AND** the exact `low-confidence-denial`, `missing-citation-claim`, `unrelated-page-claim`, and `foreign-practice-case` controls remain part of the same campaign
- **AND** the two denial fixtures use disjoint case, determination, response-letter, and command identities
- **AND** each positive fixture begins from an empty case workflow and enumerates every mutation command, known lookup anchor, and expected revision token
- **AND** each negative control owns disjoint executable state and reset semantics

#### Scenario: Scope or authority refusal
- **WHEN** the caller is unauthenticated, foreign to the practice, stale, or lacks the capability required by this operation
- **THEN** the system refuses the operation without publishing protected data or committing a partial effect
- **AND** PostgreSQL independently binds annotation, gate, approval, and signing authority to the target case practice and refuses practice reassignment after a clinical record exists
- **AND** PostgreSQL exposes exactly the verified selected practice for the current identity even when that identity belongs to more than one practice
- **AND** administrator configuration authority does not grant submission acknowledgement
