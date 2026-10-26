# Proposal

## Why

Goal 3 requires the desktop topology to be decided through the KBD cycle. Decision
3 (accepted default) decides it after the UAR embedding spike, from the trade-off
table in `analysis.md` → Desktop topology: (a) UAR in the Tauri process, (b)
`uar-sidecar`, (c) a PatientGPT host crate as a sidecar embedding UAR. Goal 6 asks
for the desktop UAR path to be shown separately once configured.

## What Changes

- The operator's decision 3, recorded verbatim from the spike report.
- Requirements every option must meet: the local lane stays in-process and works
  when UAR fails; a UAR process or runtime failure surfaces as `RUN_ERROR` and
  never closes the window; the Tauri commands keep mirroring the HTTP routes
  (or, under (c), the operator-approved amendment to that rule is recorded).
- Option-specific tasks are added to this change by a spec amendment
  (`/opsx:update`) after decision 3 is recorded. This change is BLOCKED for
  implementation until then.

## Capabilities

### New Capabilities
- `desktop-uar-hosting`: how the desktop app reaches UAR and how UAR failures are contained.

### Modified Capabilities
- (none)

## Impact

- `desktop/src-tauri/` under every option; under (b) or (c), sidecar binaries
  bundled per target, launch-token handoff and supervision; under (c), the transport
  mirror rule in `docs/plan/scaffold-contracts.md` and `CLAUDE.md` changes.
- Desktop release bundling stays behind the operator's tier gate.
