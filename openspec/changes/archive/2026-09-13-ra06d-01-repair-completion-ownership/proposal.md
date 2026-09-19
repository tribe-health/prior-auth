## Why

RA06's final task requires a real RA11c materializer caller even though the phase plan makes RA11c
transitively depend on RA06. That completion cycle has no valid execution order. The Tauri host
also has nine fail-closed clinical command stubs whose implementation belongs to RA17 but whose
inventory is absent from RA17 acceptance.

## What Changes

Replace the RA06 caller requirement with a candidate-bound open-obligation receipt that proves the
caller is still absent, explicitly assigned to unchecked RA11c work, and excluded from RA06's
completion claim. Add the exact native command inventory to RA17's existing full-parity contract.
Add a deterministic Python verifier for the obligation receipt.

## Capabilities

### New Capabilities

- `ra06d-01-repair-completion-ownership`: Make RA06, RA11c and RA17 completion ownership
  topologically executable and mechanically visible.

### Modified Capabilities

- `ra-06-bounded-revocation`: Certify the implemented server path and synchronous consumer fence
  while retaining the RA11c producer as an open obligation.
- `ra-17-native-session-transport`: Enumerate the nine Tauri clinical commands required for native
  operation parity.

## Impact

OpenSpec contracts, one Python verifier and focused tests. No runtime implementation or production
web source changes in this change. The contract edit invalidates the existing RA06 candidate.
