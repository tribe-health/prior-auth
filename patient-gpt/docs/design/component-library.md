# PatientGPT component library

The shared React library follows `patient-chat/tokens.css`, the companion layout
styles, the storyboard, and the selected PatientGPT brand board. The generated
theme is derived from `assets/templates/design-tokens/tokens.toml`. Change that
source and regenerate both platform outputs; never edit generated theme files.

## Styling contract

Use Mulish for controls and prose, Playfair Display 600 for display titles at
20px or larger, and JetBrains Mono for metadata and code. Use role tokens for
light and dark themes. The brand `--accent` remains the warm action color;
shadcn hover/selection utilities use their own surface alias.

Flat 2.0 separates regions by fill and spacing. Controls have 5px corners,
regions 8px, tags 4px, composers 24px, and user bubbles 18px. Preserve circular
icon controls where intended. Use visible fill/foreground swaps for focus.
Menus and tooltips use inverse surfaces; fields use contrasting field roles.
Transitions use the reference easing with 200ms entry and 140ms exit. Reduced
motion removes decorative movement, shimmer, and pulsing.

Keep evidence labels and canonical shapes: **Met (circle/check)**,
**Gap (diamond/minus)**, **Void (dashed circle)**. JSX fixtures use the shared
`StateChip` component. Preserve the
existing semantic evidence colors. New default chart and syntax colors stay in
the warm/cool/neutral brand roles. Never assign clinical meaning through color
alone. Native audio/video content and browser-owned media controls retain their
native behavior.

Component exports, props, variants, keyboard semantics, and composition remain
public interfaces. Caller-provided styles can change appearance; library
conformance applies to defaults and included compositions. New shadcn installs
or updates require a branding review of colors, type, geometry, borders,
shadows, focus, motion, states, portals, and mobile targets before acceptance.

## Local preview

From `web`, run `pnpm dev`, then open `/component-preview.html` on the URL Vite
prints. This is a separate development HTML entry. The production entry does
not import it and the normal Vite production build does not include it.
If port 5173 is already in use, run `pnpm dev --port 5181` and open
`http://localhost:5181/component-preview.html`.

The searchable inventory maps 63 UI modules and 15 Assistant UI modules to real
fixture compositions. Each section lists available states and the actions
needed to reveal them. This inventory does not claim those states were tested.
The preview uses shared `app.css`; its own CSS only arranges fixtures.

The Assistant UI section uses an isolated `useLocalRuntime` adapter with
synthetic messages. It has no network, tool execution, persistence, or inference
endpoint. Buttons restore seeded messages and reveal empty, error, streaming,
suggestions, and composer attachment states. Expand reasoning and tool groups
to inspect their contents. Thread actions affect only the preview runtime.
Audio is a locally generated one-second quiet tone; video is a one-second solid
brand-colored frame. Downloads contain only synthetic text.

## Acceptance evidence

At the completed implementation boundary, run the local web build and inspect
the preview plus the existing application. Record the exact command/output and
the artifact paths. Use **Passed**, **Build-only**, **Blocked**, or **Failed** for
each scope; a successful build is Build-only for visual acceptance.

Check 320px, 768px, and desktop widths, both themes, 200% zoom, keyboard focus
and restoration, overlay positioning, reduced motion, coarse-pointer targets,
overflow, and rendered contrast. Exercise all fixture controls and inspect
loading, invalid, disabled, selected, and empty states. Request independent
design/accessibility review only after the complete implementation set exists.
Record Tauri and physical device gaps separately from browser evidence.

The uncomfortable limitation: most library modules are not used by current
application screens. Application screenshots alone cannot establish library
conformance, and a fixture inventory alone cannot establish runtime coverage.
