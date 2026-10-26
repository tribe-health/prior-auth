# Spec Delta

## Purpose

Defines on-device text embedding: which model produces vectors, where it runs,
how vectors are labelled, and that vectors of local data never leave the device.

## ADDED Requirements

### Requirement: Embeddings run on every native target
With the embedder `ready`, `embed` SHALL return one 384-number vector per input
text on macOS desktop (Apple Silicon), iOS devices, the iOS simulator on Apple
Silicon, Android devices and Android emulators, computed on the device. An Intel
macOS desktop SHALL answer `embed` with `engine_unavailable`.

#### Scenario: iOS simulator embedding
- **WHEN** the iOS app in the iPhone 17 simulator embeds two texts after preparing the embedder
- **THEN** it receives two vectors of 384 finite numbers and embedder id `arctic-embed-xs-int8`

#### Scenario: Android emulator embedding
- **WHEN** the Android app on an emulator embeds one text after preparing the embedder
- **THEN** it receives one vector of 384 finite numbers and embedder id `arctic-embed-xs-int8`

### Requirement: Same input, same vector
For the same embedder id, input text and purpose, `embed` SHALL return the same
vector on repeated calls on one device, within a cosine similarity of 0.9999.

#### Scenario: Repeat call
- **WHEN** the same text is embedded twice with purpose `document`
- **THEN** the two vectors have cosine similarity of at least 0.9999

### Requirement: Embeddings of local data are local
A vector computed from local data SHALL be classified `local` and SHALL NOT be
sent to any network endpoint.

#### Scenario: Embedding produces no egress
- **WHEN** `embed` runs on desktop with network access available
- **THEN** the app opens no outbound network connection during the call

### Requirement: The embedder loads only verified files
The embedder SHALL load its model and tokenizer only from the verified catalog
directory and SHALL NOT download from any model hub at run time.

#### Scenario: Missing tokenizer file
- **WHEN** the embedder's tokenizer file is removed after preparation
- **THEN** `embed` is refused with `model_not_installed` and no network request is made
