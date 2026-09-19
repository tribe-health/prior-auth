# decisions

Append-only. Dated entries. Mark superseded entries; do not delete them.

## 2026-09-04
- Initialized by prometheus-context-bootstrap.
- Seeded from `docs/architecture/` and `docs/plan/build-order.md`. The
  authoritative statement of each is `versions.toml [decisions]`; the ADRs hold
  the full reasoning. Listed here so a reader of this file alone is not misled.

### ADR-001 · No query cache (Accepted 2026-09-04)
No TanStack Query, SWR, or Apollo cache. A query cache models requests; this
application models data, and the entity graph owns freshness. Enforced by
`scripts/audit.sh` check 2 against `web/package.json`.

### ADR-002 · Clinical authority enforced in three places (Accepted 2026-09-04)
Gateway policy, `AppServices` capability check, Postgres trigger. None may
assume another ran. Three checks means three places to update when a capability
changes — that is the cost, and it is deliberate: the alternative is one place
to forget.

### ADR-003 · Three evidence states, never two (Accepted 2026-09-04)
`met` / `gap` / `void`, modelled as a closed set on every surface. Enforced by
`scripts/audit.sh` check 6 across the Rust and TypeScript surfaces.

### Deployment posture changed from local-first to practice-boundary
ASO-ARCH-001 specified a local-first Tauri desktop application. That was correct
for a single surgeon drafting letters and does not survive contact with this
workflow: a coordinator, a scheduler, a biller, two surgeons and a PA all touch
the same case, and inbound fax must arrive somewhere other than one person's
laptop. **Supersedes the local-first posture in ASO-ARCH-001.**
The Security Rule surface is larger than the laptop version and must be
documented and risk-assessed in Phase 0 rather than discovered in Phase 3.
Source: `docs/aso-mvp-spec.html`.

### Build order phases 1 and 2 are irreversible
Retrofitting a privacy class or a session boundary means rewriting the schema
and the gateway. Everything from phase 5 onward is comparatively cheap to redo.
Source: `docs/plan/build-order.md`.

### Context bootstrap installed with profile `mixed` (2026-09-04)
Four harnesses are wired in this repository — `.claude/`, `.opencode/`,
`.kimi-code/`, `.agents/`. Mixed fleet, so the execution scaffold ships.
Rationale and the measurement procedure for revisiting it:
`.prometheus/model-fleet.md`.

### Permission scope corrected for `.kbd-orchestrator/` (2026-09-04)
`Edit(.kbd-orchestrator/**)` replaced with two file-scoped denies covering only
`current-waypoint.json` and `project.json`. Rationale: the guard's purpose is to
stop position forgery past a gate, not to block phase artifacts. Supersedes the
deny list written by the bootstrap earlier the same day. No backup file was created — the cp ran in a denied command. Prior
state is the single line `Edit(.kbd-orchestrator/**)`.

### PEM published as 4.0.0, ESM-only (2026-09-05)
Supersedes the planned 3.3.0. `@tanstack/react-table` v9 is ESM-only, and a
`.d.cts` cannot `require` an ESM dependency's types (TS1479). Rather than
special-case the React binding, all 13 packages dropped CJS. Breaking for
CommonJS consumers — hence major. Also explains the earlier unexplained 4.0.0
bumps from `minor` changesets.

React bindings now publish as `@prometheus-ags/entity-graph-react`;
`@prometheus-ags/prometheus-entity-management` remains a published, deprecated
alias re-exporting all three entrypoints. `entity_graph_flutter` 4.0.0 on
pub.dev with `hooks_riverpod` and caret runtime ranges.

Consuming apps that use `require()` on these packages must switch to
`await import(...)`.

## 2026-09-05 — web-ui-architecture phase close

**ElectricSQL over prometheus-entity-sync (GAP-1).** PES's JS SDKs are v0.1.0,
unpublished, `main`/`types` pointing at raw `src/*.ts`, no build script, peer
range `@electric-sql/pglite ^0.2.0` against current 0.5.8. The Rust `pes-server`
is real; the TypeScript client is a stub. Superseded G4's stated transport.
`goals.md` was NOT amended at the time — corrected in `reflection.md`.

**Tenant scoping in place of privacy class.** `privacy_class`/`lane` do not
exist in `schema.sql` (grep → 0). W6 used `sync_*` views reaching `practice_id`
through joins, INNER JOIN on documents so an unreachable row is structurally
absent rather than filtered. Mechanism preserved; taxonomy deferred to a schema
phase.

**PGlite kept in-memory.** A persisted store means PHI at rest in the browser —
a decision this phase did not take.

## 2026-09-05 — first live run of docker-compose (three fixes)

**Volume mount moved to `/var/lib/postgresql`.** Postgres 18 stores data under
a major-version subdirectory (`PGDATA=/var/lib/postgresql/18/docker`) and the
image declares `VOLUME /var/lib/postgresql`. The pg17-era `/data` path made the
entrypoint refuse to start, in a restart loop.

