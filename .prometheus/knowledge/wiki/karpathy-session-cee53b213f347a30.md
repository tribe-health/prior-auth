---
type: SessionRecord
id: karpathy-session-cee53b213f347a30
title: Karpathy session cee53b213f34
tags:
- karpathy
- session-learning
sources:
- session:4255f8bd-9159-4844-9991-f6a52275c1c0
timestamp: 2026-09-05T14:40:00.630923+00:00
created_at: 2026-09-05T14:40:00.630923+00:00
updated_at: 2026-09-05T14:40:00.630923+00:00
revision: 0
---

## Delta

Completed change 6 of 8: W6-entity-graph-sync

## W6 done — the open question is answered, and the answer is not what ADR-007 expected

```
test        6 passed (6)      typecheck  EXIT=0
lint        clean             build      ✓ 3.18s
audit.sh    PASS
```

### The privacy class doesn't exist

ADR-007 asked whether Electric's shape authorization could express the per-record privacy class, or whether it had to live in Axum. **Neither** — I measured it:

```
privacy/lane column in the five slice tables    none
grep privacy_class|lane across schema.sql       0 matches
build-order.md phase 1                          "partial — lane and privacy
                                                 class per table not yet assigned"
```

The build order already says this. The question was malformed: it asked which layer enforces a classification nobody has assigned yet.

What Electric **can** do is a per-table `where` predicate, and `createTenantScopedElectricAdapter` **fails closed** — it throws if a table lacks `tenantColumn` or the tenant id isn't a UUID. That's real enforcement at tenant granularity. So I implemented tenant scoping, the strongest boundary the schema currently supports, and recorded the gap rather than simulating a control.

### Table-level exclusion wasn't enough

The plan said "five tables." Reading their DDL showed three carry PHI **in columns**:

| Column | Why absent |
|---|---|
| `evidence_citations.quote` | verbatim chart excerpt |
| `case_evidence.rationale` | clinician free text |
| `documents.patient_id`, `author_name`, `author_npi` | identifiers |
| `documents.storage_uri` | would let the browser fetch chart content outside the audited path |
| `documents.data` | untyped jsonb — can't be shown PHI-free |

Each recorded in `OMITTED_COLUMNS` **as data with a reason**, so the test asserts it and a reviewer can diff it.

### I proved the guard can fail

Reintroducing `quote` into the DDL — two independent assertions caught it, with the PHI reason in the failure message. Reverted, 6/6 pass. That's the trap I walked into twice in the child phase; not repeating it.

### A real cross-package incompatibility

`entity-graph-core@4.0.0` requires `ShapeMessage.offset: string`. `@electric-sql/client@1.5.27` has **no per-message offset** — it became a *stream option*. PEM's type was written against an older Electric.

Bridged with **one documented cast** in one place rather than `as any` at the call site, so the disagreement stays visible. If PEM relaxes the type, delete the function.

### Two things not verified

**Nothing has synced a row.** No running Electric or Postgres — that's W8. This is **Build-only**, not Passed.

**Three tables are configured with a `practice_id` they don't have.** They reach the practice via `case_id`. Either the server denormalizes the column or the shapes need a join-backed publication. The adapter will throw at construction until then — which is the fail-closed behaviour working correctly, but it means W7's slice can't sync live data until W8 resolves it.

Next: W4 (app shell) and W5 (component library) are independent; W7 needs both. Or W8 first, since it unblocks live verification.

## Root Cause

No explicit root-cause section was captured; preserve this as a session record, not an inferred diagnosis.

## Corrective Actions

Review and promote only reusable findings.

## Session Metadata

- Harness: claude-code
- Session: 4255f8bd-9159-4844-9991-f6a52275c1c0
- Captured: 2026-09-05T11:09:22.943788Z
- Project: /Users/gqadonis/Projects/TribeHealth/kevin/prior-auth

## Changed Paths

- No changed paths detected.
