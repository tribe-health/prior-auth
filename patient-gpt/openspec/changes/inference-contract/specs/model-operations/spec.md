# Spec Delta

## Purpose

Gives every shell the same operations for inspecting installed models and
host lanes, preparing models with visible and cancellable progress, and
producing on-device embeddings.

## ADDED Requirements

### Requirement: Model status reports device and catalog state
`model_status` SHALL return the device profile (platform, physical RAM in bytes,
registered chat engine or null), which lanes this host can serve (`local`, `uar`),
every catalog entry for this platform with its role (`chat` or `embedder`), size
in bytes and state, and the selected chat and embedder entries or null.

#### Scenario: Fresh install
- **WHEN** `model_status` is called before any model is prepared
- **THEN** every entry has state `absent` and both selections are null

### Requirement: Model state uses a fixed vocabulary
Each catalog entry's state SHALL be one of `absent`, `downloading`, `verifying`,
`ready` or `failed`. A `failed` state SHALL carry a message and one of the codes
`integrity_failed`, `download_failed`, `insufficient_memory` or `storage_failed`.

#### Scenario: Failed verification is visible
- **WHEN** a prepared file fails its integrity check
- **THEN** `model_status` reports that entry as `failed` with code `integrity_failed`

### Requirement: Prepare models streams progress
`prepare_models` SHALL take, for each role (`chat`, `embedder`), one of `skip`,
`preflight` (the device's preflight choice) or a catalog id, and SHALL stream
`ModelOperationEvent`s (`preflight`, `downloading` with received and total bytes,
`verifying`, `installing`, then `ready` or `failed`) for each entry it prepares.
The first event SHALL carry an operation id that `cancel_operation` accepts.

#### Scenario: Progress is observable
- **WHEN** a shell prepares the default chat model on a fresh install
- **THEN** it receives `downloading` events with increasing received bytes, then `verifying`, `installing` and `ready`

#### Scenario: Unknown catalog entry
- **WHEN** `prepare_models` names a catalog id that is not in this platform's catalog
- **THEN** the call is refused with `invalid_input` before any download starts

#### Scenario: Prepare only the embedder
- **WHEN** `prepare_models` is called with `chat: skip` and `embedder: preflight`
- **THEN** only the embedder entry is downloaded and the chat entries stay `absent`

### Requirement: Embed returns vectors tagged with their embedder
`embed` SHALL accept 1 to 64 texts of at most 8,000 characters each and a purpose
(`document` or `query`), and SHALL return one vector per text with the embedder's
catalog id and dimension count. Inputs outside these limits SHALL be refused with
`invalid_input`.

#### Scenario: Embedding a document
- **WHEN** a shell embeds two short texts with purpose `document` after the embedder is ready
- **THEN** it receives two vectors of 384 numbers and the embedder id of the installed embedder

#### Scenario: Embedder not installed
- **WHEN** `embed` is called before the embedder is ready
- **THEN** it is refused with `model_not_installed`

#### Scenario: Oversized request
- **WHEN** `embed` is called with 65 texts
- **THEN** it is refused with `invalid_input` and no embedding is computed

### Requirement: Hosts without local inference refuse model operations
On a host with no local inference (the Axum cloud host and the browser shell),
`prepare_models` and `embed` SHALL be refused with `lane_unavailable`, and
`model_status` SHALL report an empty catalog and a null engine.

#### Scenario: Browser asks for an embedding
- **WHEN** the web shell calls `embed` against the Axum server
- **THEN** it receives HTTP 503 with code `lane_unavailable`

### Requirement: A prepare can be cancelled and resumed
`cancel_operation` with a prepare's operation id SHALL stop the download, keep the
partial file, and end that entry `absent` with its partial bytes kept for resume.

#### Scenario: Cancel mid-download
- **WHEN** a prepare is cancelled after part of the chat model was received
- **THEN** the stream ends, `model_status` shows the entry `absent`, and the partial file is still present
