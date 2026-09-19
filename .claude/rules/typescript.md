---
paths: ['**/*.ts', '**/*.tsx', '**/package.json', '**/tsconfig.json']
---

# TypeScript / React

Loaded when a TypeScript file is read. Not resident.

Surface: `web/`. React 19.2, react-router 7.9, Vite 7.1, Tailwind 4.1,
TypeScript 7.0, oxlint. Package manager is **pnpm**, and the project root for
these commands is `web/`, not the repository root.

| Tier | Commands |
|---|---|
| T0 every edit | `pnpm --dir web typecheck`; `pnpm --dir web lint` |
| T1 unit complete | targeted test run for the touched file |
| T2 phase complete | `pnpm --dir web build`; `bash scripts/audit.sh` |
| T3 milestone only | e2e; visual regression; bundle-size gate |

`pnpm --dir web lint` runs oxlint. `typecheck` runs `tsc --noEmit` — that is the
real type gate, and `build` runs `tsc -b && vite build`.

## Hard rules

- Cache `.tsbuildinfo`. Incremental typecheck drops substantially with it.
- Watch mode is the inner loop, not a gate. A gate is a command that exits.
- Dependencies are pinned exactly for the framework core (react, react-dom,
  react-router, zustand, vite, tailwindcss, typescript, oxlint). `versions.toml`
  is the pin authority.
- No `console.log` in `web/src`. No explicit `any`. Both are blocking
  constraints in `.kbd-orchestrator/constraints.md`.

## No query cache

**Do not add TanStack Query, SWR, or Apollo cache.** `scripts/audit.sh` check 2
uses `scripts/check-query-cache-dependencies.py` to reject direct declarations
in `web/package.json` and transitive paths in the resolved pnpm lock graph.

A query cache models *requests* — "is this response stale?" This application
models *data*, and the entity graph already owns freshness. A cache on top
re-answers that question in the wrong layer, with a second source of truth that
drifts. The failure is not dramatic: it is a list row and a detail panel
disagreeing about the same case, which here means two clinicians reading
different evidence counts.

What replaces it: a normalized entity graph. Lists hold **ordered identifiers
only**; every view re-joins the same record at render time. One write updates the
queue row, the detail panel and the badge together, because they were never
separate copies.

Optimistic updates are an overlay on the canonical record, not a cache write, so
a rollback restores one value rather than reconciling two.

Transient interaction state — selection, filters, stream buffers — lives in
Zustand. **Anything durable is an entity.**

A developer arriving from a React codebase will reach for `useQuery`. The audit
refuses it with a pointer to `docs/architecture/adr-001-no-query-cache.md`. That
is the intended behaviour, not an obstacle to work around.

## Layering

```
Component → feature hook → feature api → shared http client → transport
```

`scripts/audit.sh` check 3 fails on a bare `fetch(` or `invoke(` inside
`web/src/features/*/components/*.tsx`. A component that reaches for the network
has skipped two layers and is no longer testable in isolation.

Organize by capability under `features/<domain>/`, not by technical layer.
Components render and submit intent. No business rule exists only in a component.

## Filenames

All filenames under `web/src` are **kebab-case**. `scripts/audit.sh` check 1
enforces it. Mixed casing breaks case-insensitive filesystems in ways that only
appear on someone else's machine.

## Theme is generated

`web/src/theme.css` carries a `DO NOT EDIT` banner and is generated from
`assets/templates/design-tokens/tokens.toml`. Edit the source, then run
`bash scripts/gen-design-tokens.sh .`. A hand-edit is reverted silently by the
next generator run. `scripts/audit.sh` check 5 verifies the banner survives.

## Evidence state

`web/src/shared/model/evidence-state.ts` holds a three-member union:
`'met' | 'gap' | 'void'`. The count DTO names `void` explicitly. Check 6 greps
for `'void'` here — if the union ever loses it, the product has started telling
coordinators to argue a document that does not exist.

Every state renders with a text label. Colour is reinforcement, never the signal.
