---
name: tauri-custom-titlebar
description: ALWAYS invoke when building, styling, or debugging a Tauri desktop window frame — replacing the OS title bar with a branded one, adding minimize/maximize/close controls, or making a header draggable. Also invoke before putting ANY title bar in a web or mobile build, because the desktop one does not belong there. Triggers on titlebar, title bar, window chrome, window decorations, decorations false, startDragging, data-tauri-drag-region, traffic lights, window controls, minimize maximize close, frameless window, custom header, drag region.
---
<!-- TJ-ARCH-MOB-001 compliant -->

> **Binding:** Prefer simple, surgical, strongly typed changes; preserve strict
> layering and verify dependency versions. When installed in a project, also
> obey that project's `AGENT_BASE_RULES.md`; this skill remains self-contained.

# Tauri Custom Title Bar

Replacing the OS title bar is the default for a branded Tauri app: the native bar
cannot carry your lockup, your palette, or your typography, and it looks pasted-on
above a designed surface. This skill covers doing it correctly on desktop — and,
just as importantly, **not** doing it on the surfaces where it is wrong.

## The decision comes first

A custom title bar is a **desktop-window** concern. Before writing one, decide per
surface. Never emit it everywhere by default:

| Surface | Window chrome? | What to do |
|---|---|---|
| **Tauri desktop** (macOS/Windows/Linux) | You own it (`decorations: false`) | Full custom title bar — this skill |
| **Plain web / PWA (desktop browser)** | Browser owns it | **No title bar.** The browser already draws one. Add an in-app header only if the design needs a nav/brand strip — with no window controls, no drag region |
| **Mobile web / PWA (phone)** | OS + browser own it | **No title bar.** Use a platform app bar (see the mobile navigation guidance) |
| **Flutter mobile** | OS owns it | **No title bar.** `AppBar` / `NavigationBar` per platform convention |

If the same React bundle serves both Tauri and the web — the common case in this
architecture — the title bar must be **conditionally rendered**, not unconditionally
imported. See "Surface gating" below; getting this wrong is a hard crash, not a
cosmetic bug.

When the design wants a branded strip on web too, offer the user the choice rather than
assuming: (a) no header at all, (b) a plain in-app header sharing the desktop bar's
brand tokens but none of its window controls, or (c) a platform app bar on mobile. All
three are legitimate; silently shipping the desktop bar to a browser is not.

## Desktop implementation

### 1. Turn off the native chrome

```jsonc
// src-tauri/tauri.conf.json
"app": {
  "windows": [
    {
      "title": "AppName",
      "decorations": false,   // OS draws nothing — you own the whole frame
      "transparent": false
    }
  ]
}
```

Once `decorations: false` is set you owe the user **everything** the OS was providing:
drag-to-move, minimize, maximize/restore, close, and the accessibility affordances
attached to them. Do not set this flag until the component below exists.

### 2. Platform-correct window controls

Placement is not a style choice — it is muscle memory:

- **macOS** — close/minimize/maximize as traffic lights, **left**, in that order.
- **Windows / Linux** — minimize/maximize/close, **right**, in that order.

Detect with `platform()` from `@tauri-apps/plugin-os` and branch. Shipping Windows-style
controls on macOS reads as broken to every Mac user.

### 3. Drag: `data-tauri-drag-region` is not enough by itself

Mark the drag surface with the attribute **and** call `startDragging()` on mousedown:

```tsx
const startDrag = (e: React.MouseEvent) => {
  if (e.button !== 0) return          // left button only — right-click is the OS menu
  void appWindow?.startDragging()
}

<header data-tauri-drag-region onMouseDown={startDrag} className="...">
```

**Why both:** Tauri's built-in webview listener fires reliably only on a direct
mousedown against the element carrying the attribute. Flex spacers, wrappers, and the
gaps around a centered lockup are *not* that element, so with the attribute alone the
bar has dead zones the user experiences as "drag randomly doesn't work." The explicit
call makes the whole header draggable. Guard on `e.button !== 0` so right-click still
reaches the system menu.

### 4. Surface gating (the crash you will otherwise ship)

Every Tauri API import throws **synchronously at module scope** in a plain web page —
there is no `__TAURI_INTERNALS__` bridge. So resolve the window once, behind `isTauri()`:

```tsx
import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow, type Window as TauriWindow } from '@tauri-apps/api/window'

const appWindow: TauriWindow | null = isTauri() ? getCurrentWindow() : null
```

and wrap `platform()` in a try/catch as well. Controls then render only when
`isTauri()` is true; the optional-chained `appWindow?.minimize()` calls are inert on
web. This is what lets one bundle serve both targets — but it is a safety net for the
*component*, not a substitute for the **surface decision** at the top of this skill.

### 5. Accessibility

Removing OS chrome removes OS-provided accessibility. You must replace it:

- `aria-label` on every control ("Close", "Minimize", "Maximize") — an icon-only or
  bare-color button is unlabeled to a screen reader.
- Controls must be real `<button>`s: keyboard-reachable and activatable.
- `select-none` on the bar so dragging never starts a text selection.
- Keep hover/active states visible — the OS gave these for free; now you owe them.
- Meet contrast on the bar's foreground against its own background, not the page's.

Run the `a11y-gate` skill over the result like any other UI.

## Reference implementation

The scaffolded `desktop/src/shared/components/Titlebar.tsx` is the worked example:
`isTauri()`-gated window resolution, macOS/Windows control variants, explicit
`startDragging()`, aria-labeled controls, brand lockup centered via flex spacers
that are draggable because of the explicit call. Read it before writing a new one —
and prefer adapting it over starting from scratch (Rule 2, Rule 3).

## Checklist

- [ ] Surface decided deliberately — desktop only; web/mobile got their own answer
- [ ] `decorations: false` set **and** a title bar component actually exists
- [ ] Control order correct per platform (macOS left / Windows-Linux right)
- [ ] `data-tauri-drag-region` **and** `startDragging()` on left-button mousedown
- [ ] All Tauri API access gated behind `isTauri()` — web bundle does not throw
- [ ] Every control has an `aria-label` and is a focusable `<button>`
- [ ] Minimize, maximize/restore, close, and drag all verified by hand in a real window