**Bootstrap no longer runs check files under `ON_ERROR_STOP=1`.** The check
files are NEGATIVE tests that provoke refusals and recover with SAVEPOINT.
`ON_ERROR_STOP` aborted on an intended error, killing the run on a PASSING
test and skipping the sync-view script entirely. The runner now asserts the
expected refusal COUNT (5 and 11, taken from each file's own header) and fails
when one is MISSING — the real regression condition.

**Kratos needs a config file, not only environment variables.**
`identity.schemas` and `selfservice.default_browser_return_url` have no env
equivalent. Added `docker/kratos/kratos.yml` + `identity.schema.json`, mounted
read-only. Identity traits carry NO PHI — Kratos holds who a clinician is,
never anything about a patient. Dev secrets are literal (Kratos does not expand
`${VAR}`) and must be overridden by `SECRETS_COOKIE`/`SECRETS_CIPHER` in any
real deployment; the cipher secret must be exactly 32 characters.

**Local host port for Postgres is 55432**, set in a gitignored `.env`, because
a native Homebrew postgresql@16 holds 5432 on this machine. Nothing internal
changes — services reach the database as `db:5432`.

## 2026-09-06 — flint-gate brought up

**Config from upstream `config.example.yaml`, two changes only.** flint-gate
reads `/app/config/config.yaml` and exits without it; environment variables are
not sufficient. Copied the upstream example (which already targets
`http://kratos:4433`) to `docker/flint-gate/config.yaml` and changed
`database.url` from localhost to `db`. Mounted read-only.

**Admin API stays LOOPBACK, and 4457 is no longer published.** Widening
`admin_listen` to 0.0.0.0 makes flint-gate refuse to start unless
`server.admin_auth` is set — a deliberate fail-safe against exposing an
unauthenticated control plane, and it fired. `admin_auth` requires a real
JWKS-backed provider, so the honest local answer is a loopback admin API
reached via `docker compose exec`, not a fabricated issuer URL.

**Build services ONE AT A TIME on this machine.** Two concurrent Rust release
builds exhausted host memory (~2 GB free) and the task was killed. Not a defect
in either service.

## 2026-09-06 — denormalized practice_id replaces the sync views

Electric cannot serve a view, so the tenant boundary moved onto the rows:
`docker/bootstrap/15-denormalize-practice-id.sql` adds `practice_id NOT NULL`
to `case_evidence`, `evidence_citations` and `documents`, with triggers.

**The triggers are FORCED, not defaults.** A caller cannot set `practice_id`
and cannot lie about it — the value is overwritten from the parent on INSERT
and on any UPDATE touching the parent key *or* `practice_id` itself. That
distinction is the difference between a denormalized column and a cached one.

**`documents` derives from `patients`, not `cases`.** `documents.case_id` is
NULLABLE — a document can be ingested before attachment — so deriving from the
case would leave rows with no practice. `patient_id` is NOT NULL. The old view
used an INNER JOIN on cases, which silently DROPPED unattached documents; that
failed closed and was safe, but deriving from the patient is correct as well.

**Cascades handle reparenting.** A case or patient moving practice updates its
children, or they keep a stale `practice_id` and leak across tenants.

Verified on live data (7 tests, then cleaned up):
- T1 INSERT without practice_id -> derived
- T2 INSERT with a FALSE practice_id -> overwritten with the truth
- T3 UPDATE practice_id directly -> forced back
- T4 case moves practice -> children follow, both directions
- T5 document with NULL case_id -> derives from the patient
- T6 citation inherits from its case_evidence
- T7 patient moves practice -> documents follow
- Electric: Practice A shape returns rows, Practice B returns none
- Electric: projected shape omits `rationale` while the row carries it

**A hole I introduced and then closed.** The first trigger fired on
`UPDATE OF case_id` only, so `UPDATE case_evidence SET practice_id='<other>'`
SUCCEEDED and moved the row across tenants. Naming `practice_id` in the trigger
column list closed it. Found by testing the attack, not by reading the code.

## 2026-09-06 — realtime-fabric moved behind a compose profile

The image BUILDS (the earlier apt failure was transient, proven by retest).
It then exits on `IGGY_CONNECTION_STRING must be set`.

That is not one missing variable. `docs/ENVIRONMENT.md` marks **15 settings
required**, and its own `compose.yml` brings four more services — iggy-server,
keto, keto-migrate, surrealdb — plus a SECOND Postgres replication slot and
publication (`frf_slot` / `frf_pub`) alongside Electric's `electric_slot_default`.

**Nothing consumes it.** grep of `web/src`, `web/package.json` and
`docs/architecture` finds no reference to realtime-fabric, Iggy, LiveKit or
Keto. It appears in one line of the phase plan's service list.

So it is defined with `profiles: ["realtime"]`: the definition and the intent
survive, `docker compose up` stays green, and nobody stands up four unused
services and a second CDC consumer on the same database for no caller.

Start it deliberately with:
    docker compose --profile realtime up -d realtime-fabric

G6 is therefore MET for the services that have consumers, and explicitly
deferred for the one that does not.

## 2026-09-06 — PEM pinned to 4.0.0 across the board

`@prometheus-ags/entity-graph-react@4.0.0` declares peer
`@prometheus-ags/entity-graph-core: ^4.0.0`. Nothing declared core directly, so
pnpm resolved **3.2.0** — an unsatisfied peer, and a second copy of the graph
implementation one major version behind the hooks that wrap it.

core@4.0.0 is published. Added as an explicit direct dependency:

    "@prometheus-ags/entity-graph-core": "4.0.0"

Verified after: `entity-graph-react@4.0.0` now links `core@4.0.0`, the app
resolves 4.0.0, typecheck 0, 49/49 tests, build green, audit PASS, and the
evidence timeline still renders in a browser. The 3.2.0 directory that remains
under `.pnpm/` is a stale store entry with no live link.

**ACTION FOR THE OPERATOR:** `versions.toml` has an empty `[pins]` table and is
deny-listed for agent edits ("Change it deliberately, by hand"). Add:

    [pins]
    "@prometheus-ags/entity-graph-core" = "4.0.0"
    "@prometheus-ags/entity-graph-react" = "4.0.0"

Without a pin there, the next install can silently drift back to a mismatched
pair — which is exactly the failure this file exists to prevent.

**Rule going forward: all Prometheus entity-management modules are 4.0.0.**
A transitive resolution below 4.0.0 is a defect, not a warning.

## 2026-09-06 — ADR-006 and ADR-007 superseded

`docs/architecture/README.md` is now the decision index, reconciled across five
repositories. It records:

- **ADR-006 → ADR-008.** The "entity graph versus Zustand" framing obscured
  that PEM's normalized graph IS a Zustand vanilla store. The distinction was
  never store technology; it is ownership. ADR-008's ownership table line 32
  names per-view interaction state (selection, expansion, filter) as a
  legitimate Zustand store — which ratifies `shared/store/interaction-store.ts`
  as built.
- **ADR-007 → ADR-009.** ADR-007 carried browser-only sync and projection
  claims. Given the adversarial review found that read path has no callers,
  superseding it is the correct disposition.

`react-ui-component-architecture.md` (404 lines) is the component contract, and
its section 11 stage table is the presentation view of runtime section 13's
order — the document states the coupling itself. **UI stage 3 is this project's
evidence timeline**, blocked on runtime orders 2-4.

ADR-001's no-query-cache rule survives intact. PEM's incremental-query ceiling
note is a dated v2 performance record, not a mandate to add a cache.

## 2026-09-06 — PEM pins closed by the operator

`versions.toml` now carries:

    [pins]
    "@prometheus-ags/entity-graph-core" = "4.0.0"
    "@prometheus-ags/entity-graph-react" = "4.0.0"

Added by hand, as that file requires.

**One gap found and closed while verifying.** `web/package.json` declared
`entity-graph-react` as `^4.0.0` — a RANGE, against an EXACT pin. A future
4.1.0 would satisfy the caret and contradict `versions.toml`, which states that
agents must not contradict it. Tightened to `4.0.0`.

Both packages now agree across three places: `versions.toml`, the
`package.json` specifier, and what is installed. `pnpm install` reports the
lockfile already consistent, and the PEM peer warning is gone.

Verification script — run this whenever the tree is touched:

    python3 -c "
    import tomllib, json, pathlib
    for n, want in tomllib.load(open('versions.toml','rb'))['pins'].items():
        pj = pathlib.Path('web/node_modules')/n/'package.json'
        have = json.load(open(pj))['version'] if pj.exists() else '(absent)'
        print(('OK  ' if have==want else 'DRIFT '), n, want, have)"

One unrelated peer warning remains and is left alone: `@ai-sdk/react@4.0.95`
wants React `^19.2.1` against the installed 19.2.0. React is a pinned framework
core; changing it needs its own decision.


## 2026-09-06 — RA-01 mounted session authority (task 1.2)

Resolve raw Cookie/Bearer/X-Session-Token freshly with pinned self-hosted Kratos,
then derive scope/capabilities from active ASO membership in a read-only Postgres
transaction. Browser and native sessions retain their own verified expiry;
authorization equality does not mean equal expiry timestamps. Ignore caller
identity/role hints and require user_roles membership even for the home practice.

Use an incarnation plus global monotonic authorization revision, advanced by
transactional statement triggers on the four authority tables. This catches
remove-and-restore authority changes without changing clinical tables. Accepted
cost: unrelated users and no-op updates can invalidate summaries. Restoring a
backup requires rotating incarnation before serving; this is not stream-revocation
certification. Runtime credentials cannot migrate or write. The dedicated login
and reader role are checked for effective ownership/write privileges after an
independent critic found the initial schema-owner-only check insufficient.

Evidence: .kbd-orchestrator/phases/runtime-architecture/evidence/ra-01-verified-session/task-2.md.
PEM pins are unchanged. Gate routing, pool cleanup/cancellation and native
credential ownership remain later tasks; no production database was migrated.


## 2026-09-06 — RA-01 task 1.3 transaction lifecycle

Keep identity in a transaction-local GUC owned by the membership adapter's
begin_scoped operation, receiving only the shell-neutral provider-verified
identity. SQLx Drop queues rollback; on-release ping flushes it or discards the
connection. Observed SQLx 0.8.3 cancellation discards the interrupted backend
after the statement timeout. Tests require same-backend restored state on normal
exits; cancellation permits replacement only with clean state and old-backend
absence. Immediate HTTP disconnect cancellation remains unverified.

Desktop current_session remains inactive even with an accepting injected port.
No credentials enter from the renderer; activation remains ra-17. Evidence:
.kbd-orchestrator/phases/runtime-architecture/evidence/ra-01-verified-session/task-3.md.


## 2026-09-06 — RA-01 task 1.4 Gate session discovery route

Route exact GET /api/session through an anonymous passthrough provider, with
upstream base on the site so practiceId survives. ASO validates the raw credential
freshly and derives membership; Gate identity metadata/cache grants no authority.
Gate's Kratos middleware omits X-Session-Token and changes outage semantics.
The route is limited to session discovery, not clinical authorization.

Mounted two-identity test proved one shared PostgreSQL backend with correct
A/B GUC and reader role through real Gate/ASO/Kratos. Current Gate collapses
repeated same-name credential headers; direct-HTTP duplicate rejection parity is
not claimed. Mixed distinct sources are rejected. Carry that transport limitation
into full-change acceptance/review. No companion Gate implementation changed.
Evidence: .kbd-orchestrator/phases/runtime-architecture/evidence/ra-01-verified-session/task-4.md.


## 2026-09-06 — RA-01 completion review transport

Accepted the adversarial-review skill's native fallback after configured k3
REST dispatch timed out after180seconds (HTTP000,exit3,no verdict). A fresh
context gpt-5.6-sol judge received mandate plus complete packet; it is distinct
from producing gpt-6-astra and independent of the source critic. Returned PASS,
zero findings, six checked classes; strict report screen score0.0. Record weaker
harness-native transport isolation explicitly instead of attributing a pass to
the unavailable REST judge. Receipt: .kbd-orchestrator/phases/runtime-architecture/review/ra-01-verified-session/judge-transport.json.

## RA-02 durable gate backend (2026-09-06)

Task 1.2 uses a separate NOLOGIN function owner and restricted executor; the
session reader is unchanged. The explicit --migrate-server deployment command
uses separate migration credentials and SQLx 0.8.3 checksums. The local-privacy
command ledger binds verified identity/practice/ID to actor and payload.
Original results survive subsequent gate changes; command then case locks
serialize retries and summary derivation. Upgrade reconciliation updates only
inconsistent summaries before direct-column protection. These choices address
clinical authority, durable reconciliation and existing-store compatibility.
The adapter is staged: mounted transport/composition/Gate/desktop belong to task
1.3; no production clinical behavior is inferred from backend T1. Evidence:
.kbd-orchestrator/phases/runtime-architecture/evidence/ra-02-durable-affirmation/task-2.md.


## 2026-09-06 — RA-02 mounted gate policy

Task 1.3 adds a narrow Gate pre-request callback because current ASO membership,
capability and case scope are absent from Gate identity middleware. Gate passes
one raw credential and original method/URI to read-only ASO policy; only 204
authorizes forwarding. Mutation resolves the session again, then independently
checks AppServices authority and the existing database trigger. A native debug
Gate plus accepting sink and disabled-hook control passed 81 checks; all 17
cleanup checks passed. This is route-specific source/runtime evidence, not
container deployment certification. Native gate wrappers remain unavailable
until RA-17 owns credentials. No actor argument or local write can authorize them.
Evidence: .kbd-orchestrator/phases/runtime-architecture/evidence/ra-02-durable-affirmation/task-3.md.

## 2026-09-06 — RA-02 verified principal and command ordering

Authenticated identity providers own principal provenance. The Kratos adapter
stamps `User`; `SessionService` refuses `Agent` and `Service` before membership
resolution. For a verified identity and selected practice, an existing command
ID is compared with the submitted payload before target-case authority in both
AppServices and PostgreSQL. This makes changed case, kind or action conflicts
stable without exposing receipts across identity or practice scope. New and
exact-replay commands still pass all three independent clinical-authority
checks. Evidence: .kbd-orchestrator/phases/runtime-architecture/evidence/ra-02-durable-affirmation/task-9.md.

## 2026-09-06 — RA-03 task 1.2 verified signing boundary

Signing commands accept only a command ID and expected letter, QA and current
signature revisions. Identity, actor, principal, practice and signature asset
come from a fresh verified context and authoritative database state. Gate,
AppServices and PostgreSQL enforce authority independently. Until claim origin
is modeled separately, every claim on a signable letter requires a scoped
document, page, effective date, content hash and valid page count; annotation-only
claims are refused. Service replay/result lookup remains RA-03 task 1.3, and
injected rollback proof remains task 1.4. Evidence:
`.kbd-orchestrator/phases/runtime-architecture/evidence/ra-03-clinical-command-parity/task-2.md`.

## 2026-09-06 — RA-03 task 1.3 durable clinical command reconciliation

Evidence reassessment uses a dedicated immutable command ledger with command ID,
case, evidence, target state and expected `assessedAt` revision. Exact signing and
reassessment retries resolve the stored receipt before mutable target reads, then
recheck current authority and exact payload identity. HTTP exposes explicit
receipt lookups; desktop declares the same operations but stays unavailable until
native credentials exist. React retains uncertain correlation and waits for the
authoritative projection. Signing, reassessment and affirmation commands use
their feature APIs and never enter PEM replay. Evidence:
`.kbd-orchestrator/phases/runtime-architecture/evidence/ra-03-clinical-command-parity/task-3.md`.

## 2026-09-06 — RA-03 task 1.4 fail-closed clinical composition

The mounted web server requires Kratos, the restricted session login and the
restricted clinical executor login against one PostgreSQL database. One
`PgGateRepository` supplies mounted case, evidence, letter and authority ports;
memory clinical adapters compile only for tests. Unimplemented criteria reads
fail explicitly instead of substituting process-local records. Signing and
reassessment transactions are accepted only when the final clinical row, audit
event and immutable command receipt can commit together. Evidence:
`.kbd-orchestrator/phases/runtime-architecture/evidence/ra-03-clinical-command-parity/task-4.md`.

## 2026-09-08 — RA-03 local ledgers are registered by PostgreSQL relation OID

Migration 2026090600 precedes every clinical command-ledger migration and
registers excluded relations by OID. Publication and table DDL triggers consult
that registry, so rename and schema moves preserve the exclusion. Migration
preflight and postflight also reject broad publications and explicit legacy
ledger membership.

## 2026-09-08 — Actorless evidence counts stay outside production composition

The legacy evidence-count route has no verified-context read contract. It is
unmounted from the production Axum router until that contract exists; the
verified evidence reassessment route remains mounted. Synthetic memory counts
do not return as a fallback.

## 2026-09-08 — RA-03 protects schema publication and statement-level deletion

The local-ledger event trigger and migration pre/postflight compare registered
relation OIDs with both explicit and schema publication catalogs. Migration
0606 independently refuses truncation of QA results and source mappings used by
approved or signed letters. These controls remain additive and checksummed for
fresh and populated upgrades.

## 2026-09-08 — RA-03 uncertain commands retain exclusive scope ownership

Gate affirmation and evidence reassessment hooks keep one command owner in
either `submitting` or `uncertain` state. Network, HTTP 408, and HTTP 5xx outcomes
move the owner to `uncertain`; only a matching successful command lookup releases
that slot. This keeps later mutations from erasing reconciliation identity.


## 2026-09-08 — RA-03 serializes clinical DDL and unresolved UI ownership

Migration 0607 takes the publication boundary lock at DDL-command start so protected table DDL and publication DDL cannot validate against stale catalog snapshots; a waiting transaction retries from a fresh snapshot with SQLSTATE 40001. Migration 0608 gives letter approval and QA truncation a common relation lock and revalidates required QA while holding it. Browser command ownership lives in a process-scoped registry keyed by feature, verified identity, practice and case, so navigation cannot discard an unresolved command. Evidence reassessment and lookup carry the selected practice, and Gate target-reader outages remain HTTP 503 instead of becoming policy denials.


## 2026-09-08 — RA-03 approval binds the complete claim set under a relation lock

Migration 0608 gives approval a `ROW SHARE` lock on `letter_claims`, requires at least one document-backed claim, and revalidates cited document provenance and page bounds before binding the approved revision. The lock conflicts with `TRUNCATE`: truncation-first makes approval return A0306, while approval-first makes truncation wait and then return 42501. Fresh and populated-upgrade fixtures prove both orders.


## 2026-09-08 — RA-04 eligibility keeps projection authority server-side

RA-04 may proceed with synthetic contract fixtures because RA-03 is canonically complete and archived. The five base-table candidates begin protected, with explicit allowlists for rows, primary keys, and columns. The server owns practice scope, originating session, projection revision, issuer, audience, scope, and expiry. Gate may mint allowlisted claims; FRF verifies them. Shape transport remains RA-05, PEM adoption remains RA-09, and real clinical persistence remains blocked by G-DATA.

## 2026-09-08 — RA-04 projection revision 1 is an exact server-owned registry

The verified session boundary derives a replica grant from its resolved
practice and membership authorization revision. The caller cannot supply a
relation, predicate, primary key or column list. Revision 1 contains exactly
five base-table projections, explicitly keys `evidence_states` by `key`, and
adds `cases.gate_affirmed_at` while keeping `gate_affirmed_by` protected.
Unknown metadata stays protected through absence from the allowlist. The same
host-neutral contract serves web and desktop; desktop refuses the grant until
RA-17 provides native credential ownership. Evidence:
`.kbd-orchestrator/phases/runtime-architecture/evidence/ra-04-projection-grants/task-2.md`.

## 2026-09-08 — RA-04 uses a typed, session-bound replica token

The verified ASO grant is the only input to Gate's dedicated replica minter.
The token carries an exact audience, fixed `aso.replica.read` scope, projection
revision 1, the five approved projection identifiers, practice tenant,
membership authorization revision, originating Kratos session, and an expiry
bounded by both the session and Gate's configured maximum. Identity traits,
request headers, table names, predicates, columns, and service tokens cannot
populate or activate this claim set. FRF rejects malformed token/session IDs
instead of inventing replacements and checks the full replica contract before
shape resolution. RA-05 remains responsible for the deployed Electric facade.
## 2026-09-08 — Replica-grant failure proof stops at an accepting downstream

RA04 task 1.4 tests the actual Gate process against a downstream that accepts
every request and records each call. Grant, membership, session-linkage and
required-minter failures pass only when that downstream receives nothing. This
keeps the refusal attributable to Gate and prevents a later FRF denial from
masking permissive gateway pass-through. The deployed FRF/Electric facade
remains RA05 scope.

## 2026-09-12 — RA06c candidate identity excludes derived evidence by rule

The candidate digest covers every included tracked or non-ignored untracked file across
prior-auth, flint-gate and flint-realtime-fabric, plus repository HEADs, locks, sanitized
configuration, toolchains, fixtures, clocks and immutable image identities. It includes the exact
exclusion rules but omits the current list of files matched by those rules from the digest. This
lets KBD receipts and closed campaign logs accumulate without changing the source/runtime identity,
while any new file outside an explicit rule invalidates validation. Sanitized configuration uses
stable presence markers for secrets and normalized home paths; no secret-derived hash is retained.

## 2026-09-12 — RA06c receipts validate the candidate on both sides of a command

The artifact build constructs the candidate and therefore precedes the final candidate digest.
After the build, the manifest records each local Docker tag with its exact image ID and repository
digests. Every campaign command receives `RA06_CANDIDATE_DIGEST` and produces a receipt carrying
that value, a closed-log hash, and pre/post validation results. Validation re-reads included source,
sanitized effective configuration, and current Docker image identities, so a passing command cannot
hide source, configuration, or tag drift during its own execution.

## 2026-09-12 — The production session boundary is the responsive revocation test surface

`SessionAccessBoundary` owns the actual React decision between verified, session-scoped content and
the locked fallback. The root passes its verified session and epoch into the keyed graph runtime
through that boundary. Tests mount the same boundary with the real Zustand session store, runtime
command registry and responsive signing control. This makes synchronous teardown and stable command
ownership across resize one composed assertion instead of inferring production behavior from
separate store and component tests. The real materializer remains RA11c work; RA06 only consumes its
shared revocation event.

## 2026-09-13 — RA06 closed; RA07 candidate implementation entered

RA06 final candidate011433b2 passed12 local receipts, child8/8,parent7/7, packet validation and independent critic/judge strict review. Parent and all three final-repair child changes archived. Child exit overwrote handoff; restored exact SHA25650d7bc3aad0d2b410d6e573587da7283213a8df06a9fdb5302f87899824c6188 with lifecycle receipt. Memory hook script absent; this is append-only fallback. RA11c/RA17 and upload-to-letter UI remain open. RA07 uses isolated PEM worktree codex/ra07-scoped-pem-runtime at071b9e5b; no app pin/adoption change. Implementation precedes assembled local acceptance under PEM rules.

## 2026-09-14 — RA07 isolated delivery and teardown limits

Use an isolated PEM source worktree and locally packed distribution artifacts for
RA07 acceptance. The original PEM checkout and ASO pins stay unchanged until the
explicit G-PIN adoption decision. The acceptance consumer fixes transitive package
versions to the already installed checkout versions; an unconstrained offline
resolver selected an unavailable virtual-core version. Disposal drains operations
that cannot cancel and therefore makes no bounded-time guarantee. Strict runtimes
never restore persisted commands and separate local hydration from server catch-up.

## 2026-09-14 — RA11a materializer candidate remains isolated and blocked

The operator authorized necessary `versions.toml` changes. The authority file records the RA11a
result, but no PGlite Sync production pin was added. Exact installed source for PGlite Sync 0.6.9
and Electric Client 1.0.14 shows three unresolved boundaries: the client emits protocol parameters
the authorized FRF facade rejects, required Electric response metadata is not preserved, and the
plugin starts its multi-shape commit without awaiting it while persisting current stream cursors.
The candidate remains isolated until local behavioral acceptance proves a replacement or repair.
Raw Shape callbacks never authorize Zustand/entity-graph publication; a durable SQL commit and
post-commit verification do.

## 2026-09-14 — RA11a materializer candidate remains blocked

The tested closure is not eligible for production adoption. Its initial Electric request requires `log=full`, which the authorized FRF shape facade rejects with an exact HTTP 400 protocol response. `versions.toml` records the exact four-package closure, reason, adoption prohibition, and future memory gate. Any worker or SQL materialization change must first repair the facade contract or select and requalify another candidate.

## 2026-09-14 — Browser replica ownership is a Web Lock lifetime

The browser PGlite handle, schema migration, graph persistence adapter, and teardown run inside one `ReplicaWorkerOwner` Web Lock callback. Persistent followers remain on fallback and retry; they receive no writable database handle. An advisory lease remains as a crash-expiry fence for compatibility and is renewed while the Web Lock owner is live. The full local schema is a checksummed migration plan. Live FRF materialization is excluded until RA11c resolves its conformance gate.


## 2026-09-14 — RA11c production adoption remains blocked

Keep the internal FRF-to-PGlite materializer behind the exact experimental
environment switch. Its current implementation uses logged replica and checkpoint
tables and reconciles persisted graph state against the durable checkpoint
transaction after authorized resume. The 158 focused tests pass, but the fixed
16,203-row browser qualification exceeds the 512 MiB incremental RSS limit.
Current-source mounted replay is also blocked by the unresponsive local Docker API,
so an older passing mounted receipt is historical evidence rather than verification
of the final durability repair.


### Correction — RA11c current-source verification state

The statement above that all 158 focused tests pass describes the source before
the live authority-freshness repair. The repaired guard passes 11 focused tests,
TypeScript, and lint. Two current 160-test attempts timed out in changing PGlite
cases on the degraded host, so the current full focused result is Blocked. KBD
retains a compensating mounted-replay task and RA11c remains Blocked at 8/9.

## 2026-09-15 — Preserve Electric operations as internal row metadata

RA11c carries `insert` and `update` through `ChunkRow` using a symbol that cannot collide with a replicated column. Cold snapshot survivors are inserts into a replacement; continuation updates remain update-only. The SQL writer retains its prior column-count inference only for callers without operation metadata. This prevents a partial reinsert from being misclassified as an update against an empty replacement table.

## 2026-09-15 — RA12 may proceed within browser and data gates

RA12 is eligible because RA11c is complete, verified and archived. Public route separation and the explicit startup state machine may proceed without enabling the memory-blocked PGlite materializer. G-DATA restricts private verification to synthetic or memory-only data, G-NATIVE remains with RA17/RA21, and no state may claim Ready from database open or snapshot hydration alone.

## 2026-09-15 — Public authentication routes precede private runtime ownership

RA12 mounts `/login` and `/recovery` as siblings of the protected route branch. The session/runtime Zustand store distinguishes anonymous, unavailable, opening, migration, hydration, catch-up, ready, offline-limited, quiescing and recovery states without persistence or credentials. A private PGlite/FRF runtime can start only beneath a verified session. The former development identity fallback is removed because an unavailable session service must open no private replica. `Ready` is reachable only after the ordered migration, hydration and required catch-up transitions; an epoch mismatch refuses a late transition.

## 2026-09-15 — Kratos browser flows use the application origin

RA12 routes browser login and recovery through the application-owned `/self-service` path. The production web shell exposes only the six required public Kratos routes and preserves redirects and all `Set-Cookie` headers; Vite proxies the same prefix to the local web server. This keeps Kratos browser cookies first-party and gives the React implementation one endpoint contract without exposing the admin API. The typed parser binds every returned form action to the requested flow ID and exact login or recovery endpoint before rendering it.

## 2026-09-15 — Protected routes require runtime Ready

A verified identity starts private runtime ownership but does not itself expose
case screens. The route layer reads the sanitized Zustand runtime phase and
renders protected content only for `ready`, after migration, hydration and
required shape catch-up. `offline-limited` may retain the local resource for
recovery, while its UI remains a closed non-patient-data surface.

## 2026-09-15 — RA13 may implement browser lifecycle fencing within existing gates

RA13 is eligible because RA12 is complete, verified and archived. Browser epoch,
cross-tab hint, foreground revalidation and noncredential logout-control work may
proceed against the adopted session and PEM boundaries. Persistent recovery of
real clinical drafts remains outside the approved G-DATA scope, and the
memory-over-budget PGlite materializer remains disabled for production. Native
credential and multi-window host claims remain with RA17 and RA21.

## 2026-09-15 — Browser invalidation hints trigger authoritative session checks

RA13 uses versioned BroadcastChannel messages with a storage-event fallback only
to tell another tab to revalidate. A hint contains no identity, practice,
credential or authorization revision. The receiving tab closes protected views,
advances its session epoch, drains the private graph and asks the self-hosted
session endpoint for current authority before it can reopen.

Transient clinical view state now uses one Zustand owner per mounted view. Its
scope includes identity, session, practice, authorization revision, epoch, case
or letter and view instance. An old generation is aborted and cannot publish
after any of those dimensions changes.

## 2026-09-15 — Logout control is durable, noncredential and generation matched

The browser writes `logoutPending` before calling the shell-neutral logout
operation. The record contains only schema version, random generation and
creation time. A confirmed server response clears only its matching generation,
so an older tab cannot erase a newer attempt. Passive session restoration never
clears it. Completion of an explicit Kratos login flow may resolve the current
marker; a recovery flow may not. ASO PostgreSQL remains the sole owner of denial,
retry lease and confirmation state.

## 2026-09-15 — Clinical drafts remain separate and memory-only

RA13 stores targeted correction drafts outside the disposable replica. Records
are keyed by identity, practice, case and draft so a fresh verified session for
the original user may recover them after revocation or replica replacement.
Session, authorization revision and epoch still fence every active handle, and
recovery requires an explicit review action after remount. The repository does
not use browser persistence because G-DATA has not approved durable storage for
real clinical drafts; the editor and lock surfaces state that close or reload
discards memory-only work. Applying a correction remains a separate authorized
clinical command and is absent from this draft UI.

## 2026-09-15 — RA15 proceeds with authoritative server annotations and memory-only client drafts

RA15 is eligible because RA14 is complete, verified, and archived, and the approved PEM packages are pinned in `versions.toml`. Authoritative annotations may persist inside the practice-bound server Postgres path. Client annotation drafts remain scoped by identity, practice, case, authorization revision, and epoch, and remain memory-only until the ASO/practice owner approves a durable device policy. RA15 may use the verified graph contract, but the PGlite materializer stays disabled for production because its recorded RSS peak exceeds the fixed limit. Native credential and multi-window claims remain assigned to RA17 and RA21.

## 2026-09-15 — Annotation projection revision 2 preserves opinion provenance

Projection revision 2 adds the practice-scoped `annotations` base table. Its client projection contains the attributed opinion body, author identity and display label, `surgeon` provenance, include/hold state, optimistic revision, and optional evidence or document target. Type-specific JSON, revision history, command receipts, and audit events remain server-side. Annotation writes use one verified-context command transaction; request bodies cannot select the author. The browser contract remains memory-only under G-DATA, and the disabled PGlite materializer remains unchanged.

## 2026-09-15 — Annotation editors preserve browser editing state in one DOM node

Responsive annotation layout uses CSS around one mounted textarea. Semantic
draft fields are shared through the session-owned memory repository, while each
view keeps composition state in its own scoped Zustand store and leaves caret,
selection and undo with its textarea. A newly mounted view requires explicit
draft review. The annotation-type catalog is not part of projection revision 2,
so the implemented UI edits authoritative annotations and does not invent a
type identifier for first-annotation creation.

## 2026-09-16 — Keep PGlite generation 3 immutable

`PGLITE_SCHEMA_SQL` remains byte-identical to the committed generation-3 base. Annotation catalog and record tables are introduced together by revision 4; source-hash wire compatibility remains revision 5. Existing persisted replicas must receive additive migrations rather than checksum drift in migration 001.

## 2026-09-16 — Native Kratos credentials belong to the platform keyring

The Tauri Rust host stores opaque Kratos session tokens through exact `keyring` 4.2.0 and wraps transient values with `secrecy` 0.10.3. There is no renderer, Zustand, graph, SQLite, JSON, or plaintext fallback. Kratos 26.2.0 native password login plus `whoami` is the qualification path. Production OIDC uses the system browser with exact Tauri opener 2.5.5, deep-link 2.4.10 and single-instance 2.4.4, followed by a host-validated one-time exchange. Stronghold is not the token facility because it adds a vault-unlock secret and its standard plugin command surface is renderer-callable. Full IPC, OIDC activation and Windows/Linux qualification remain later RA17 work.

## 2026-09-16 — Native clinical commands reuse the mounted Gate boundary

The shared React feature APIs select HTTP in a browser and exact Tauri IPC in the desktop composition root. Tauri command inputs are closed and contain resource identifiers, mutation intent, selected practice context and the current noncredential access epoch. The Rust host checks the Tauri window and epoch before opening the platform credential, marks the `X-Session-Token` header sensitive, and sends the request to the existing Gate route. Gate, `AppServices` and PostgreSQL retain their independent authority decisions; the desktop host does not reproduce or bypass them. The pinned command runtime is Tauri 2.11.5, tauri-build 2.6.3 and `@tauri-apps/api` 2.11.1. Production Wry, multi-window, OIDC and Windows/Linux qualification remain later RA17 work.

## 2026-09-16 — The Tauri host owns desktop invalidation epochs

The Rust host advances one desktop access epoch when the verified session scope
changes, native authentication becomes unavailable after an active session, or
logout begins. It emits a versioned event containing only the reason and epoch
to every authorized window. Renderers treat that event as a revalidation hint:
they synchronously close protected state and must obtain fresh host authority
before reopening. A renderer cannot publish this native event or supply its
epoch, identity, principal, capability or credential. Production Wry windows,
an activated OIDC callback and Windows/Linux credential stores remain later
qualification work.

## 2026-09-16 — RA17 closes native transport with host authority and explicit qualification limits

The Tauri renderer reaches all eleven clinical operations and authorized document sources only through closed, epoch- and window-scoped IPC. The Rust host owns the platform-keyring credential, sends native Kratos sessions with the sensitive `X-Session-Token` header, and delegates clinical decisions through the mounted Gate, shared `AppServices`, and PostgreSQL controls. The shared React feature APIs select the same typed Zustand-facing contracts for browser HTTP and desktop IPC. Production Wry delivery, activated OIDC, Windows/Linux credential stores, raw-byte IPC performance, and the Tauri PGlite baseline remain later qualification work; RA17 does not claim them.

## 2026-09-16 — RA18 starts as a synthetic memory-only Tauri PGlite baseline

RA18 may implement host-controlled database and sync ownership using the frozen PGlite 0.5.8 dependency and the committed replica/graph contracts. The baseline uses synthetic data and memory-only storage because G-DATA has not approved persistent clinical replicas, and the RA11c materializer remains blocked from production adoption after exceeding its RSS limit. The existing renderer-only Web Locks and `localStorage` arrangement does not establish one owner across Tauri windows; RA18 must add the native ownership boundary while keeping credentials, session authority, checkpoints and clinical graph state out of Zustand. Actual Tauri-window evidence is required before making a native baseline claim.

## 2026-09-16 — The Tauri host elects one renderer replica owner

One host coordinator owns the replica claim for each verified identity, session,
practice, authorization revision and principal. The elected renderer retains the
existing PGlite, FRF materializer and committed PEM projection path. Other windows
open no database; they receive versioned canonical entities, entity states, sync
metadata and identifier lists through a bounded host event and apply those slices
to their own Zustand graph store. PEM patches and scoped view state never cross
the host relay, so selection and filters remain local to each window. A claim is
fenced by host epoch, authorized window, graph id, generation and contiguous
revision, and it is released only after the elected runtime drains and closes.
The host relay is coordination transport, not a second graph or Zustand owner.

## 2026-09-16 — Enable pinned Tauri Wry for native lifecycle evidence

RA18 task 1.3 requires an actual Tauri window and cannot be satisfied by the existing mock-runtime-only feature set. Keep Tauri pinned at 2.11.5 and add its `wry` feature alongside `test`; exercise it through the fixture-only `ra18_wry_lifecycle` example. Production packaging remains outside this task. The example uses a local custom protocol and synthetic sessions, while production IPC, ACL, window-destruction, replica ownership and epoch fencing remain the code under test.

## 2026-09-16 — RA18 native PGlite persistence baseline

Task ra-18-tauri-pglite-baseline 1.4 measured PGlite 0.5.8 inside the actual macOS Tauri/Wry WKWebView. The persistence policy remains memory by default and permits identity/practice-scoped `idb://` only through explicit managed-device approval. The successful synthetic reopen does not approve clinical persistence on unmanaged/shared devices. Trusted host-owned SQLite remains the preferred Tauri production target only after it proves the same materialization, migration, checkpoint, revocation, and graph-publication contracts.

## 2026-09-16 — Certify the browser workflow before further native delivery

Plan revision 10 requires web-01 through web-17 to implement and certify the
complete browser case-to-letter workflow before any further typed Tauri
wrapper, Tauri runtime, native SQLite/update, Flutter, or mobile work. Browser
commands mount through typed HTTP routes over shell-neutral `AppServices`.
RA19 and RA21 own the deferred native adapters after web-17 passes. The child
scope denies `desktop/**` and `mobile/**` while this revision is active. This
changes delivery order only; the frozen web-00 domain, authority, tenant,
citation, idempotency, fixture, and expected-output contracts remain binding.

## 2026-09-17 — Web-02 extends the existing cases projection

The frozen `case_summaries` publication row is the logical summary projection of the existing `aso.cases` base relation. Web-02 extends the existing `cases` shape, `Case` entity, and `replica:cases` list to the exact frozen columns instead of adding a second shape over the same relation or introducing an Electric SQL view. This preserves mounted gate/navigation consumers, avoids duplicate local records, and keeps the catalog-to-PGlite mapping one-to-one. The current prototype's patient, payer, and surgeon display names are not authorized by that row and cannot be fabricated or added silently.

## 2026-09-17 — ASO and FRF projection revisions advance together

FRF validates the ASO replica projection revision before resolving or fetching
a shape. Any ASO revision change therefore updates the ASO grant registry, FRF
compiled revision constant, deployed shape catalog, browser requested columns,
PGlite schema, and focused cross-repository contract test in one bounded task.
A catalog-only or ASO-only revision advance would fail closed before data
access and is an incomplete publication change.

## 2026-09-17 — Case views rejoin PEM records and isolate interaction state

The case queue, detail, and intake selectors read ordered identifiers and
normalized `Case` records from one committed PEM snapshot. They do not copy
durable rows into a feature store. Each mounted queue owns a separately scoped
Zustand store containing only search, status filter, and selected case ID. The
scope includes identity, session, practice, authorization revision, epoch, and
view instance so two queues cannot share transient interaction state and an
authority change cannot retain it.

## 2026-09-17 — Clinical materialization remains memory-only

The experimental RA11c materializer and attributed annotation projection may run only with memory storage until G-DATA approves durable private client data. Browser startup now rejects the combination of experimental materialization and persistent IndexedDB before PGlite opens. Persistent PGlite remains available when the clinical materializer is disabled; the runtime does not silently change a requested storage mode.

## 2026-09-17 — Case command confirmation includes protected detail

A case create or update is confirmed only after the committed summary projection reaches the captured revision and an authorized case-detail read matches every submitted intake field. The runtime command captures revision, target status, summary fingerprint, and detail fingerprint before transport, so an uncertain response and later command lookup cannot derive a different target from a newer projection. Status-only transitions still confirm from the exact committed summary state.

## 2026-09-17 — Web-02 closes at the mounted browser boundary

Web-02 is complete when the production browser composition mounts queue, dashboard, and intake through the authenticated graph boundary; the typed browser API reaches the merged Axum case router; committed summary and authorized detail confirmation pass; responsive/scoped interaction tests pass; and the production web bundle builds. This is not full browser certification. Web-03 through Web-17 remain required for administering-entity resolution, document ingestion, criteria, evidence, initial and denial-response letters, fixtures, and the actual-browser campaign. Native and mobile delivery remain deferred.

## 2026-09-19 — The demo stack uses its own Compose project name

The default Compose project is `aso-prior-auth-demo`. This prevents the demo command from silently attaching to the older `aso-prior-auth` development database volume, while preserving that existing volume for other work. `docker compose down --volumes` now removes only the demo data.

## 2026-09-19 — D-1 document assembly engine home: standalone Axum AG-UI/A2UI agent in the monorepo

Decision (operator): document assembly runs as a self-contained Axum 0.8 agent service, `crates/aso-document-assembly`, speaking AG-UI and emitting A2UI surface descriptors, with the pure engine in `crates/clinical-docs`. Supersedes the 2026-09-10 recommendation (library linked by aso-host) recorded in ASO-DA-SPEC-001. Rationale: matches the agent roster (08 Document Assembler) and the capability-inversion rule — the agent has no write path by dependency graph; the engine stays linkable in-process for the desktop/mobile local lane. Change: openspec/changes/da-01-document-assembly-agent. D-2..D-8 remain open.

## 2026-09-19 — Browser certification precedes native continuation

The `web-case-to-letter` child is complete and is the certified implementation baseline. The parent remains at 57/61 because Tauri, native SQLite parity, safe native updates, and final cross-platform runtime certification are later work. Web behavior is not held open for those phases.
