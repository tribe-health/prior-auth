# document-processing-ui Specification

## Purpose
Defines the observable behavior required for document processing is observable in the web-first case-to-letter workflow.

## Requirements

### Requirement: Document processing is observable
The system SHALL satisfy this capability under verified tenant scope while preserving clinical authority, citation, privacy, and no-query-cache invariants.

#### Scenario: Bounded processing lifecycle
- **WHEN** an ingested document is processed
- **THEN** it moves through queued, processing, and ready or failed states, persists deterministic page-addressable provenance, and an exact retry returns the single committed result

#### Scenario: Approved projection and reload
- **WHEN** processing state is published or the browser reloads
- **THEN** the authorized replica exposes exactly the approved document status metadata and the responsive intake view re-joins that committed state from the entity graph

#### Scenario: Mounted browser caller
- **WHEN** an authenticated user opens `/cases/{caseId}/intake`
- **THEN** the routed case intake mounts document upload and status components that use the browser HTTP upload contract and Zustand/PEM projection hooks

#### Scenario: Processor authority boundary
- **WHEN** processing is requested by a human browser principal or without a current job grant
- **THEN** the processor command is refused and the browser receives processing results only through the approved status projection

#### Scenario: Source material remains local
- **WHEN** a document is processed or its status is synchronized
- **THEN** source text, embeddings, storage identity, parser diagnostics, and object locations remain outside the published relation and browser response

#### Scenario: Scope or authority refusal
- **WHEN** the caller is unauthenticated, foreign to the practice, stale, or lacks the capability required by this operation
- **THEN** the system refuses the operation without publishing protected data or committing a partial effect
