# Component branding verification — 2026-10-25

Result: **Passed** for the bounded browser library styling task. The approved
scope was all installed shadcn components and their Assistant UI consumers,
preserving existing custom application controls. The project waypoint remains
`spec / ready / bootstrap`; this record does not advance the project phase or
certify clinical workflows.

## Plan versus delivery

Delivered the theme adapter, component-family styling, Assistant UI treatment,
brand-based syntax/chart defaults, compatibility repairs, development-only
preview, customization documentation, and local browser verification.
Rendered review also exposed field-focus collisions, a narrow calendar overflow,
dark active-tab contrast, a stale chart-axis selector, sidebar field colors,
reasoning fades, and attachment icon contrast. These were corrected before the
final build. No application controls were migrated.

## Changed artifacts

| File or bounded collection | Change |
| --- | --- |
| `assets/templates/design-tokens/tokens.toml` | Reference-derived 4px tag radius, 40px control height, 44px touch target; no palette changes. |
| `web/src/styles/tokens.css` | Regenerated CSS output. |
| `mobile/lib/core/theme/tokens.dart` | Regenerated Dart output with the same three added constants. |
| `web/src/styles/app.css` | Removes stock theme/Geist declarations; layers prototype resets and imports both compatibility stylesheets. Preserves existing app chrome/layout rules. |
| `web/src/styles/component-theme.css` | Shadcn aliases of generated roles, preserved brand accent, component focus exceptions, reduced motion, touch targets, chart focus, and native-inset portal geometry. |
| `web/src/components/ui/` | Styled component defaults by family; API-only modules retain behavior. Narrow calendar locale/import, calendar focus, and input-group size repairs included. |
| `web/src/components/assistant-ui/elements/` | Brand surfaces, messages, composer, files/media, Markdown, reasoning/tools, attachments, and tooltip prop compatibility. |
| `web/src/components/assistant-ui/assistant-brand.css` | Shared composition rules using generated roles. |
| `web/src/lib/highlighter.tsx` | Shiki CSS-variable theme backed by source roles, including ANSI; optional grammar state omitted when absent. |
| `web/component-preview.html` | Separate development HTML entry. |
| `web/src/dev/component-preview.tsx`, `component-preview.css`, `preview-types.ts` | Searchable real-component preview, theme control, and fixture layout/types. |
| `web/src/dev/preview-ui.tsx`, `preview-assistant.tsx` | All 63 UI and 15 Assistant UI modules composed in 15 groups, including local runtime states and actual portals. |
| `web/src/dev/fixture-tone.wav`, `fixture-video.mp4` | Synthetic one-second local media for playback checks. |
| `docs/design/component-library.md` | Design authority, defaults/customization contract, preview usage, acceptance limits. |
| `.prometheus/session-log.md`, `.prometheus/gotchas.md` | Append-only delivery and learned constraints. |
| This directory | Build output, viewport/fixture captures, and this verification record. |

Source authorities: `docs/design/patient-chat/tokens.css`, companion styles,
storyboard, brand board, and `.prometheus/project-contract.md`. Existing package
and lockfile edits predated this task and were preserved; no dependencies added.

## Commands and observed results

`node scripts/design-tokens/gen-design-tokens.mjs .`

```text
wrote web/src/styles/tokens.css
wrote mobile/lib/core/theme/tokens.dart
```

`cd web && pnpm build` — **Build-only** for visual acceptance; exit 0.
Complete final output is in `web-build.log`.

```text
$ tsc -p tsconfig.json --noEmit && vite build
✓ built in 1.02s
```

Upstream PGlite eval and large-chunk warnings remain. No build warnings were
silenced. The initial build had four installed-component TypeScript errors;
the final typecheck/build passes without weakening strictness.

`git diff --check -- web assets/templates/design-tokens mobile/lib/core/theme/tokens.dart`
exited 0 with no output.

Production-entry inspection found no `dist/component-preview.html` and no
preview entry strings in built JavaScript:

```text
Passed: production HTML and JavaScript exclude the component preview.
```

Local processes used:

```text
cd web && pnpm dev --host 127.0.0.1 --port 5181
VITE v8.3.5 ready
Local: http://127.0.0.1:5181/

PATIENTGPT_UAR_MODE=deterministic target/debug/patient-gpt-server
patient-gpt-server listening on http://127.0.0.1:8787 uar_mode=deterministic
```

## Browser boundary — Passed

