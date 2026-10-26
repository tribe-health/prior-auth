# Spec Delta

## Purpose

Defines how PatientGPT acquires on-device model files: only pinned artifacts,
verified byte for byte, chosen by device memory, stored where the platform keeps
them out of backups.

## ADDED Requirements

### Requirement: Only pinned catalog files are installed
The app SHALL install a model only from its built-in catalog. Each catalog file
SHALL name a repository, an immutable revision, a byte size and a SHA-256 digest.
No run-time lookup of model metadata SHALL select or change a file.

#### Scenario: Catalog entry resolves to a fixed URL
- **WHEN** the default chat model is prepared
- **THEN** every request targets the catalog's repository at its pinned revision, never a branch name

### Requirement: A file is usable only after its digest matches
A downloaded file SHALL be hashed while it streams and renamed into place only when
its size and SHA-256 equal the catalog values. A mismatch SHALL delete the partial
file, mark the entry `failed` with `integrity_failed`, and leave no loadable file.

#### Scenario: Corrupted download is rejected
- **WHEN** the bytes received for a model file differ from the pinned digest
- **THEN** the entry ends `failed` with code `integrity_failed`, the file is absent from the model directory, and a following chat run is refused with `model_not_installed`

### Requirement: Interrupted downloads resume
A download interrupted before completion SHALL keep its partial file and SHALL
resume from the received byte offset with an HTTP Range request on the next
prepare, and the final digest SHALL cover the whole file.

#### Scenario: Resume after interruption
- **WHEN** a prepare is cancelled after part of a file has been received and prepare is started again
- **THEN** the first progress event of the second prepare reports received bytes greater than zero, and the entry ends `ready`

### Requirement: Memory decides the chat model
Before any download, the app SHALL read physical RAM and select Qwen3-1.7B at
7 GiB or more and Qwen3-0.6B below that; below 3 GiB it SHALL refuse the chat
model with `insufficient_memory`. An explicit request for a model larger than the
device allows SHALL be refused the same way.

#### Scenario: Smaller device gets the smaller model
- **WHEN** prepare runs with no explicit chat entry on a device reporting 4 GiB
- **THEN** the `preflight` event names the Qwen3-0.6B entry for this platform

#### Scenario: Oversized request is refused
- **WHEN** prepare explicitly requests Qwen3-1.7B on a device reporting 4 GiB
- **THEN** it is refused with `insufficient_memory` before any download

### Requirement: Model files stay out of backups
On iOS, model files SHALL be stored under Application Support with the
excluded-from-backup attribute set. On Android they SHALL be stored in the
app's no-backup files directory. On desktop they SHALL be stored under the app
data directory, or under `PATIENTGPT_DATA_DIR` when that is set.

#### Scenario: iOS file is excluded from backup
- **WHEN** a model file becomes `ready` on iOS
- **THEN** reading the file's resource values reports it excluded from backup

#### Scenario: Desktop scratch root
- **WHEN** the desktop app starts with `PATIENTGPT_DATA_DIR` set to an empty directory
- **THEN** prepared models and the conversation store are created under that directory and nothing is written under the default app data directory

### Requirement: Downloads use TLS and carry no user data
Model downloads SHALL use HTTPS only, SHALL send no user, conversation or device
identifier beyond what HTTPS itself requires, and SHALL treat the digest, not the
host, as the integrity control.

#### Scenario: Plain HTTP redirect is refused
- **WHEN** a download is redirected to an `http://` URL
- **THEN** the entry ends `failed` with code `download_failed` and no bytes from the redirected response are written
