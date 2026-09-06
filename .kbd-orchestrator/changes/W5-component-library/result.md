# W5 — Base component library under `shared/ui`

**Status** complete · **Date** 2026-09-05

## What was built

| File | Purpose |
|---|---|
| `shared/ui/evidence-state-chip.tsx` | one evidence state, on three channels |
| `shared/ui/evidence-counts.tsx` | the met/gap/void summary |
| `shared/ui/citation-chip.tsx` | a source, or an explicit void |
| `shared/ui/index.ts` | the barrel, and why it is short |
| `shared/ui/evidence-state-chip.test.tsx` | 8 rendering assertions |

**Three components, not sixty-one.** The plan says promote on demand, and
nothing beyond the evidence vocabulary has a caller yet. A wrapper with no
reader is a maintenance cost that looks like progress.

## The prototype encodes state on three channels, not two

The plan asked for a text label with colour as reinforcement. Reading
`assets/aso.css:357-362` turned up a **third** channel already in the design
and not mentioned in the plan — a shape per state:

```css
.chip-met::before  { border-radius: 999px; }              /* circle  */
.chip-gap::before  { border-radius: 1px; }                /* square  */
.chip-void::before { border-radius: 1px; transform: rotate(45deg); }  /* diamond */
```

That is the channel that survives greyscale, monochrome printing, and every
form of colour blindness — and unlike colour it needs no stylesheet to be
correct. It is implemented, and asserted, rather than treated as decoration a
refactor may drop.

So each state carries: **label** (always), **shape** (always), **colour**
(last). Remove any one and the state stays unambiguous.

## Contrast, measured rather than assumed

Computed against WCAG 2.x relative luminance:

| state | foreground | on white | on own surface |
|---|---|---|---|
| met | `#1E6F4E` | 6.11:1 | 5.36:1 |
| gap | `#A85417` | 5.32:1 | 4.71:1 |
| void | `#5B5F66` | 6.42:1 | 5.59:1 |

Dark theme on its own surfaces: 8.50 / 6.79 / 6.95:1. Every pairing clears
4.5:1 in both themes, at any size.

**A correction to the plan:** ember `#DF7C35` measures **2.97:1** on white, not
the 3.08:1 the plan states. Worse than recorded, so the rule stands more firmly
— it fails AA at every size and fails AA-Large below 24px/19px-bold.

The token source had already resolved this: `tokens.toml:58` sets `statusGap`
to `#A85417`, and the ember survives only as `--color-accent-vivid`. **These
components never reference that token.** The risk here was not choosing a bad
colour; it was reaching past a correct token for a more vivid one.

## Zero is rendered, not omitted

`EvidenceCountsSummary` renders all three states even at zero. The absence of a
number and a zero are different claims: one says nothing was checked, the other
says something was checked and found empty. Collapsing them is how a chart
looks complete when it was never examined. Filtering zeroes is the obvious
tidy-up, so it is a test, not a comment.

## A citation is never silently empty

`aso.css:368` states the rule as a comment — *"An assertion without one is a
rendering bug."* `CitationChip` takes `string | null` and renders the void
treatment for `null`, because a citation that renders as nothing is
indistinguishable from one the layout clipped. The type makes the absent case
unskippable.

## Both guards were proved to fail

Not assumed — sabotaged, observed, reverted.

**1. Collapse the shape channel** (`void` loses `rotate-45`, so gap and void
differ only by colour):

```
× distinguishes the three states by SHAPE, not only by colour
  Tests  1 failed | 7 passed (8)
```

**2. Hide zero counts** (`.filter((s) => counts[s] > 0)` — the plausible tidy-up):

```
× renders a zero rather than omitting the state
  Tests  1 failed | 7 passed (8)
```

Both reverted; verified `sabotage remaining: 0` before the verify block ran.

## Test infrastructure added

The plan's verify step requires a rendering check, and the project had no DOM
test environment — the 18 existing tests are pure logic. Added
`@testing-library/react@16.3.3`, `@testing-library/dom@10.4.1`, `jsdom@30.0.1`
(dev only), and `test.environment: 'jsdom'` in `vite.config.ts`.

Applied to **all** tests rather than per-file. The logic tests pay a small
startup cost; the alternative is a pragma that the next component test forgets,
failing with "document is not defined" instead of a clear message.

## Verification — observed

```
pnpm --dir web test        Test Files 3 passed · Tests 26 passed (26)   [18 + 8 new]
pnpm --dir web typecheck   0 errors
pnpm --dir web lint        clean
pnpm --dir web build       ✓ built in 4.05s
bash scripts/audit.sh      audit: PASS (checks 1 and 6 both ✓)
```

## Not verified

- **Nothing has been seen in a browser.** The contrast numbers are computed
  from the token values, not sampled from rendered pixels, and no screen
  reader has been run. The visual result is **Build-only**.
- The build warns that a chunk exceeds 500 kB. Pre-existing, untouched here,
  and W5 adds three small components — but it is unmeasured and left standing.
