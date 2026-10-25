---
name: mobile-navigation
description: ALWAYS invoke before adding, moving, or restyling top-level navigation on ANY surface (Flutter NavigationBar/TabBar, React/PWA nav, Tauri shell) — top-level destinations belong in a BOTTOM bar on both iOS and Android, and the switch to a rail is by WIDTH, never by platform. Also invoke before writing any Platform.isIOS / navigator.userAgent check in navigation code, because that check is wrong. Triggers on navigation, nav bar, navigation bar, bottom nav, tab bar, tabs, NavigationBar, NavigationRail, BottomNavigationBar, TabBar, rail, sidebar, app shell, destinations, GoRouter ShellRoute, TanStack Router layout, PWA navigation, mobile layout, responsive nav.
---
<!-- TJ-ARCH-MOB-001 compliant -->

> **Binding:** Prefer simple, surgical, strongly typed changes; preserve strict
> layering and verify dependency versions. When installed in a project, also
> obey that project's `AGENT_BASE_RULES.md`; this skill remains self-contained.

# Mobile Navigation Placement

## The rule

**Top-level destinations go in a bottom bar. On every platform. No platform check.**
Switch to a rail by **window width**, not by OS.

## Why (this is the part that gets it wrong)

It is tempting to believe iOS and Android disagree — iOS "has bottom tabs", Android
"has top tabs". **They do not disagree.** Both platforms' own guidance puts top-level
destinations at the bottom:

| | Guidance | Placement | For |
|---|---|---|---|
| iOS | [HIG · Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars) | "floats above content at the **bottom of the screen**" | "navigate between **top-level sections**" |
| Android | [M3 · Navigation bar](https://m3.material.io/components/navigation-bar/guidelines) | "**always placed at the bottom**" | "**top-level destinations**", 3–5 of them |

### The trap: Android's top tabs are a different component

M3 has a tabs component that sits at the top, which is where the "they disagree" idea
comes from. M3 draws the line by **purpose, not placement**
([M3 · Tabs](https://m3.material.io/components/tabs/guidelines)):

> Use navigation for distinct pages and **tabs for related content within a page**.

M3's own illustration puts tabs *inside* a navigation-bar destination. So:

- **App-level destinations** (Chat, Notes, Memory) → bottom bar. Both platforms.
- **Content switching within one destination** → top tabs (Android) / segmented control
  (iOS). Subordinate to the bottom bar, not a replacement for it.

M3 also caps this: <3 destinations → use tabs, not a nav bar; >5 → tabs or a rail.

## What DOES vary: form factor

Both platforms abandon bottom placement as the window widens — Apple moves the tab bar
to the **top** on iPadOS (or a sidebar); M3 swaps the bar for a **rail** at expanded
widths. That is the only real split, and it is about **width**, not OS.

Breakpoint: **600px** — M3's compact→medium
[adaptive breakpoint](https://m3.material.io/foundations/layout/canonical-examples/overview)
boundary. Note this is *not* Tailwind's `sm:` default (640px); set the token so the
class means the spec'd value:

```css
@theme { --breakpoint-sm: 600px; }
```

## Red flags — stop if you are about to write these

| You're writing | Why it's wrong |
|---|---|
| `Platform.isIOS` / `Platform.isAndroid` in nav code | Implies a divergence that doesn't exist at phone width. |
| `navigator.userAgent` / UA-sniffing for nav | Same, plus Client Hints deliberately reduce that signal. Two nav trees, one unreliable input, nobody tests both. |
| A top tab bar for app-level destinations | Wrong on iOS (never contemplated) and wrong on Android (that's the tabs component, for in-page content). |
| Nav state mirrored into a store/provider | Two sources of truth for "where am I" — the bar and the route drift apart. Derive from the router. |
| Two destination lists (one per chrome) | Labels/icons/paths drift silently. One list. |

## Flutter

```dart
// ONE list — labels, icons, and paths cannot drift apart.
const _tabs = <(String, IconData, String)>[
  ('/chat', Icons.chat_bubble_outline, 'Chat'),
  ('/memory', Icons.memory, 'Memory'),
];

// Selected index is DERIVED from the router, never stored.
final location = GoRouterState.of(context).matchedLocation;
final index = _tabs.indexWhere((t) => location.startsWith(t.$1));

Scaffold(
  body: child,
  bottomNavigationBar: NavigationBar(
    selectedIndex: index < 0 ? 0 : index,
    onDestinationSelected: (i) => context.go(_tabs[i].$1),
    destinations: [
      for (final (_, icon, label) in _tabs)
        NavigationDestination(icon: Icon(icon), label: label),
    ],
  ),
);
```

`GoRouter`'s `ShellRoute` owns the shell. Navigation state belongs to the router, not a
Riverpod provider.

## React / Tauri / PWA

The same bundle serves desktop and mobile web, so the width switch does all the work:

```tsx
// One list, two chromes. Never a platform check.
<div className="flex h-full flex-col sm:flex-row">
  <nav aria-label="Main (rail)" className="hidden sm:flex …">{items}</nav>
  <main className="min-h-0 flex-1">{children}</main>
  <nav aria-label="Main (bottom bar)"
       className="flex pb-[env(safe-area-inset-bottom)] sm:hidden">{items}</nav>
</div>
```

- **Label the two navs distinctly.** Only one is visible, but two identically-named
  "Main" landmarks are ambiguous to a screen reader.
- **`env(safe-area-inset-bottom)`** on the bottom bar, or it sits under the iOS home
  indicator when installed as a PWA.
- **Derive the active route** (`useRouterState({ select: s => s.location.pathname })`);
  don't mirror it into a store.
- **Exact-match the index route**: `path === '/' ? pathname === '/' : pathname.startsWith(path)`
  — otherwise `/` lights up everywhere.

## Mobile web / PWA — one convention, decided

There is **no authoritative guidance** on whether a PWA should mimic its host platform's
nav. web.dev's [App design](https://web.dev/learn/pwa/app-design) chapter doesn't address
navigation placement at all, and its only platform-adaptation advice is cosmetic and
internally inconsistent (icons platform-*agnostic*, fonts platform-*native*).

So this is an engineering decision, and it's already made: **one convention, no
detection.** It follows from the convergence above — a single bottom bar satisfies both
HIG and M3, so adapting would buy nothing while costing UA-sniffing and double testing.

## Scope note

This skill owns **placement and structure** of navigation. It does not own colors,
spacing, or typography (`hybrid-design-tokens`), ContentBlock rendering
(`content-block-ui`), or the desktop window frame (`tauri-custom-titlebar`).
