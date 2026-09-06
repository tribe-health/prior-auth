---
type: SessionRecord
id: karpathy-session-8a54e51a5abef280
title: Karpathy session 8a54e51a5abe
tags:
- karpathy
- session-learning
sources:
- session:4255f8bd-9159-4844-9991-f6a52275c1c0
timestamp: 2026-09-05T13:07:56.498821+00:00
created_at: 2026-09-05T13:07:56.498821+00:00
updated_at: 2026-09-05T13:07:56.498821+00:00
revision: 0
---

## Delta

## Published — 4.0.0, all 13 npm packages plus pub.dev

Verified against the registry, not assumed:

```
all 13 npm packages           4.0.0, latest tag correct
entity_graph_flutter          4.0.0 uploaded to pub.dev
verify-no-workspace-leak      all 13 free of workspace: protocol
alias ^4.0.0 dependency       resolves to entity-graph-react@4.0.0
published shape               "type": "module", no require condition,
                              all 3 entrypoints intact
npm deprecate                 live on the alias, points at the new name
```

The `no-workspace-leak` check ran **against the registry** — that's the one that would have caught the 3.0.0 incident, and it's clean.

### I was wrong about the failed publish

I reported `entity-graph-react` as 404 and told you the alias was uninstallable. It had published fine — the 404 was propagation lag on a brand-new package name. Your `EPUBLISHCONFLICT` error was the proof.

Worse, that same cold read showed `entity-graph-sync` and `entity-graph-solid` at 3.2.0, which I passed on as a partial publish. Also cache. I diagnosed a broken release from one uncached query and should have re-checked before alarming you. Logged so the next person doesn't repeat it.

### Two gates that had quietly stopped working

`verify:binding-singletons` builds a deliberately-incompatible "fake core" to prove bad peers get rejected — pinned at a literal `4.0.0`, chosen back when the real packages were 3.x. The moment this release hit 4.0.0, the fake became *compatible* and the test could no longer fail. It crashed rather than passing silently, which was luck. Now derived from the real core's major.

Same class in the contract validator: hardcoded `major !== 3`, now read from the contract's own version policy.

### Flutter caught a real omission

pub.dev's dry run found the CHANGELOG never mentioned 4.0.0 — fixed with the actual migration notes. It also flagged the exact runtime pins as too tight, and it was right: this is a library, and an exact pin forces one Riverpod version on every consumer. Loosened to carets, re-verified (`analyze` 4 pre-existing hints, 73 tests pass). `dev_dependencies` stay exact — the analyzer/codegen graph really is a coherent set.

### What consumers need to know

**Anything using `require()` on these packages must switch to `await import(...)`.** That's the breaking change, and it's why this is a major rather than the 3.3.0 we planned.

The parent phase `web-ui-architecture` is still paused. Its plan named `@prometheus-ags/entity-graph-react` — which now exists, at 4.0.0, ESM-only. Ready to resume when you are.

## Root Cause

No explicit root-cause section was captured; preserve this as a session record, not an inferred diagnosis.

## Corrective Actions

Review and promote only reusable findings.

## Session Metadata

- Harness: claude-code
- Session: 4255f8bd-9159-4844-9991-f6a52275c1c0
- Captured: 2026-09-04T18:33:04.552626Z
- Project: /Users/gqadonis/Projects/TribeHealth/kevin/prior-auth

## Changed Paths

- No changed paths detected.