Playwright exercised the real preview and application entrypoints against local
assets and, for the application, the existing synthetic Axum backend. No CI,
unit-only, or mocked backend result supplies acceptance evidence.

| Check | Observed result |
| --- | --- |
| Catalog parity | 63 UI modules + 15 Assistant UI modules; no missing modules in fixture inventory. Inventory alone is not runtime evidence. |
| Settled preview reflow | 320/768/1440px, light/dark: document scroll width equals viewport in all six cases. Resize measurements wait for layout/ResizeObserver settlement. |
| Flat surfaces | Zero painted border/shadow defaults in rendered component slots across the viewport/theme matrix. |
| Text contrast | 302 rendered text samples per theme; no failures, lowest 4.71:1 light and 6.79:1 dark. Canvas conversion supports computed OKLab/alpha colors. |
| Fields/placeholders | 21 text/placeholder samples per theme; no failures, lowest 5.85:1 light and 5.26:1 dark. Hidden native range controls are not text samples. |
| Focus | Distinct checkbox/radio/switch/select fills; select light focus #231F20/white and dark #FFFFFF/#14181C. Native slider-input focus changes visible thumb to primary. Chart keyboard focus fills plot region and arrow keys expose values. |
| Menu/dialog | Inverse popup 248px wide, 6px padding, 40px items, 8px corners; focused item swaps white/dark fills. Escape closes dialog and returns focus to its trigger. |
| Other portals | Popover, alert dialog, sheet, drawer, select, searchable combobox empty state, context menu, menubar, navigation popup, tooltip and toast exercised. Settled sheet remains inside viewport. |
| Toast close hover | Light #3D3839/white; dark #D5DADE/#14181C. |
| Assistant runtime | Empty, error, seeded, streaming, completed, suggestions and composer attachment states exercised locally. Attachment removal controls reflect their file names. No inference or tools run. |
| Media | Local audio/video readyState 4, duration 1 second; muted play and pause succeed. |
| Syntax | Real useHighlightedCode/Shiki fixture resolves keywords to primary and strings to cool roles in both themes; chat captures include the highlighted output. |
| Reduced motion | Zero remaining CSS animation/transition activity among inspected preview descendants with reduced motion enabled. |
| Touch emulation | 320px, coarse pointer: buttons 44px high; checkbox/radio 24px glyphs with 48px hit areas; switch 44px hit area; no horizontal page overflow. |
| Zoom | CSS zoom 2 (200%): scrollWidth/clientWidth both 1440. This is CSS zoom emulation, not an OS/browser-menu zoom claim. |
| Native inset emulation | With --host-inset-top:32px in a 900px viewport, sheet content and backdrop top=32px, height=868px. |
| Existing app | Home view renders with Mulish, no page errors, no horizontal page overflow in six width/theme cases. Session, patient and case-list API responses are 200. |
| Browser console | Final preview: 0 errors, 0 warnings. |

Captures: `preview-{320,768,1440}-{light,dark}.png`, all 15 named fixture groups
in both themes, `app-*`, `touch-320.png`, `zoom-200.png`, and
`host-inset-sheet.png`. Theme captures use the actual preview theme control so
the selected wordmark and component theme stay synchronized. `initial-debug.png`
is pre-correction evidence, not final acceptance evidence.

Independent `ui-critic` review: **Passed — bounded visual review**. Reviewed the
rendered captures and source in a separate context, identified and confirmed
repairs to sidebar fields, reasoning fades, dark assets and attachment icons.
No significant visual blockers remained. Cross-model independence was not
established. Its verdict does not independently certify keyboard/zoom/device tests.

Final independent `artifact-critic` review found no concrete blockers in the
bounded delivery/evidence artifacts. It did not independently reproduce runtime
measurements or dependency-change provenance. The final build was repeated after
wiring the syntax fixture and still exited 0.

## Scope and remaining limits

Nothing outside the approved scope was added. The focus selectors and inset rules
trace to observed invisible-focus cases and the explicit shared native-chrome
requirement. No clinical, persistence, authorization, retry or fallback guards
were introduced. The synthetic adapter's abort check only stops its local
streaming fixture.

Native Tauri rendering and physical-device behavior are **Blocked** for acceptance
in this record because they were not run. Flutter has only regenerated token
constants here. The shared web CSS is not proof of a native window or device.
The uncomfortable limitation is that most library components remain unused by
production screens; real fixture coverage and these samples do not certify every
caller override, every possible data combination, or clinical workflows.
