# Proposal

## Why

Project policy runs tests and independent review only after every production
change in a phase is complete, locally, never in CI. Goal 6 names the evidence:
a streamed local reply and an embedding on desktop, iOS and Android with UAR
absent, and the UAR path shown separately. This change holds that final boundary.

## What Changes

- Executable scenario scripts for every scenario ID in `verification.md`, authored
  only after all eleven other changes are implemented.
- One consolidated local integration run per target, through the shipped entry
  points, with isolated scratch roots and real collaborators.
- A dated evidence folder with a README mapping each scenario to its command,
  source revision, exit code, observed result and verdict (PASS, FAIL, BLOCKED,
  NOT_EXERCISED).
- Independent review by `artifact-critic` and `ui-critic` given only the artifacts
  and this contract, with one batched correction and confirmation cycle.

## Capabilities

### New Capabilities
- (none — verification only; `skip_specs: true`)

### Modified Capabilities
- (none)

## Impact

- New `scripts/evidence/` (scenario scripts), new
  `.kbd-orchestrator/phases/local-inference-and-uar-wiring/evidence/<date>-final-gate/`.
- Needs the operator's tier gate opened for release-mode evidence builds
  (decision 11), the physical iPhone and signing team, an arm64 AVD, a local UAR
  service with a synthetic-data provider and a PAT.
