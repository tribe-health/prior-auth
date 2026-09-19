## Purpose

Defines the observable behavior required for documents are durably ingested in the web-first case-to-letter workflow.

## ADDED Requirements

### Requirement: Documents are durably ingested
The system SHALL satisfy this capability under verified tenant scope while preserving clinical authority, citation, privacy, and no-query-cache invariants.

#### Scenario: Required behavior
- **WHEN** a supported tenant-scoped synthetic document is uploaded with a stable command ID
- **THEN** bytes and metadata commit atomically with a verified hash, while invalid inputs leave no ready record

#### Scenario: Scope or authority refusal
- **WHEN** the caller is unauthenticated, foreign to the practice, stale, or lacks the capability required by this operation
- **THEN** the system refuses the operation without publishing protected data or committing a partial effect

### Requirement: Uploads are bounded and typed
The browser service SHALL accept only non-empty PDF and UTF-8 plain-text documents whose declared SHA-256 digest matches, whose body is no larger than 16 MiB, and whose inspected page count is no larger than 500.

#### Scenario: Supported document
- **WHEN** a verified caller uploads a parseable unencrypted PDF or valid UTF-8 plain-text document within both limits
- **THEN** the service persists a queued document using the declared authoritative media type and a server-derived content-addressed storage key

#### Scenario: Invalid document
- **WHEN** an upload is empty, oversized, over the page limit, malformed, encrypted, invalid UTF-8, contains a NUL byte, disagrees with its declared media type, or fails its declared digest
- **THEN** the service returns the frozen bounded refusal and commits no ready document

### Requirement: Upload commands are idempotent and recoverable
The repository SHALL bind each upload command to its tenant, actor, case, document identity, revision expectations, metadata, media type, byte count, and digest.

#### Scenario: Exact retry
- **WHEN** a caller repeats an already committed command with the identical payload and bytes, including after process restart
- **THEN** the service returns the committed receipt and verifies or restores the same digest-matching object

#### Scenario: Conflicting retry
- **WHEN** a caller reuses a command ID with a different payload
- **THEN** the service returns `command_conflict` without replacing the committed object or metadata

#### Scenario: Interrupted finalize
- **WHEN** object publication succeeds but database finalization fails
- **THEN** the service removes the exact digest-matching object and reservation, or bounded startup reconciliation removes an expired reservation and its matching object before a later retry

### Requirement: Browser upload operations are mounted without exposing storage identity
The production Axum router SHALL mount multipart upload, minimized metadata read, and command-result lookup operations with verified session resolution, independent Gate authorization, and `no-store` response policy.

#### Scenario: Mounted browser request
- **WHEN** the browser calls `POST /api/cases/{caseId}/documents`, `GET /api/cases/{caseId}/documents/{documentId}`, or `GET /api/cases/{caseId}/document-commands/{commandId}`
- **THEN** the route delegates through `AppServices` to the restricted repository and returns no document bytes, storage key, temporary filename, source text, or parser diagnostic containing source text

#### Scenario: Processing boundary
- **WHEN** an upload commits successfully
- **THEN** its processing state is `queued`, while canonical page-map and `page_count` materialization remain the responsibility of Web-05
