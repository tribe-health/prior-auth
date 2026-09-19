# ra06d-01-repair-completion-ownership Specification

## Purpose
Define executable completion ownership between RA06, RA11c and RA17 without weakening the final
runtime security contract.

## Requirements

### Requirement: RA06 records the downstream materializer obligation without requiring it

The system SHALL bind RA06 completion to its implemented server revocation path and synchronous
consumer fence, and SHALL retain the real Electric/PGLite materializer caller as an explicit,
candidate-bound RA11c obligation.

#### Scenario: RA06 final review runs before RA11c

- **WHEN** the RA06 candidate contains the adapter definition but no production construction site and RA11c remains unchecked
- **THEN** the open-obligation verification is Passed, the producer obligation is recorded as Blocked under RA11c, and RA06 makes no producer-completion claim.

#### Scenario: A caller or completion claim appears without matching RA11c evidence

- **WHEN** a production adapter call, a checked RA11c task without evidence, a missing adapter seam, or an RA06 producer-completion claim is detected
- **THEN** the open-obligation verifier fails and RA06 cannot use that receipt.

### Requirement: Native clinical command parity is explicit

The system SHALL require RA17 to implement and test every currently fail-closed Tauri clinical
command through host-owned credentials and the shared service contracts.

#### Scenario: RA17 claims full operation parity

- **WHEN** RA17 is reviewed for native operation parity
- **THEN** its evidence invokes all nine named gate, signing and reassessment commands through Tauri IPC and proves renderer actor, practice, epoch and window hints cannot confer authority.
