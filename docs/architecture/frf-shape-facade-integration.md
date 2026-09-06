# FRF shape facade ↔ ASO replica: how the two fit together

**Status:** Notes, not a decision. Records what exists on each side as of 2026-09-06 and the one
question that remains open. Supersedes nothing.

## Why this note exists

Work on the Flint Realtime Fabric (FRF) side produced an *authorized shape facade* — an
HTTP endpoint that derives allowed practice, rows and columns on the server, authorizes every
request and continuation against Keto, and proxies to ElectricSQL
(`crates/frf-shape-electric`, `GET /v1/shape`, FRF commit `83d7c23`).

That work was planned on the belief that **ASO had no privacy-approved replica schema** — the
ASO runtime architecture lists it as sequence step 1, and the FRF-side assessment took "listed
as step 1" to mean "not done." That was wrong. The schema exists, is tested, and was designed
for exactly this data path. This note corrects the record so the mistake is not repeated by
whoever reads the FRF artifacts next.

## What ASO already has

**`web/src/shared/sync/pglite-schema.ts`** — the local schema as a deliberate subset:

- Five tables (`cases`, `case_evidence`, `evidence_states`, `evidence_citations`, `documents`)
  and nothing else.
- `OMITTED_COLUMNS` records every excluded column **as data, with a reason** — `rationale`
  (clinician free text), `quote` (verbatim chart excerpt), `patient_id`, `author_name`,
  `author_npi`, `storage_uri`, `data`. Kept as data so a test can assert it and a reviewer can
  diff it.
- `pglite-schema.test.ts` fails when a sixth table appears, when a table name matches
  `/patient|embedding|vector|chunk|corpus|annotation|letter|note/i`, or when an omitted column
  reappears.
- ADR-007 states plainly that there is **no runtime enforcement** — this is a build-time
  decision plus that test.

**`web/src/shared/sync/electric-shapes.ts`** — the shape catalog:

- `SYNC_RELATIONS` maps each table to a base relation (`aso.cases`, …). Base tables, not views:
  measured against a live stack on 2026-09-05, `GET /v1/shape?table=aso.sync_cases` returned
  400 while `aso.cases` returned 200, because a view emits no WAL and cannot join a publication.
- `SYNC_COLUMNS` **is** the PHI boundary on the wire. Verified against a canary row on
  2026-09-05: an unprojected shape shipped `author_name`, `patient_id` and `storage_uri`; the
  projected shape returned the same row with only the listed columns.
- `createTenantScopedElectricAdapter` **fails closed** — a table added without a tenant decision
  throws at attach time.
- `practice_id` is denormalized onto every synced row (server migration
  `15-denormalize-practice-id.sql`, forced by trigger) precisely because *an Electric shape
  WHERE clause is flat and cannot join*.

That last point matters: the schema was shaped for a flat, per-shape WHERE clause. It already
anticipates the facade's request model.

## What this means for the FRF side

The FRF facade does not need ASO to change its schema. The conformance runs the other way:

| FRF concept | ASO's existing answer |
|---|---|
| shape catalog entry | `SYNC_RELATIONS` + `SYNC_COLUMNS` per table |
| `table` | the base relation, e.g. `aso.case_evidence` |
| `columns` | `SYNC_COLUMNS[table]` — already the PHI boundary |
| scope column | `practice_id`, denormalized onto every row |
| tenant decision | `createTenantScopedElectricAdapter`, fail-closed |

**No ASO schema change is required to unblock the FRF-side c006 change.** Widening
`SYNC_COLUMNS` or adding a table to fit the facade would invert the intended direction and
weaken a boundary that currently has a test behind it. `OMITTED_COLUMNS`'s own comment says
removing an entry "is a decision about PHI, not a cleanup."

## The open question — adopt the facade, or not?

ASO today syncs Electric **directly**: `Postgres → Electric shapes → PGlite → entity graph`.
The FRF facade would insert an authorizing proxy in front of that hop.

Arguments each way, neither settled here:

- **For adopting it.** Authorization moves server-side and is re-checked on every continuation,
  which a client-side tenant predicate cannot do. FRF already implements bounded revocation,
  which ADR-009 (FRF's) requires for protected lanes.
- **For staying direct.** The current path works and is measured. `createTenantScopedElectricAdapter`
  already fails closed on an undecided table. Adding a proxy adds an availability dependency and
  a second place where the column projection could drift from `pglite-schema.ts`.

A decision here should also say whether the two tenant checks coexist or one replaces the other.
Running both is defensible (defence in depth); running neither is not.

## Change made alongside this note

`web/src/app/providers/graph-provider.tsx` — the persisted namespace was `aso:${practiceId}`,
practice alone. The runtime architecture §7 forbids that: *"Do not key private storage only by
practice ID."* Two clinicians sharing a workstation shared a namespace.

`graphStorageKey(session)` now composes `aso:g<generation>:<principal>:<practiceId>:<identityId>`,
with `graph-storage-key.test.ts` asserting that two identities in one practice, two practices for
one identity, and a user versus an agent acting for them all resolve to different namespaces.

**Open item:** authorization-scope revision is *not* in the key. `VerifiedSession` carries
`capabilities` but no revision counter, and hashing the capability list would churn the namespace
on unrelated changes. Adding a scope revision to the session is the clean fix, and is not done.

## Verification status

Everything above is **implemented and type-checked, not executed**. `tsc --noEmit` passes for
`web/` and for both PEM packages. The new tests are authored and compile; they have not been
run, per the current no-testing directive. Nothing here is certified.
