# W7 — `evidence-timeline` vertical slice

**Status** complete · **Date** 2026-09-05

## What was built

The reference pattern every later feature copies.

| File | Layer |
|---|---|
| `model/timeline-entry.ts` | types over the five synced tables |
| `api/timeline-api.ts` | reads from PGlite, writes to the Axum API |
| `hooks/use-evidence-timeline.ts` | loading, error, refusal, intent |
| `components/timeline-entry-row.tsx` | one criterion and its state |
| `components/evidence-timeline.tsx` | the screen |
| `components/timeline-entry-row.test.tsx` | 9 assertions |

`app/routes/evidence-timeline-route.tsx` replaced. **The other twelve routes
are untouched placeholders** — verified by import, not by eye.

One change outside the feature: `graph-provider.tsx` now exposes the PGlite
handle through `useLocalStore()`. The api layer needs the store, and a feature
opening its own PGlite would be a second database with the same name and
different contents.

## The read path and the write path are different paths

Reads come from the local store Electric keeps current (ADR-007). Writes go to
the Axum API over HTTP and **never** touch the local store, because clinical
authority is checked server-side at three layers (ADR-002) — a local write
bypasses all three. The local copy updates when the change syncs back, which
makes the round trip the confirmation rather than an optimistic guess.

No query cache anywhere (ADR-001, `audit.sh` check 2). The synced store already
answers "is this stale?".

## Four states, told apart

`unavailable` / `loading` / `error` / empty are rendered distinctly. An empty
list and a failed read look identical on screen, and one means *no evidence
recorded* while the other means *we do not know*. A failure that renders as an
empty list is how a case looks clean when it is unknown.

## An unknown state throws rather than defaults

`toEvidenceState` refuses a value outside the union:

> `Unknown evidence state "x". The synced schema and the client disagree;
> refusing to guess which of met/gap/void was meant.`

A silent fallback to `gap` would tell a coordinator to argue a document nobody
has confirmed exists; defaulting to `met` would be worse. Neither guess is
recoverable by the person reading the screen.

## The criterion text is honestly missing

`policy_criteria` is **not** among the five tables W6 sent to the browser, so
the client holds the criterion's id and not its sentence. `criterionLabel` is
therefore `string | null`, and the row renders *"Criterion unavailable
offline"*.

The alternative — echoing the UUID into the label slot — reads as a data bug to
a clinician and as working software to a developer. This slice does not widen
W6's subset to make the screen look finished.

## An unsourced assertion is visible

A `met` entry with no citation is flagged in the row. `aso.css:368` calls an
uncited assertion a rendering bug; `isUnsupported()` names the condition once so
callers do not each re-derive it slightly differently.

## The guard was proved to fail

Sabotage: collapse `void` into `gap` at render — the "two states are enough"
refactor ADR-003 exists to prevent.

```
× renders "Obtain it", never "Argue it"
× labels itself "Not documented", not "Not met"
× carries a distinct state marker from a gap row
  Tests  3 failed | 6 passed (9)
```

Three independent assertions caught it. Reverted; 9/9 pass.

The failure being prevented is quiet: a `void` shown as a `gap` tells a
coordinator to ARGUE a document that does not exist instead of OBTAINING it.
Both look like work getting done.

**`audit.sh` check 3 was also proved to fail.** Adding a bare `fetch()` to the
timeline component produced:

```
✗ network call in component: web/src/features/.../evidence-timeline.tsx
```

Reverted. The layering gate is real, not decorative.

## Verification — observed

```
pnpm --dir web test        Test Files 4 passed · Tests 35 passed (35)   [26 + 9 new]
pnpm --dir web typecheck   0 errors
pnpm --dir web lint        clean
pnpm --dir web build       ✓ built in 5.23s
bash scripts/audit.sh      audit: PASS (checks 1, 2, 3, 6 all ✓)
```

## Not verified

- **No data has ever flowed through this.** Every test uses constructed
  entries; `readTimeline` has never run against a populated PGlite, so its two
  SQL statements are typechecked and unexecuted. The slice is **Build-only**.
- The write path has no server to answer it. `timelineApi.reassess` is
  untested against a live endpoint and no component calls it yet.
- Nothing has been rendered in a browser or read by a screen reader.
