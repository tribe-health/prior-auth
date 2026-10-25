---
paths: ['**/*.dart', '**/pubspec.yaml']
---

# Flutter / Dart

Loaded when a Dart file is read. Not resident.

Batch implementation until the app path is complete. Use narrow analyzer feedback
earlier only to unblock work. At a completed change boundary, run the smallest app,
platform, or device integration that exercises the real providers, repositories, and
data sources. Unit, widget-only, mock-only, and per-edit tests are not completion
evidence. Reserve full platform builds and device certification for the final phase
or release boundary.

## Hard rules

- Platform builds are expensive. A single heavy plugin can add minutes
  to a cold Xcode build. Never platform-build mid-phase.
- Use `flutter build ios --config-only` when only project config changed.
- State lives in providers, not in widgets. A widget renders and submits intent.

## PatientGPT application boundary

Read `.prometheus/project-contract.md`, `.agents/UI_UX_PROTOCOL.md`, and the
requested architecture skill's `references/flutter/patterns.md`. Use native
Flutter presentation with Riverpod and typed Rust FFI. Preserve the reference
chat hierarchy, drawer, Files sheet, viewer, themes, focus, and safe-area behavior.

No PatientGPT pubspec, bridge, or device integration runner exists yet. Establish
real commands when the application is built. Exercise the typed bridge and
clinical workflow on the actual target at the applicable completion boundary;
compilation and simulator runs do not certify a physical device. All tests are
local and CI must not run them.
