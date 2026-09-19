## Why

The ownership correction changes candidate and review tooling inputs. Those implementation inputs
must be complete and archived before the child phase runs Tier 2. Candidate preparation therefore
finishes here, while the single local integration replay and certification belong to the
`ra06d-03-parent-recertification` child completion boundary.

## What Changes

Complete the exact source/configuration/build freeze tooling, 12-role replay tooling,
hash-indexed evidence closure, packet builder, and deterministic validators. Preserve any campaign
started before the child implementation boundary as premature and prohibit its receipts from
certifying RA06.

## Capabilities

### New Capabilities

- `ra06d-02-refreeze-and-replay`: Prepare the immutable candidate and evidence tooling that the
  child phase-completion gate executes once after implementation closes.

## Impact

Candidate manifests, prebuilt artifact definitions, local integration receipt definitions,
evidence indexes and review packets. No Tier 2 or full-integration acceptance executes in this
implementation change. No CI test execution and no receipt reuse from a stale or premature digest.
