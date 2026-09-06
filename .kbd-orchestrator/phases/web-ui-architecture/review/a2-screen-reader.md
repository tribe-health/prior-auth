# A2 — Screen-reader pass on the evidence timeline

**Date** 2026-09-06 · **Method** live DOM inspection in Chrome against the
running dev server, reading what assistive technology actually receives
(accessible name computed by removing `aria-hidden` subtrees).

## The ADR-003 requirement holds

Every evidence state announces its LABEL. Colour is not the signal, and neither
is shape — both are reinforcement.

| state | announced |
|---|---|
| met | "Met" / "0 met" |
| gap | "Not met" / "0 not met" |
| void | "Not documented" / "0 not documented" |

All six chips on the page carry a shape marker (circle / square / diamond), and
**all six mark it `aria-hidden="true"`** — so the shape is a visual channel only
and is not announced a second time. Verified, not assumed.

## Structural checks — no findings

- exactly one `<main>` landmark (a nested `main > main` was fixed earlier)
- both `<nav>` elements carry an accessible name ("Sections", "Case pipeline")
- heading order starts at `h1` with no skipped level
- every `<button>` has an accessible name
- 12/12 focusable elements show a visible focus ring

## One defect found and fixed

**Locked pipeline steps announced their state but not the reason.**

Steps 07–10 rendered `aria-disabled="true"` with the explanation in `title`.
A tooltip is announced inconsistently by screen readers and is invisible to
touch users, so what reached a non-sighted coordinator was the word "Locked"
and nothing about what to do next.

Fixed in `web/src/app/shell/app-shell.tsx`: each blocked step now carries
`aria-describedby` pointing at an `sr-only` element holding the same sentence —
*"Awaiting surgeon affirmation. Step 06 must be completed first."*

Verified in the browser on all four locked steps: `describedBy` resolves, the
description text is present, and the element is visually hidden.

A regression test was added to `app/navigation/pipeline.test.ts` asserting the
reason names both what is missing and which step supplies it.

## Not covered

No actual screen reader was driven (VoiceOver / NVDA / JAWS). This pass reads
the accessibility tree and computed accessible names, which is where these
particular defects live, but it does not prove announcement order or verbosity
in a specific reader. That remains **unverified**.
