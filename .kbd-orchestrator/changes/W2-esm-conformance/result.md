# W2 — ESM conformance check

**Status** complete · **no changes required** · **Date** 2026-09-05

## Result: the web app was already conformant

The child phase's handoff asked the parent to add an ESM audit, because
`@prometheus-ags/*` went ESM-only at 4.0.0. The audit ran and found nothing to
convert.

```
web/package.json  "type"                    module
CJS idioms across all of web/               0 matches
  (require( · module.exports · exports. · __dirname · __filename)
  searched: *.ts *.tsx *.js *.jsx *.mjs *.cjs *.json
  excluded: node_modules, dist
.cjs files under web/                       none
test runner                                 none configured
vite.config.ts                              already uses node:url + fileURLToPath
```

W1's build is the practical confirmation: `pnpm --dir web build` succeeded
against the ESM-only dependency (`✓ built in 3.54s`).

## Why this is recorded rather than deleted

A check that finds nothing is a result. Deleting the change would leave the
phase unable to answer "did anyone verify the ESM move was safe for this app?"
— and the next person would have to redo it.

The plan anticipated this: *"If this change finds nothing to fix, say so plainly
and close it. Do not manufacture work to justify the change existing."*

## Why the app was already conformant

`web/` is a Vite + React 19 application, scaffolded ESM-native. Vite requires
ESM for config and source, so the codebase never had a CommonJS surface to lose.
The ESM-only dependency change was a real risk **for repos with Node-side
tooling**; this one has none — no test harness, no build scripts beyond Vite, no
`.cjs` config.

## Residual risk

If a test runner is added later (Vitest is the natural choice and is already
used elsewhere in this monorepo's sibling projects), it must be configured ESM.
That is a note for whoever adds it, not work for this phase.
