# RA-03 refiner decisions

## 2026-09-07 — Treat shell parity as a truthful delivery classification

RA-03 is complete when the verified clinical command contracts and server path pass their bounded acceptance checks. The browser and desktop surfaces must be classified by current callers: the browser hooks have no reachable mutation controls, and desktop wrappers have no Tauri registration. This avoids turning interface parity into a false runnable-product claim.

## 2026-09-07 — Reuse current-hash live database receipts

The task 5 and task 6 fresh PostgreSQL campaigns and the task 4 upgrade campaigns already cover the required behavior and cleanup. Their relevant source hashes still match. The final review validates those hashes and markers instead of creating another disposable database without a source change.

## 2026-09-07 — Terminate after one refinement iteration

All ten constraints pass deterministic validation. The report names the inactive UI/native callers and the accidental unrelated test timeout. Further editing would add prose without increasing evidence quality.

## 2026-09-07 — Reopen after isolated review

The first isolated judge found two critical and two warning defects. Refinement
reopened because publication ordering could expose a local ledger, approved
document content could change in place, and evidence-hook feedback was not
generation scoped or cleared after success.

## 2026-09-07 — Preserve migration checksums while adding source immutability

Publication safety belongs before the migration runner applies any version, so
the entry point now rejects unsafe publications before the first commit and
supports repair plus unchanged rerun. Approved document immutability is a new
checksummed migration rather than a rewrite of an applied signing migration.

## 2026-09-07 — Terminate after remediation review inputs pass

Fresh and upgrade fixtures prove publication refusal/recovery and immutable
approved source content. The evidence hook clears known outcomes and fences
late responses by scope generation. The deterministic bundle is ready for a
new isolated judge.

## 2026-09-07 — Add a checksummed clinical revision guard migration

The second isolated review found defects in already checksummed migrations.
Migration 0605 replaces their trigger functions, serializes approval with
source and QA mutations, makes approval terminal except for signing, and
protects both letters when a QA result moves. Earlier migration bytes remain
unchanged, so existing databases receive the repair through an ordinary
upgrade.

## 2026-09-07 — Enforce local-ledger exclusion at migration and DDL boundaries

Migration preflight and postflight now inspect explicit publication membership
as well as all-table and schema publications. A database event trigger rolls
back later publication DDL that includes a local command ledger. Fresh and
upgrade fixtures prove both paths with synthetic databases.

## 2026-09-07 — Give each browser scope one clinical mutation slot

Gate and evidence hooks expose `submitting` and use synchronous command
ownership to refuse overlap before a second request starts. Unknown transport
retains the owning command ID. Definitive completion and lookup clear only that
matching correlation, so another completion cannot erase recovery state.

## 2026-09-08 — Extend refinement for unresolved critical findings

The third isolated review found that the publication event trigger arrived
after separately committed ledger migrations, mutable table names could evade
it, and HTTP gateway failures discarded command correlation. The configured
three-iteration limit could not justify termination with critical findings, so
the bounded remediation cycle was extended to iteration four and recorded in
persistent state.

## 2026-09-08 — Install relation-identity protection before command ledgers

Migration 0600 now installs an OID-keyed local-replication exclusion registry
and DDL guards before migrations 0601 through 0605. Existing deployments apply
the missing lower version before pending later versions, while preflight also
recognizes durable privacy comments on renamed legacy ledgers. The actorless
evidence-count route is unmounted until it can derive verified context.

## 2026-09-08 — Treat timeout and server errors as uncertain command outcomes

Network exceptions, HTTP 408 and HTTP 5xx responses can follow a committed
clinical transaction. Gate and evidence hooks retain the owning command ID for
explicit lookup in those cases. Definitive success, refusal and conflict clear
the correlation.

## 2026-09-08 — Protect published schemas, truncation, and unresolved slots

The fourth isolated review exposed three paths that row-level and
explicit-table checks did not cover. The publication boundary now compares
registered relation OIDs with schema publications and rejects schema moves that
would expose a ledger. Migration 0606 adds statement-level `TRUNCATE` refusal
for approved or signed QA and source mappings. Browser hooks retain an uncertain
command as the scope's mutation owner until command lookup reconciles it.

## 2026-09-08 — Serialize DDL snapshots and retain command ownership across navigation

The fifth isolated review found write-skew between publication DDL and table DDL,
approval/truncation write-skew, missing evidence practice selection, navigation
loss of correlation, and policy outage misclassification. Migrations 0607 and
0608 repair existing databases additively. The migration runner applies the
publication serializer before any command ledger on fresh installs. Browser
ownership moved to a process-scoped identity/practice/case registry, and Gate
policy preserves target-reader outages as `503`.

## 2026-09-08 — Serialize approval with claim truncation

The sixth isolated review showed that a truncation committed while a letter was still draft could remove its claim set before a waiting approval resumed. Migration 0608 now takes a claim-relation lock, requires document-backed claims, and revalidates cited document provenance under the lock. Both transaction orders and a deliberate weakened-control run are required evidence for the seventh verdict.

## 2026-09-08 — Terminate after the seventh isolated verdict

The final packet passed deterministic validation and the fresh isolated gpt-5.6-sol judge returned no findings after checking seven failure classes. The findings schema and strict anti-sycophancy gate passed. Refinement converges at iteration seven.
