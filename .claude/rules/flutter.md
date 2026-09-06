---
paths: ['**/*.dart', '**/pubspec.yaml']
---

# Flutter / Dart

Loaded when a Dart file is read. Not resident.

Surface: `mobile/`. Dart SDK >=3.12.0 <4.0.0, Flutter >=3.44.0, Riverpod 3.4.
Commands run from `mobile/`, not the repository root.

| Tier | Commands |
|---|---|
| T0 every edit | `flutter analyze mobile` |
| T1 unit complete | `flutter test test/<file>` (from `mobile/`) |
| T2 phase complete | `flutter test` (from `mobile/`); `bash scripts/audit.sh` |
| T3 milestone only | `flutter build ios`; `flutter build apk`; device certification |

## Hard rules

- Platform builds are the expensive tier. A single heavy plugin can add minutes
  to a cold Xcode build. Never platform-build mid-phase.
- Use `flutter build ios --config-only` when only project config changed.
- State lives in providers, not in widgets. A widget renders and submits intent.
- Run `build_runner` only when an annotated source actually changed.

## The pin set is coherent, not arbitrary

`pubspec.yaml` pins exactly, not with carets. `freezed`, `riverpod_generator`,
`json_serializable` and `build_runner` each cap the analyzer differently, and
you cannot satisfy all four at their latest. **The set moves together or not at
all.**

Read versions from pub.dev before changing one. An earlier draft of this file
pinned `riverpod_lint` to the `flutter_riverpod` version — a number that has
never been published. `flutter pub get` caught it; a caret range would have
resolved to something arbitrary and hidden the mistake.

`versions.toml` is the pin authority.

## Evidence state — the Dart-specific trap

`void` is a reserved word in Dart, so the enum member is **`voidState`** while
the wire value stays **`"void"`**. The JSON contract is shared across three
languages and does not bend to one language's grammar.

The unknown-value parse **throws**. It does not default. A default here silently
converts an unrecognized state into a plausible one, and the three states route
work to three different people — a wrong default sends a coordinator to argue a
document that does not exist.

## Theme is generated

`mobile/lib/core/theme/tokens.dart` carries a `DO NOT EDIT` banner and is
generated from `assets/templates/design-tokens/tokens.toml`. Edit the source,
then run `bash scripts/gen-design-tokens.sh .` from the repository root. A
hand-edit is reverted silently by the next generator run. `scripts/audit.sh`
check 5 verifies the banner survives.

## A simulator is not a device

On iOS an over-budget model load does not raise an error — the operating system
kills the process. Native bridges bind by symbol name, so a renamed class path
compiles clean on both sides and fails at runtime.

Until something has run on physical hardware, the correct word for this surface
is **Build-only**, not Passed. See the four-word verification contract in
`AGENTS.md`.
