# W3 — Architecture decisions (ADR-004…007)

**Status** complete · **Date** 2026-09-05

## What was written

| ADR | Decision | Enforcement |
|---|---|---|
| **004** Component model | three layers — vendor / library / feature; promotion on demand | `audit.sh` 1, 3 · vendor boundary **not** enforced |
| **005** Navigation and gating | steps 07–10 gate on **session capability**, not a UI flag | a behavioural test · **not** `audit.sh` |
| **006** Entity graph binding | graph owns durable state; Zustand owns nothing durable | `audit.sh` 2, 3 · Zustand boundary **not** enforced |
| **007** Local-first sync | Electric reads, API writes, PGlite schema that cannot hold PHI | `audit.sh` 2 · schema test · PHI exclusion has **no runtime** enforcement |

Numbering is continuous: 001–007.

## Grounded in verified facts, not assumptions

**ADR-005's gated set** was read from
`docs/design/prototype/assets/shell.js:377-390` — exactly four entries carry
`gated: true` (steps 07, 08, 09, 10). The step numbers are part of the contract;
coordinators refer to cases by pipeline position.

**ADR-006's API surface** was read from the installed 4.0.0 package, not
guessed:

```
GraphStoreProvider, createGraphStore
useEntity, useEntityList, useEntityQuery, useEntityCRUD
createPGlitePersistenceAdapter, usePGliteQuery
createElectricAdapter, createTenantScopedElectricAdapter
```

The tenant-scoped Electric adapter exists, which matters — this is a
practice-boundary deployment.

**ADR-007's PHI rule** quotes `schema-ai.sql:74-91` directly, including the
IEEE S&P 2023 inversion result and the `embedding_models_phi_requires_cover`
constraint.

## The two decisions worth naming

**Gating on capability, not a flag (ADR-005).** A UI flag would make the client
a fourth authority ADR-002 never granted. The three real layers would still
refuse the action — so this is not a security hole. It is worse in a quieter
way: *a screen that lets a coordinator draft a letter the system will refuse to
transmit*, discovered after the work is done.

**Recording why `prometheus-entity-sync` was rejected (ADR-007).** It is the
better conceptual fit — bidirectional, `BucketAssigner` with parameterized SQL,
Dart and Rust SDKs. It lost on measured facts: JS SDKs unpublished at `0.1.0`,
`main`/`types` pointing at raw `src/*.ts`, no build script, a peer range three
minors stale, and `entity-sync-tauri` at one line of source. A rejected option
with no written reason gets re-proposed; this one now has the reason and the
condition under which to revisit.

## Every ADR states what it does NOT enforce

Each `## Enforcement` section names the mechanism and then the gap:

- 004 — nothing stops someone editing vendored `components/ui/`
- 005 — `audit.sh` checks structure, not behaviour; the test is the only guard
- 006 — nothing detects a durable value smuggled into a Zustand store
- 007 — the PHI exclusion is build-time only; PGlite lacking pgvector is a
  **coincidence, not a control**

That last one is the most important sentence in the four documents.

## Deliberately left open

ADR-007 does **not** settle whether Electric's shape authorization can express
the per-record privacy class `build-order.md` phase 1 requires, or whether that
refusal must live in the Axum layer. It is named as the phase's largest open
question rather than assumed away. W6 must answer it.

## Verification — observed

```
ls docs/architecture/adr-00[4-7]*.md    4 files
ADR numbering                            001 002 003 004 005 006 007 (continuous)
each has ## Enforcement                  4/4
each states its enforcement gap          4/4
bash scripts/audit.sh                    audit: PASS
pnpm --dir web typecheck                 0 errors
```
