# RA-04 eligibility — projection grants and FRF identity

2026-09-08. Runtime-architecture Execute. Task 1.1, driver 1 of 10.
Result: **Passed** for eligibility. Projection implementation and behavioral acceptance remain pending.

## Dependency and decision

RA-03 is canonically complete with 9/9 tasks and an archived OpenSpec change. Its final acceptance is `Passed`, artifact refinement is 109/109, and the final isolated review has zero findings. Current hashes for those records and the RA-04 plan/spec inputs are retained in [task-1-files.json](task-1-files.json).

RA-04 may proceed to its synthetic projection-contract task. G-DATA still blocks real clinical persistence and release claims. The five tables and every column begin protected; task 1.2 may approve only explicit rows, primary keys, columns, and the server-issued projection revision. The [phase plan](../../plan.md), [RA-04 tasks](../../../../../openspec/changes/ra-04-projection-grants/tasks.md), and [RA-04 specification](../../../../../openspec/changes/ra-04-projection-grants/specs/ra-04-projection-grants/spec.md) remain authoritative.

## Assigned ownership

| Repository | RA-04 boundary |
| --- | --- |
| `prior-auth` | Verified ASO session/membership integration and the proposed five-table projection registry. |
| `flint-gate` | JWT minting and claims enhancement only. Preserve pre-existing RA-02 config and middleware edits. |
| `flint-realtime-fabric` | Identity claims, the verifier port, and strict verifier behavior. Shape facade transport belongs to RA-05. |
| `flint-forge` | No RA-04 write; PostgreSQL substrate only. |
| `prometheus-entity-management` | No RA-04 write or pin change; adoption remains RA-09. |

All five worktrees are already dirty. Their current heads and complete status entries are recorded in the machine receipt so later edits can preserve unrelated work. No companion repository was modified during eligibility.

## Projection and privacy boundary

The approved base-table candidates are `cases`, `case_evidence`, `evidence_states`, `evidence_citations`, and `documents`. `evidence_states` uses `key` as its primary key. `cases.gate_affirmed_at` is included for reactive navigation; `cases.gate_affirmed_by` remains excluded. Patient identifiers, storage locations, authorship metadata, clinical text, embeddings, and criterion labels remain protected pending an explicit projection decision.

The server derives practice, projection revision, audience, issuer, scope, expiry, and originating session. Caller-selected table names, predicates, columns, headers, identity traits, or service tokens cannot expand a grant. Existing source inspection shows that this contract is not yet implemented: Gate currently merges general identity traits and overriding additional claims; FRF generates a session when `jti` is missing or malformed; and verified claims do not carry a structured projection revision.

## Gate disposition

G-DATA applies now: synthetic fixtures are authorized, while persistent real clinical data is blocked. G-PIN, G-REV, G-SYNC, G-NATIVE, and G-MEASURE remain assigned to their later changes. `versions.toml` stays unchanged at PEM 4.0.0. No browser, native, performance, facade, or publication claim is made.

The uncomfortable limit is that issuer and audience validation primitives exist in FRF, but their presence does not prove every protected route uses a strict issuer-bound verifier. Task 1.3 must establish that composed boundary and must reject missing session, scope, or projection revision instead of inventing defaults.

## Verification

Read-only verification used the KBD driver, `prometheus kbd status --json`, strict OpenSpec validation, current SHA-256 checks, repository status inspection, and focused source inspection. No Cargo, database, network, T1, T2, or T3 command is due for this evidence-only task. [eligibility.json](eligibility.json) records the exact result and gate disposition.
