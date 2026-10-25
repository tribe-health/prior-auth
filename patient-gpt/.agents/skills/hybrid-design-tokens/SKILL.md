---
name: hybrid-design-tokens
description: ALWAYS invoke before writing any color, spacing, typography, radius, or theme value on ANY surface (Tailwind config, shadcn CSS vars, shadcn_flutter ThemeData, Dart theme). One token source feeds both the React/Tailwind theme AND the Flutter theme. Triggers on design token, theme, palette, color, spacing, typography, dark mode, light mode, Tailwind config, shadcn theme, CSS variable, ThemeData, brand color, theme-factory.
---
<!-- TJ-ARCH-MOB-001 compliant -->

> **Binding:** Prefer simple, surgical, strongly typed changes; preserve strict
> layering and verify dependency versions. When installed in a project, also
> obey that project's `AGENT_BASE_RULES.md`; this skill remains self-contained.

# Hybrid Design Tokens

There is **one source of truth** for design tokens in this project, and it feeds every
surface. Never hardcode a palette, spacing, radius, or type value twice. Never let the
Flutter theme and the Tailwind theme drift.

## Token source → outputs

```
assets/templates/design-tokens/tokens.toml          ← THE source. Edit only this.
   │  node scripts/gen-design-tokens.mjs <root>
   ├── desktop/src/theme.css                        Tailwind 4 @theme (+ light override)
   └── mobile/lib/core/theme/tokens.dart            Dart token class
```

Both outputs carry a `GENERATED … DO NOT EDIT` banner. Edit `tokens.toml` and re-run
the script; never hand-edit a generated file.

### Why this is generated and not "kept in sync"

"One token source" used to be aspiration rather than mechanism: the two files were
hand-mirrored, and they had **already drifted** — `#0D0D18` on Flutter against
`#0B0F14` on React for the same app-background role, with nothing in the build to
notice. Two palettes that agree on intent and disagree on values is worse than one
ugly palette, because every screenshot comparison becomes unreliable.

Generation makes the drift impossible instead of merely discouraged.
`theme-factory` may help explore a palette, but it is not a cross-platform token
compiler and must never be cited as parity proof.

## Naming: role, never colour

A token is named for the **job it does**, never the colour it currently holds.
`accent` survives a rebrand; `ember` becomes a lie the first time the brand changes,
and renaming it then touches every call site. The generator emits deprecated
colour-word aliases (`red` → `danger`) only so older code keeps compiling — new code
uses the semantic name.

Group prefixes keep roles legible and prevent collisions: `bgSurface` is a
background, `textPrimary` is a text role. A flat namespace fights over the obvious
words.

## Light and dark are the same names

Both themes define the **same token names** with different values, so no component
ever branches on theme — it reads a role and gets the right colour. Both must satisfy
WCAG 2.2 AA against their own background; changing a value is a contrast change, so
re-check it (`a11y-gate`).

## Token categories (define once, reference everywhere)

- **Color** — semantic, not decorative: `canvas`, `chrome`, `surface`, `raised`, `hover`,
  `text`, `muted`, `accent`, `destructive`, `focus`. Provide a full light AND dark scale.
- **Spacing** — a scale (`space-1…space-section`), not per-component padding. Use fluid
  `clamp()` for section-level rhythm on web.
- **Typography** — at most two families with a deliberate pairing; fluid `clamp()` sizes
  (`text-base`, `text-hero`); `font-display: swap`; preload only the critical weight.
- **Radius / motion** — `radius`, `duration-*`, `ease-*`. This project is strict Flat 2.0: no
  visible borders/divider lines and no layout shadows. Adjacent areas differ by background.

## Rules

1. **No magic values in components.** Web: reference `var(--…)` / Tailwind token classes.
   Flutter: reference `Theme.of(context).colorScheme` / a typed `AppTokens` extension —
   never a raw `Color(0xFF…)` or `EdgeInsets.all(13)` at a call site.
2. **Both themes must feel intentional.** Do not default to dark mode; style light AND dark
   deliberately and test both (see [[tauri-ui-review]], [[flutter-golden-ui]]).
3. **Semantic naming wins.** Name by role (`accent`, `destructive`), never by hue
   (`blue`, `red`) at the token-consumption site.
4. **Cross-surface parity.** The same semantic token must resolve to the same intent on
   web and mobile. When you change a token, regenerate BOTH outputs in the same change.
5. **ContentBlock styling flows from tokens.** Every [[content-block-ui]] variant styles
   from these tokens — no per-variant ad-hoc colors.

## Verify loop

- Web: inspect at 320/768/1024/1440 in both themes — see [[tauri-ui-review]].
- Flutter: golden test both `ColorScheme`s — see [[flutter-golden-ui]].
- Contrast: every text/background pair meets WCAG 2.2 AA — see [[a11y-gate]].

## Related skills

- `theme-factory` (external) — optional palette ideation only; not a compiler or parity proof
- [[content-block-ui]] — consumes these tokens for every variant
- [[a11y-gate]] — token contrast gate
