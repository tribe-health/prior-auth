# W1 — Adopt `entity-graph-react@^4.0.0`

**Status** complete · **Date** 2026-09-05

## What changed

| File | Change |
|---|---|
| `web/package.json` | `prometheus-entity-management@^3.2.0` → `entity-graph-react@^4.0.0` |
| `web/src/components/assistant-ui/elements/tooltip-icon-button.tsx` | `delayDuration` → `delay` |
| `web/src/components/ui/scroll-area.tsx` | removed unused `React` import |

## Verification — observed

```
resolved version                4.0.0        (installed, not the requested range)
published shape                 type: module | main: ./dist/index.mjs
                                require condition: absent
old name in web/src             no matches
old name in web/package.json    absent

runtime import from web/        203 exports; useEntity present
                                EntityColumnDef absent at runtime (type-only) ✓

pnpm --dir web typecheck        0 errors
pnpm --dir web lint             clean
pnpm --dir web build            ✓ built in 3.54s (index 277.15 kB, gzip 88.80 kB)
bash scripts/audit.sh           audit: PASS
```

## Two pre-existing failures, fixed

Baseline typecheck was **already red** before this change — 2 errors in vendored
files, unrelated to the entity graph:

```
tooltip-icon-button.tsx(25,22)  TS2322  'delayDuration' does not exist on TooltipProviderProps
scroll-area.tsx(1,13)           TS6133  'React' is declared but its value is never read
```

Recorded as baseline first, then confirmed unchanged immediately after the
dependency swap — so the swap introduced nothing. Both were then fixed, because
`pnpm build` runs `tsc -b` and would have blocked every downstream change.

The tooltip error is a real API rename: `@base-ui/react@1.7.0` declares
`delay?: number` on `TooltipProvider` (`tooltip/provider/TooltipProvider.d.ts:15`),
not `delayDuration`. Read from the installed types rather than guessed.

## What this establishes for the phase

**The production web build now passes.** `README.md` lists it under "Not yet
verified"; that line is now stale for the web surface. Tauri and physical-device
runs remain unverified and are still correctly **Build-only**.

The entity graph is now installed, ESM-only, and importable — but still not
imported by any application code. W6 is where that changes.
