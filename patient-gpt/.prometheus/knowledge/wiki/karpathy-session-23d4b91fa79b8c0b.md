---
type: SessionRecord
id: karpathy-session-23d4b91fa79b8c0b
title: Karpathy session 23d4b91fa79b
tags:
- karpathy
- session-learning
sources:
- resource: session:bb08a33e-9561-4503-a7b8-268d3122f1e8
generated:
  by: pk/1.11.0
  at: 2026-10-26T10:04:23.366398+00:00
created_at: 2026-10-26T10:04:23.366398+00:00
updated_at: 2026-10-26T10:04:23.366398+00:00
revision: 0
---

## Delta

The web half is done and builds cleanly. The PatientGPT A2UI catalog renders through `@prometheus-ags/a2ui-react` 4.2.0, with `@ag-ui/core` pinned at 0.0.59, using the prototype CSS. I re-ran the checks myself: `pnpm typecheck` and `pnpm build` pass, and the query-cache audit passes. A search of `dist/` finds no trace of the sample surface, so it doesn't ship in production. Nothing is committed.

**What it does (seen in the browser, local only):**
- Every catalog component is drawn with the prototype's tokens, at 1100px and 375px, in light and dark.
- Image, `CriteriaList` and `openUrl` show the same "Not rendered in this build" fallback as Flutter.
- Tapping a button reports "Reported to the app, not applied", and nothing touches records or the entity graph.
- There is no horizontal overflow, and the app logged no console errors.

**Tailwind check:** your setup did not restyle the existing shell. Computed styles match the prototype on 22 selectors in both themes. The one breakage was in the new modal: Tailwind's reset removed its centering, so it now sets `margin: auto` in its own CSS. Your Tailwind and shadcn files are unchanged. Tailwind's reset would also change `h5`/`h6`, `dialog` and image defaults, but the shell uses none of those today.

**Where web and Flutter don't match yet:**
- **Selected states:** web draws the selected tab and choice chip in near-black. Flutter uses a grey fill for the tab and ember for the chip. They should share one style from the prototype.
- **Icons:** web maps check, lock and folder as well; Flutter only maps add, edit, search and close.
- **Sample keys:** web had to use the official A2UI keys: version `v0.9.1`, Tabs `title`/`child`, DateTimeInput `enableDate`. Flutter's genui accepts both forms, so its sample can switch and the two will match exactly.
- **Unknown components:** a2ui-react rejects a whole message batch that names an unknown component. Web therefore replaces unknown ones with the labelled fallback before rendering, to match Flutter's per-component behaviour.

**Not covered:** keyboard focus on the new controls, reduced motion, a screen reader, the Tauri webview and physical devices weren't checked. The production JavaScript is 376 kB gzipped, over the 300 kB budget; how much of that A2UI adds wasn't measured. A2UI from real agent runs isn't connected yet, because the deterministic runtime emits none. That hand-off belongs to the UAR catalog owner.

## Root Cause

No explicit root-cause section was captured; preserve this as a session record, not an inferred diagnosis.

## Corrective Actions

Review and promote only reusable findings.

## Session Metadata

- Harness: claude-code
- Session: bb08a33e-9561-4503-a7b8-268d3122f1e8
- Captured: 2026-10-26T10:04:21.754852Z
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
- mobile/lib/features/conversation/presentation/widgets/thread_view.dart
- mobile/lib/features/home/presentation/home_view.dart
- mobile/lib/features/shell/presentation/widgets/sidebar.dart
- mobile/lib/features/workspace/data/ffi_patient_gpt_gateway.dart
- mobile/lib/features/workspace/data/http_patient_gpt_gateway.dart
- mobile/lib/features/workspace/domain/patient_directory.dart
- mobile/lib/features/workspace/domain/patient_gpt_gateway.dart
- mobile/lib/features/workspace/presentation/providers/workspace_providers.dart
