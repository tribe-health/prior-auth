## Purpose

Defines the observable behavior of the Document Assembler agent: a self-contained service that renders any typed medical document from cited claims, over AG-UI and JSON, and never writes.

## ADDED Requirements

### Requirement: Clinical text enters a document only as a cited claim
The agent SHALL render clinical text only through `claim(ordinal)` or `claims_for(tag)` resolved against the claims in the request. A claim carries document provenance (document id, version, page, effective date, content hash), attributed-document provenance (the same plus annotation id, author, date), or annotation-only provenance. In any class whose documents leave the practice, annotation-only claims SHALL be refused (web-00 frozen citation contract, decision 2; `letter_claims.document_id NOT NULL`).

#### Scenario: Claim rendering
- **WHEN** a template renders a document claim
- **THEN** the sentence ends with `(title, p. N, date)`; an attributed-document claim begins `In the clinical judgment of <author>,` and still ends with the document citation

#### Scenario: Refusal
- **WHEN** a template references a claim ordinal not in the request, or an annotation-only claim in a `clinical_correspondence` kind, or the request context carries a clinical prose key such as `symptom_summary`
- **THEN** the render fails and no document, hash or surface is produced

### Requirement: Evidence states are read, never assigned, and never printed in correspondence
The agent SHALL accept committed evidence states from the host and SHALL expose them only to `internal_work_product` kinds, routing `gap` to the clinician and `void` to the coordinator.

#### Scenario: Correspondence
- **WHEN** a `clinical_correspondence` template calls `evidence_state()`
- **THEN** the render fails

#### Scenario: Work product
- **WHEN** a `pa.halt_memo` renders a criterion whose committed state is `void`
- **THEN** the memo shows `void` routed to `coordinator`, and a `gap` routed to `clinician`

### Requirement: QA findings are the schema's seven checks
The agent SHALL emit one finding per configured check against the keys `unsupported_claim`, `annotation_attribution`, `criterion_coverage`, `policy_version_currency`, `code_consistency`, `date_consistency`, `readability`, with the schema's severity, and SHALL report `not_applicable` rather than `pass` when a check's inputs are absent.

#### Scenario: Coverage
- **WHEN** a required criterion has no rendered claim
- **THEN** `criterion_coverage` fails with `data.uncovered` naming it, the assembly is not approvable, and a `HaltMemoBlock` surface is described

### Requirement: Deterministic hash and receipt-bound signature
The agent SHALL compute `content_sha256` over kind key, kind version, template package digest and the canonical Markdown, and SHALL produce a signature block only from a signing receipt naming that exact hash.

#### Scenario: Determinism
- **WHEN** the same request is rendered twice
- **THEN** the bytes and hash are identical; changing any file in the package, used or not, changes the hash

#### Scenario: Signature
- **WHEN** a receipt names a different hash, or a template attempts to render a signature
- **THEN** the signature is refused

### Requirement: Actor-free bodies and a pinned package
Request bodies SHALL reject `actor`, `identity`, `affirmed`, `signature` and any unknown field; a request carrying `expectedPackageDigest` SHALL be refused with 409 when the loaded package differs.

#### Scenario: Refusal
- **WHEN** a body carries an actor field or a stale package digest
- **THEN** the agent refuses before rendering and produces no surface

### Requirement: AG-UI channel and A2UI surfaces
`POST /agent/run` SHALL stream `RUN_STARTED`, `STEP_STARTED`, `STATE_SNAPSHOT`, `TEXT_MESSAGE_START/CONTENT/END`, one `CUSTOM` (`a2ui.surface`) per surface, `STEP_FINISHED`, `RUN_FINISHED`, or `RUN_ERROR`; surfaces SHALL be limited to `DraftPreviewBlock`, `QaFindingsBlock`, `ClaimsManifestBlock`, `HaltMemoBlock`, and `AffirmationBlock`, `SigningBlock`, `SubmissionBlock` SHALL be refused by name.

#### Scenario: Privileged surface
- **WHEN** any code path attempts to describe `AffirmationBlock`
- **THEN** the descriptor is refused as privileged

### Requirement: The agent never writes
The agent SHALL have no dependency on `aso-host`, a database driver or a store, SHALL perform file I/O only when loading packages at start, and SHALL leave persistence to the host's `draft_document` command.

#### Scenario: Dependency graph
- **WHEN** `crates/aso-document-assembly/Cargo.toml` and `crates/clinical-docs/Cargo.toml` are inspected
- **THEN** neither names `aso-host`, `sqlx`, `tauri` or `flutter_rust_bridge`
