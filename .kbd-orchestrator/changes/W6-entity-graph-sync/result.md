# W6 — Entity graph, PGlite, Electric

**Status** complete, with one goal **partially blocked** · **Date** 2026-09-05

## The open question, answered

ADR-007 left this unresolved and called it the phase's largest risk:

> *Whether Electric's shape authorization can express the per-record privacy
> class that build-order phase 1 requires, or whether that refusal must live in
> the Axum layer.*

**Answer: neither, yet — because the privacy class does not exist in the schema.**

Measured, not assumed:

```
privacy/lane column in cases, case_evidence, evidence_states,
  evidence_citations, documents                       none
grep -ciE 'privacy_class|privacy class|lane ' schema.sql        0
docs/plan/build-order.md phase 1                       "partial — lane and
                                                        privacy class per
                                                        table not yet assigned"
```

The build order says phase 1 is partial and names exactly this gap. So the
question was malformed: it asked which layer enforces a classification that has
not been assigned.

**What Electric *can* express** is a per-table `where` predicate, and
`createTenantScopedElectricAdapter` proves the pattern works and **fails
closed** — it throws if a table lacks `tenantColumn`, or if the tenant id is not
a UUID. That is real enforcement, at the granularity of tenant, not record.

**Consequence:** per-record privacy refusal is deferred to build-order phase 1,
where the classification is assigned. This change implements tenant scoping —
the strongest boundary the schema currently supports — and records the gap
rather than simulating a control.

## What was built

| File | Purpose |
|---|---|
| `web/src/shared/sync/pglite-schema.ts` | the deliberate five-table subset + `OMITTED_COLUMNS` |
| `web/src/shared/sync/electric-shapes.ts` | tenant-scoped shape wiring + a documented version bridge |
| `web/src/shared/sync/pglite-schema.test.ts` | the PHI exclusion guard |

Dependencies: `@electric-sql/pglite@0.5.8`, `@electric-sql/client@1.5.27`,
`vitest@3.2.7` (there was no test runner; W2 flagged that adding one must be
ESM — it is).

## Column-level exclusions, not just table-level

The plan said five tables. Reading their DDL showed **table-level exclusion is
not enough** — three of the five carry PHI in columns:

| Column | Why it is absent |
|---|---|
| `evidence_citations.quote` | verbatim chart excerpt — PHI in the plainest form |
| `case_evidence.rationale` | clinician free text arguing a gap |
| `documents.patient_id` | direct patient identifier |
| `documents.author_name` / `author_npi` | identifies a clinician |
| `documents.storage_uri` | would let the browser fetch chart content outside the audited path |
| `documents.data` | untyped jsonb; cannot be shown PHI-free, so excluded |

Each is recorded in `OMITTED_COLUMNS` **as data with a stated reason**, so the
test can assert it and a reviewer can diff it. Removing an entry is a decision
about PHI, not a cleanup.

## The guard was proved to fail

A test that cannot fail is decoration. Reintroducing `quote` into the DDL:

```
× omits every column recorded in OMITTED_COLUMNS
  → evidence_citations.quote is present but omitted for: Verbatim excerpt
    from a chart document. PHI in the plainest form…
× never stores verbatim chart text — the two columns that would
  → expected not to match /^\s*quote\s/im
```

Two independent assertions caught it, and the failure message carries the
reason. Reverted; 6/6 pass.

## A real version disagreement, bridged in the open

`entity-graph-core@4.0.0` declares `ShapeMessage` with a required
`offset: string`. `@electric-sql/client@1.5.27` has **no per-message offset** —
`ChangeMessage` is `{ key, value, old_value?, headers }`, and `offset` became a
*stream option* (`Offset = "-1" | "now" | \`${number}_${number}\``) for resuming
a stream.

PEM's adapter type was written against an older Electric. The graph never reads
`offset`; it needs `key`, `value` and `headers.operation`.

`adaptShapeStream` forwards those and supplies a synthetic offset, with **one
cast**, documented, in one place. The alternative — `as any` at the call site —
would have hidden a genuine cross-package incompatibility. If PEM relaxes the
type, delete the function.

## Verification — observed

```
pnpm --dir web test        Tests 6 passed (6)
pnpm --dir web typecheck   EXIT=0, no diagnostics
pnpm --dir web lint        clean
pnpm --dir web build       ✓ built in 3.18s
bash scripts/audit.sh      audit: PASS   (check 2 — no query cache)
```

## Not verified

- **No running Electric or Postgres.** The shape wiring type-checks and the
  schema is asserted, but nothing has synced a row. That needs W8's compose
  stack, and until then this is **Build-only**, not Passed.
- `case_evidence`, `evidence_citations` and `documents` are configured with
  `tenantColumn: "practice_id"`, a column they **do not currently have** — they
  reach the practice through `case_id`. Either the server denormalizes
  `practice_id` onto them, or the shapes need a join-backed publication. The
  adapter will throw at construction until one of those exists, which is the
  fail-closed behaviour working as intended.
