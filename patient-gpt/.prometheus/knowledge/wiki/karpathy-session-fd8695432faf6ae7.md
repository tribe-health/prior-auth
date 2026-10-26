---
type: SessionRecord
id: karpathy-session-fd8695432faf6ae7
title: Karpathy session fd8695432faf
tags:
- karpathy
- session-learning
sources:
- resource: session:bb08a33e-9561-4503-a7b8-268d3122f1e8
generated:
  by: pk/1.11.0
  at: 2026-10-26T10:16:54.878380+00:00
created_at: 2026-10-26T10:16:54.878380+00:00
updated_at: 2026-10-26T10:16:54.878380+00:00
revision: 0
---

## Delta

The web and Flutter A2UI samples now match. Web already followed the prototype's rules, so every change is on the Flutter side. I checked it on the iPhone 17 simulator, and `flutter analyze` is clean. Nothing is committed.

**Selected state.** The prototype has one rule for this: `.tab[aria-pressed="true"]` in `surfaces.css`. Unselected items are `--s3`; the selected one gets an `--fg` fill with `--bg` text at weight 700.
- **Tabs:** Flutter's tabs were built on Material's `TabBar`, which can't give unselected tabs their own fill. I replaced it with a PatientGPT Tabs item on the official `title`/`child` keys. "Summary" and "Sources" now look like web's, and switching tabs works on the simulator.
- **Chips:** the selected chip was ember; it is now the same dark fill as web's ("Portal").

**Icons.** Both shells now map the same seven names: add, check, close, edit, folder, lock and search. I copied the check, lock and folder shapes from the prototype's `ui.js` into Flutter's icon set. Any other name shows the labelled fallback.

**Sample keys.** Flutter's sample now uses the official names (`version`, Tabs `title`/`child`, DateTimeInput `enableDate`), so its content is identical to web's.

Two things came up while doing this:
- **Version string.** The two renderers can't share one version string. Web's renderer accepts only `v0.9.1`, and Flutter's genui accepts only `v0.9`. Both mean the same protocol line, so Flutter now converts exactly `v0.9.1` to `v0.9` where it reads messages in, and refuses any other version. The rule is in `mobile/lib/features/a2ui/data/a2ui_wire.dart` and recorded in the plan.
- **Date field.** Switching to `enableDate` exposed a difference: Flutter treated a missing `enableTime` as true and showed a time ("12:00 AM"). It now reads missing flags as false, as web does, and shows "Tue, Nov 3". I also removed Flutter's support for the non-official `variant` key.

One small addition: Flutter now depends directly on `json_schema_builder` 0.1.7, the version already in the lockfile, because genui doesn't re-export it.

One visible difference is left, outside this request: in the "Urgency" radio list, web shades the selected row (`--s3`) and Flutter doesn't.

## Root Cause

No explicit root-cause section was captured; preserve this as a session record, not an inferred diagnosis.

## Corrective Actions

Review and promote only reusable findings.

## Session Metadata

- Harness: claude-code
- Session: bb08a33e-9561-4503-a7b8-268d3122f1e8
- Captured: 2026-10-26T10:16:53.590114Z
- Project: /Users/gqadonis/Projects/TribeHealth/kevin/prior-auth/patient-gpt

## Changed Paths

- ../.prometheus/knowledge/.prompt-snapshots/project/current
- ../.prometheus/knowledge/wiki/index.md
- ../.prometheus/knowledge/wiki/log.md
- .prometheus/gotchas.md
- .prometheus/session-log.md
- assets/templates/design-tokens/tokens.toml
- desktop/src-tauri/icons/32x32.png
- desktop/src-tauri/icons/icon.icns
- desktop/src-tauri/icons/icon.ico
- docs/plan/scaffold-plan.md
- mobile/android/app/src/main/res/mipmap-hdpi/ic_launcher.png
- mobile/android/app/src/main/res/mipmap-mdpi/ic_launcher.png
- mobile/android/app/src/main/res/mipmap-xhdpi/ic_launcher.png
- mobile/android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png
- mobile/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png
- mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Contents.json
- mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-1024x1024@1x.png
- mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-20x20@1x.png
- mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-20x20@2x.png
- mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-20x20@3x.png
- mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-29x29@1x.png
- mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-29x29@2x.png
- mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-29x29@3x.png
- mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-40x40@1x.png
- mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-40x40@2x.png
- mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-40x40@3x.png
- mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-60x60@2x.png
- mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-60x60@3x.png
- mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-76x76@1x.png
- mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-76x76@2x.png
- mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-83.5x83.5@2x.png
- mobile/lib/core/theme/tokens.dart
- mobile/lib/core/widgets/pg_icon.dart
- mobile/lib/features/conversation/presentation/widgets/thread_view.dart
- mobile/lib/features/home/presentation/home_view.dart
- mobile/lib/features/shell/presentation/widgets/sidebar.dart
- mobile/lib/features/workspace/data/ffi_patient_gpt_gateway.dart
- mobile/lib/features/workspace/data/http_patient_gpt_gateway.dart
- mobile/lib/features/workspace/domain/patient_directory.dart
- mobile/lib/features/workspace/domain/patient_gpt_gateway.dart
