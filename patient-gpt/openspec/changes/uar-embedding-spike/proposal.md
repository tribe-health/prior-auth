# Proposal

## Why

Embedding UAR is required on iOS (goal 4) and is an option for desktop (topology
(a) or (c), decision 3). Nothing about it has been built: UAR pins a nightly
toolchain, a `[patch.crates-io]` SurrealDB overlay that Cargo applies only from
the root workspace and that would also replace PatientGPT's own `surrealdb`
3.3.0, eleven vendored path dependencies, and mandatory `surreal-memory` with a
candle embedder (`analysis.md` → UAR consumption). Decision 12 accepts the risk;
decisions 3 and 4 wait on this spike's result.

## What Changes

- A throwaway Cargo workspace `spikes/uar-embedding/` (outside the product
  workspace) that consumes UAR at tag v1.3.0 (commit
  `774469746fee4de99be41dc1cd231857067e4487`) with the `embedded-mobile` profile.
- Measurements and a written report `docs/plan/uar-embedding-spike.md`: stable vs
  nightly build, the patch overlay's effect on SurrealDB 3.3.0, iOS device and
  simulator compile and link, binary size, one in-process AG-UI run through an
  `ExternalLlmDriver` over the macOS local chat adapter, the start/subscribe race,
  and every analysis citation re-checked at the tag (decision 9).
- No product code changes; the spike workspace is deleted after the report is
  accepted (the report stays).

## Capabilities

### New Capabilities
- (none — no product behaviour changes; `skip_specs: true`)

### Modified Capabilities
- (none)

## Impact

- New directory `spikes/uar-embedding/` (temporary). Reads the UAR repository;
  never writes to it.
- The operator decides topology (decision 3) and, if stable fails, the toolchain
  (decision 4) from the report. If the spike fails, desktop takes option (b) and
  iOS goal 4 is reported Blocked on UAR.
