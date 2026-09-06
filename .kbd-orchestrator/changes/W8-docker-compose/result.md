# W8 — docker-compose.yaml and schema bootstrap

**Status** complete, **not yet run** · **Date** 2026-09-05

## What was built

| File | Purpose |
|---|---|
| `docker-compose.yaml` | 6 services on one Postgres |
| `docker/bootstrap/00-create-databases.sh` | `kratos` and `flintgate` databases |
| `docker/bootstrap/10-aso-schema.sh` | 49+ tables, then their own assertions |
| `docker/bootstrap/20-electric-sync-views.sql` | `sync_*` views — the server-side PHI boundary |

Services: `db` (flint-forge postgres18) · `electric` 1.8.0 · `kratos-migrate` +
`kratos` v26.2.0 · `flint-gate` · `realtime-fabric`.

## This change resolved W6's blocker

W6 configured three tables with `tenantColumn: "practice_id"` — a column none
of them has. They reach a practice by join:

```
case_evidence       → case_id          → cases.practice_id
evidence_citations  → case_evidence_id → case_id → cases.practice_id
documents           → case_id          → cases.practice_id
```

An Electric shape is per-relation with a flat `where` and **cannot express a
join**. So the join happens once, in the database. `20-electric-sync-views.sql`
defines `sync_cases`, `sync_case_evidence`, `sync_evidence_citations`,
`sync_documents`, `sync_evidence_states`, each carrying `practice_id` directly,
and `electric-shapes.ts` now points at those views rather than base tables.

**Views, not denormalized columns.** Adding `practice_id` to three tables would
duplicate practice membership in four places and need triggers to keep them
agreeing. A view has one source of truth and cannot drift. The cost — views are
read-only — is correct: ADR-007 routes every write through the Axum API.

## The view column list IS the PHI boundary

Each view selects exactly the columns in `pglite-schema.ts` and omits every
entry in `OMITTED_COLUMNS`. Even a client asking for `quote` receives a
relation that does not contain it.

Two layers, agreeing, neither assuming the other ran — ADR-002's pattern applied
to data rather than authority. Plus a `DO $$` block that raises at bootstrap if
any `sync_*` relation ever exposes `quote`, `rationale`, `patient_id`,
`author_name`, `author_npi`, `storage_uri` or `data`.

`sync_documents` uses an **INNER** join deliberately: a document with a NULL
`case_id` has no practice this view can attest to, so it does not sync.

## A defect caught before it shipped

The first draft set `POSTGRES_MULTIPLE_DATABASES: kratos,flintgate`. That
variable is a **convention some community Postgres images implement — this one
does not**. It would have looked correct, created nothing, and surfaced as
Kratos and flint-gate failing to connect at startup, one layer from the cause.

Replaced with `00-create-databases.sh`, which creates them explicitly via
`\gexec`. Verified by grepping the actual Dockerfile rather than assuming the
variable was standard.

## Why this image, and why not flint-gate's

`images/postgres18/Dockerfile:155` already starts Postgres with
`wal_level=logical` — exactly what Electric requires. flint-gate's own compose
uses `postgres:16-alpine`, which does not, and is a working example rather than
a maintained pin.

Kratos runs **v26.2.0**, matching `@ory/kratos-client-fetch@26.2.0` in the web
app. flint-gate's reference compose pins `v1.2` — roughly 25 majors stale.

## Verification — observed

```
docker compose config          PARSES OK
docker compose config --services
                               db, kratos-migrate, realtime-fabric,
                               electric, kratos, flint-gate
resolved images                electricsql/electric:1.8.0
                               oryd/kratos:v26.2.0  (×2)
build contexts                 flint-forge, flint-gate, flint-realtime-fabric
                               — all present on disk

pnpm --dir web typecheck       0 errors
pnpm --dir web test            Tests 6 passed (6)
pnpm --dir web build           ✓ built in 2.43s
bash scripts/audit.sh          audit: PASS
```

## NOT verified — this is Build-only

**`docker compose up` has not been run.** Nothing has built an image, started a
container, loaded the schema, or synced a row. The plan's Verify block called
for `docker compose up -d`, `docker compose ps`, `psql -c "\dt aso.*"` and the
executable schema checks; none of that happened.

The four-word contract from `docs/plan/build-order.md` applies: this is
**Build-only**, not **Passed**. Specifically unproven:

- whether the flint-forge, flint-gate and realtime-fabric images build here
- whether the bootstrap scripts run in order and the schema checks pass
- whether Electric can serve a view (it serves tables by default; views may
  need a publication or `REPLICA IDENTITY` — **untested**)
- whether Kratos v26.2.0 migrates cleanly against Postgres 18

The last two are the likeliest to fail, and the Electric-serving-a-view question
is load-bearing for the whole read path.
