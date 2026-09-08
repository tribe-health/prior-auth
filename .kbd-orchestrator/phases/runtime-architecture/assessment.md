ASSESSMENT: runtime-architecture
Project: Prior Authorization Workbench
Date: 2026-09-06
Codebase baseline: Five existing working trees provide schema, UI and reusable identity/graph primitives, but the authorized clinical read and command paths are disconnected.
Cross-tool progress: No implementation changes recorded for this phase; prior phase work and its publication blocker are inherited.

## Assessment result and evidence boundary

**The first-row delivery is Blocked.** Connecting the unused sync adapter alone cannot satisfy it: server authorization, real SQL materialization, lifecycle isolation and a reactive graph consumer are missing. A separate clinical boundary defect must be addressed in runtime order 1: the signing HTTP handler accepts the actor from the request body, while the composed services use memory repositories and a permissive scaffold authority.

This is the Assess stage: fact-finding against the [phase goals](goals.md), [runtime architecture](../../../docs/architecture/application-runtime-architecture.md), [UI architecture](../../../docs/architecture/react-ui-component-architecture.md) and [execution brief](../../../docs/handoff/codex-runtime-architecture-execute.md). It creates no implementation plan or application changes. The decision index was read first; ASO ADRs 008/009 govern, and 006/007 are historical. Prototype examples and handoff instructions are reference inputs, not additional authorization to execute.

Evidence labels: **source-observed** means inspected implementation, not a runtime test; **current diagnostic** means a command run during this assessment; **historical** means prior recorded results, not rerun. Build-health PASS/FAIL/UNKNOWN and implementation DONE/PARTIAL/STUB/MISSING are assessment classifications. Product verification retains Passed / Build-only / Blocked / Failed; a source classification does not certify a deployment.

## Baseline and cross-tool progress

| Repository | HEAD at assessment | Existing working-tree status |
|---|---|---|
| ASO, current project root | 6bf36c20a060a23b653bd8b1fb7cd57b8dedf2c0 | Existing KBD/memory changes and new phase directory |
| flint-forge | aca94224faafdc466b05d3944e06a5873efa0d42 | 61 status entries |
| flint-gate | 7ed6834b0a621847a3b252bf3c6bfdb78bfb2a88 | 51 status entries |
| flint-realtime-fabric | 31cfbc2792640b4eff7e04cfba4df4e385b272cb | 9 status entries |
| prometheus-entity-management (PEM) | 05622ae56c0e0237989ce21c0657ac12a9f78349 | 43 status entries |

Companion roots are `/Users/gqadonis/Projects/prometheus/<repository>`; ASO is `/Users/gqadonis/Projects/TribeHealth/kevin/prior-auth`. References prefixed Gate, Forge, FRF or PEM below resolve against those roots. Findings describe working-tree files, not just HEAD. Existing changes were preserved.

Canonical phase progress reports implementation **0/0 PENDING**, no changes and no executing tasks. The earlier phase's eight completed changes, 57 passing tests and successful build/audit are historical. Its publication blocker remains active. The new progress projection also repeats prior evidence/certification summaries; these do not certify this phase. No attribution of existing uncommitted edits to a particular tool is inferred.

The waypoint and typed runtime agree on runtime-architecture. Legacy `project.json` still names web-ui-architecture and only the focus workspace root; the actual `prior-auth.code-workspace` contains all five folders. The constraints file also retains an obsolete “no multi-root workspace” note. These metadata discrepancies are recorded, not hand-edited around canonical state.

## IMPLEMENTATION STATUS

| Area | Status | Current implementation and missing integration |
|---|---|---|
| Accepted runtime/UI design and ADR index | DONE, documentation only | Current decisions and shared implementation order exist. Acceptance is not operational proof. |
| Forge Postgres schema and replica practice columns | PARTIAL | 60 live base tables, forced practice derivation and clinical trigger definitions exist. ASO production repositories/migration runner and verified transaction context are absent from the composed binary. |
| Kratos and ASO verified session | PARTIAL | Gate validates whoami and distinguishes invalid identity from provider failure. ASO has a session DTO/context and development persona; authoritative membership, public flow routes and lifecycle integration are missing. |
| Authorized Electric facade and downstream identity | MISSING in ASO path | Gate minting and FRF JWT verification are reusable; no FRF Electric HTTP route or server-owned ASO projection contract is wired. |
| Local SQL replication and coherent graph | PARTIAL primitives; integrated path MISSING | Five-table DDL, an unused adapter, graph snapshots and atomic graph primitives exist. No clinical table materializer, real checkpoint transaction or committed SQL-to-graph publisher is connected. |
| Scoped startup, logout and account change | MISSING contract implementation | Current provider has an effect cancellation boolean, but no full startup state machine, epoch fencing, cancellable/drainable runtime or persistent logout-pending control. |
| React reference slice | PARTIAL | Timeline components render supplied data; current hook copies a one-time SQL result. Annotations and authorized source preview are not implemented in this React feature. |
| Responsive component foundation and motion | PARTIAL | base-nova shadcn setup, shared parts, horizontal mobile navigation and CSS feedback exist. Full adaptive shell, scoped interaction lifetime, focus/resize and reduced-motion acceptance remain unverified. |
| Tauri runtime parity and optional Zustand plugin | STUB | Shell-neutral service wrappers exist, but native identity/transport, real DB owner and parity proof are absent. Plugin adoption is optional shell coordination, not a clinical graph owner. |
| Runtime upgrades, recovery and native release | MISSING ASO integration | No coordinated compatibility manifest, schema lease, safe activation or native storage parity proof was found in inspected runtime entrypoints. |
| Twelve other product routes | STUB, intentional | Preserve placeholders. Completing unrelated screens is not the first delivery. |

## SPEC GAP SUMMARY

### A1 — Authenticated command and membership boundary (runtime order 1)

ASO `crates/aso-server-axum/src/lib.rs:31` mounts routes with no verified-session middleware. `routes/letters.rs:19` accepts an actor UUID from JSON and line 30 passes it to sign_letter without the release refusal found in `routes/gate.rs:45`. `crates/aso-host/src/lib.rs:45` and line 64 check capabilities of that supplied actor, which does not authenticate the caller.

The actual binary composes memory repositories and MemoryAuthority (`crates/aso-web-server/src/main.rs:29`); `adapters/memory.rs:123` grants clinical capabilities to any non-nil UUID. Database signing controls exist in `docs/design/schema/schema.sql:1294`, but this memory path never reaches them. This is source evidence of a broken trust boundary; no exploit was attempted. Read handlers also lack verified practice context. Clinical enforcement cannot be marked complete from isolated AppServices tests.

ASO schema already maps Kratos identity to users and active practice roles (`schema.sql:236`, `schema.sql:1744`). Forge provides transactional context and authorization primitives (`crates/fdb-gateway/src/bootstrap.rs:60`, `bootstrap.rs:211`, `crates/fdb-postgres/src/backend.rs:70`). However, Forge's context writes at backend line 105 do not set the ASO RLS input `aso.kratos_identity_id`; the search across ASO/Gate/Forge Rust sources found no setter. ASO composes Forge's Postgres image, not automatically its gateway or authenticated transaction adapter.

Gate's mounted ASO configuration still contains example application domains/upstreams (`docker/flint-gate/config.yaml:277`, catch-all line 389; compose mount line 141). Required facts for planning are the verified subject-to-ASO membership mapping, transaction role/context, authoritative repository, command scope/revision/idempotency and HTTP/native equivalence. The current timeline reassessment POST (`web/src/features/evidence-timeline/api/timeline-api.ts:115`) has no matching mounted Axum route.

### A2 — Identity bridge, projection authorization and revocation (orders 1–2)

Gate `crates/flint-gate-core/src/auth/kratos.rs:47` validates whoami; `middleware/pipeline.rs:199` and line 235 distinguish 401 from 502. These are reusable mechanisms for Anonymous versus SessionUnavailable. The decoded identity does not establish ASO membership or a session expiry contract. Cached identities are accepted first; configured L1 TTL is 60 seconds, optional L2 has a fixed 60-second TTL, and invalidate_session has only a test caller (`cache/mod.rs:50`, 182, 198; `middleware/pipeline.rs:177`).

Gate can mint after verified identity via claims enhancement (`middleware/pipeline.rs:319`), but its OAuth exchange explicitly rejects Kratos subject providers (`auth/token_exchange.rs:176`). Generic minting merges traits and additional claims (`auth/jwt_mint.rs:223`); ASO needs server-derived, allowlisted claims and required mint failures must refuse protected downstream access. An opaque Kratos token is not an FRF JWT.

FRF `crates/frf-gateway/src/lib.rs:77` registers publish/subscribe/agent/signal routes and an admin fallback, with no Electric facade. Its JWT verifier checks signature/audience/expiry and an optionally configured issuer (`crates/frf-identity-ory/src/verifier.rs:74`). ASO must configure the issuer. Claims conversion drops expiry and can synthesize a session ID (`claims.rs:34`), leaving no stable session revocation contract.

Ordinary FRF subscriptions already recheck tenant equality and view authorization per event (`crates/frf-app/src/subscribe.rs:81`); the missing property is bounded session expiry/revocation, not absence of all event authorization. Agent streams instead subscribe to the tenant bus after initial verification (`crates/frf-gateway/src/routes/agents.rs:45`); protected ASO output additionally needs subject/run visibility.

The current client chooses table, columns and predicate (`web/src/shared/sync/electric-shapes.ts:141`). Forced practice columns establish row provenance, not request authorization. Compose publishes insecure upstream Electric on port 3000 (`docker-compose.yaml:87`). The facade must derive allowed scope server-side, reject broadened requests, authorize continuations/refetches and preserve protocol headers/errors. Deployment must remove the upstream bypass. Prior canary filtering proves column projection functionality only; it does not prove authorization or that the remaining metadata is public/non-PHI.

A revocation budget must cover Gate caches, minted token lifetime, open streams, reconnects and suspended tabs/windows. Its numeric bound is still undecided; assessment supplies no invented SLA.

### A3 — D1 and the missing committed read pipeline (orders 2–4)

Current diagnostic:

```text
$ rg -n 'createEvidenceSyncAdapter' web/src
web/src/shared/sync/electric-shapes.ts:131:export function createEvidenceSyncAdapter(opts: EvidenceSyncOptions) {
```

Only the definition exists. GraphProvider creates an in-memory PGlite, executes schema, starts snapshot persistence and publishes a graph; it constructs no sync adapter (`web/src/app/providers/graph-provider.tsx:76`). Empty clinical tables follow from the inspected startup path; no local browser table-count probe was run.

PEM `packages/entity-graph-core/src/adapters/electricsql.ts:74` forwards shape messages to a graph handler without applying SQL row mutations. Its PGlite listener unsubscribe results are discarded at line 84. PGlite and Tauri SQL persistence adapters store serialized _graph_snapshot rows (`adapters/pglite-persistence.ts:71`, `adapters/tauri-sql-persistence.ts:67`); these are not clinical relational materializers. FRF's entity SDK translates fabric envelopes into graph events, also without materialization (`sdks/entity-management/src/adapter.ts:19`).

The ASO bridge filters out control messages and fabricates per-message offsets (`electric-shapes.ts:206`, 217). Those synthetic values cannot serve as authoritative resume checkpoints. The missing contract must preserve actual initial-snapshot/refetch boundaries and commit rows plus real checkpoints atomically before publishing entities and ordered lists.

Independent critic C1 identified another concrete normalization defect: evidence_states uses primary key `key`, but the ASO table configuration at electric-shapes line 135 supplies no idColumn. PEM's adapter defaults to `id` and coerces a missing property into the nonempty string `undefined` (electricsql lines 67–68). Connecting that adapter unchanged can collapse met/gap/void reference records into one graph identity. The committed projection must preserve all three distinct reference identities; one rendered clinical row would not prove this.

PEM already has a useful atomic primitive: `packages/entity-graph-core/src/graph.ts:360` ingests primary entities, side batches, metadata and lists in one set operation. Its realtime manager flush instead performs separate mutations (`adapters/realtime-manager.ts:127`). The gap is adapting committed SQL batches to coherent publication, not a claim that PEM has no atomic operations.

Finally, `web/src/features/evidence-timeline/hooks/use-evidence-timeline.ts:29` copies entries into React state and reads only on database/case changes. Even a working materializer would not make that consumer update reactively. Its two independent SQL reads (`api/timeline-api.ts:46`, 55) also do not establish one coherent snapshot. Replace this ownership pattern through the planned graph selectors; no query cache is needed.

### A4 — D2, D3 and startup/session isolation (orders 3–4, completed lifecycle in 6)

D2 remains at GraphProvider line 82: the startLocalFirstGraph handle is discarded. Cleanup closes PGlite without awaiting runtime disposal/drain; namespace is practice-only, and an existing runtime/error is not synchronously cleared on session changes. The cancellation boolean prevents one late React assignment, not all hydration, graph, listener or persistence effects.

PEM `packages/entity-graph-core/src/local-first-runtime.ts:101` holds global status/pending actions; `graph-actions.ts:50` has global listeners. Hydration publishes after an await without epoch/schema/checkpoint validation (local-first-runtime line 151). Disposal clears subscriptions/timer but cannot drain an already launched save (lines 212, 268). Ready describes hydration/replay, not Electric catch-up (line 242). React has provider-scoped selectors, but imperative fallbacks and sync status remain global (`packages/entity-graph-react/src/graph-store.ts:64`). A fresh provider alone cannot guarantee isolation.

PEM also supports startup replay of persisted pending actions through replayActionWithRetry (local-first-runtime lines 244–256). No current ASO clinical replay caller is claimed, but adopting that optional mechanism without an action boundary would violate goal 7. Clinical commands, including signing and affirmation, must never enter automatic pending-action replay. Keep it disabled for ASO clinical actions; any permitted non-clinical replay needs explicit classification, current scope and authorization. Epoch fencing is necessary for isolation but does not grant permission to replay a clinical command. Reconcile an uncertain authoritative command result by idempotency instead.

D3 remains: `web/src/main.tsx:40` resolves the startup persona, then mounts the entire router inside GraphProvider; `app/providers/session-provider.tsx:17` holds session-or-null; `app/routes/app-routes.tsx:13` puts every route under AppShell. Production anonymous and unavailable outcomes have no public login/recovery path. The current null-session guard avoids opening an unscoped database, but is not a usable logged-out startup.

Missing observable states are DetectEnvironment, CheckingSession, Anonymous, SessionUnavailable, OpeningReplica, Migrating, Hydrating, CatchingUp, Ready, OfflineLimited, Quiescing and RecoveryRequired, including scope invalidation from in-flight startup. Missing ownership includes exclusive worker/DB/schema lease, identity/practice/auth-revision/generation namespace, epoch-fenced callbacks, drainable writes and a separately retained draft store. Offline protected rendering stays locked without an approved grant. The durable noncredential logoutPending marker must block passive cookie restoration after failed revocation/reload; no such integration exists.

### A5 — UI coupling, native and updates (orders 4–7)

The handoff overstates presentation completeness when it describes annotations/source preview as already present. Searching the current React feature/shared UI for SourcePreview/annotation found no implementation; `timeline-entry-row.tsx` renders evidence states and citation labels. The prototype's annotation workflow is design evidence, not an implemented React feature.

Reference-slice completion therefore needs separate annotation command/audit and authorized attachment contracts, bounded byte fetch, object-URL release, and logout-during-fetch refusal. The five-table projection omits criterion labels; the current UI reports that absence. Expanding it requires an approved projection decision, not silently broadening data.

`web/src/shared/store/interaction-store.ts:62` is a singleton, not a store scoped to identity/practice/epoch/case/view instance. `shared/ui/citation-chip.tsx:27` maps a missing citation to evidence void, contradicting the target separation of provenance absence and clinical evidence state. `app/shell/app-shell.tsx:27` still returns false for gate affirmation. Navigation needs committed gate/readiness/capability state; a locked placeholder is not an implemented gate read.

UI stage 2 live authentication depends on runtime 1–2; stage 3 browser timeline/annotations/preview depends on 2–4 plus the attachment and annotation services. Native claims additionally depend on runtime 5. Clinical/supporting views wait for their individual authoritative services; preserve the twelve placeholders. Runtime 6–7 and UI resize/motion/accessibility gates remain prerequisites for release, even after the first row renders.

Tauri currently exposes three plain service wrappers (`desktop/src-tauri/src/lib.rs:25`), with caller-supplied actor arguments and no host session owner/registered runtime shown there; HTTP also exposes evidence counts with no counterpart in this wrapper set. The web HTTP client has no native transport branch (`web/src/shared/api/http-client.ts:29`). Assess PGlite parity first; select native SQLite only after materialization, typed repository/query semantics and multi-window lifecycle parity. The optional Tauri Zustand plugin cannot solve these missing contracts or become a second clinical graph owner.

No working upgrade coordinator was found in inspected web/native entrypoints. Browser immutable assets, compatible API/shape/schema/snapshot contracts, old-tab fencing, unsent draft retention and safe activation remain work. Native credential/encryption choice, signed paired host/frontend updates and per-OS proof remain release decisions. No Flutter/native certification is implied.

## Acceptance matrix: current evidence and dependency inputs

All 19 runtime §14 scenarios remain **unverified as integrated ASO behavior**. Source primitives and historical isolated checks are insufficient. This table maps each to the observed gap and required observable evidence; it does not schedule changes.

| Scenario | Gap / dependency | Evidence still required |
|---|---|---|
| Logged-out cold start | A4; orders 1–2,4 | Usable public flow; zero private DB opens/subscriptions |
| Logged-in cold start | A1–A4; 1–4 | Migrations then committed SQL/graph catch-up before Ready |
| Warm startup | A3–A4; 3–4 | Valid scope/version snapshot; local readiness distinct from freshness |
| Switch during hydration | A4; 3–4,6 | Late old callbacks/writes/attachments never enter new scope |
| Failed logout then reload/new tab | A2,A4; 1–4,6 | Marker prevents passive reentry; revocation failure explicit |
| Offline grant absent/expired | A4; 1–4 | Protected rendering locked |
| Revocation during open stream | A2; 1–2,6 | Every surface stops inside defined revocation budget |
| Browser leader closes | A4; 3–4 | Exactly one replacement DB/sync owner; no missing/duplicate commit |
| Two desktop windows | A5; 5 | One host DB owner, same records, independent interaction state |
| Old tab/new schema | A4–A5; 4,6 | Incompatible writer fenced or migration waits |
| Crash at row/checkpoint boundary | A3; 2–4 | Resume cannot skip rows; replay idempotent |
| Entity/list batch | A3; 3–4 | Subscribers never observe partial relationship projection |
| Rebuild with unsent draft | A4–A5; 3–4,6 | Original authorized user recovers; another cannot read/replay |
| Expired shape/refetch | A2–A3; 2–4 | Obsolete rows removed; coherent replacement publication |
| SQLite parity | A5; 5 | Equal IDs/nulls/dates/order/deletes and multi-window behavior |
| Lost command response | A1,A5; 1,6 | Reconcile idempotency before retry; no duplicate clinical act |
| Update with dirty work | A5; 6 | No forced loss; revalidate session/data after safe activation |
| Admin/agent signing | A1; 1 | Independently exercised Gate, services and DB refusals |
| Quota/eviction/migration failure | A4–A5; 4–6 | RecoveryRequired distinguishes rebuildable replica from drafts |

UI acceptance additionally needs 320/600/1200/1440px checks, desktop-to-phone resize without editor remount/state loss, keyboard/focus continuity, reduced-motion changes at runtime and immediate protected-state removal without retained transition snapshots. No browser/device checks ran in this assessment. First-row proof must show a persisted synthetic Postgres clinical-domain record in the browser and network payload, plus denied practice/broadened-column requests. It is the first delivery, not completion of this matrix.

## BUILD HEALTH and test coverage

Current diagnostics, run read-only against existing application sources (T0-level type/lint checks; no implementation unit or phase completion claimed):

```text
$ pnpm --dir web typecheck && pnpm --dir web lint
$ tsc --noEmit
$ oxlint
exit 0

$ docker compose ps
db: Up, healthy
electric: Up, healthy
flint-gate: Up
kratos: Up
(realtime-fabric is not running)

$ docker compose exec -T db psql -U flint -d flint -tAc "select table_type, count(*) from information_schema.tables where table_schema='aso' group by table_type order by table_type"
BASE TABLE|60
VIEW|10
```

Compose output above is condensed to service/status fields; no health claim is made for services lacking healthchecks. An initial unfiltered information_schema.tables count returned 70, which includes the ten views; it does not contradict the 60-base-table schema.

Pin comparison read versions.toml, web/package.json and installed package.json for both PEM packages: pin=4.0.0, declared=4.0.0, installed=4.0.0, **OK** for both. Companion checkout source was assessed separately; installing future companion changes requires its own release/dependency step and cannot be assumed from local edits.

- Type/lint health: **PASS**, commands above. Web remains **Build-only** with respect to the target runtime.
- Current production build, Rust/Flutter/companion builds: **UNKNOWN** this assessment. Historical green results remain historical. Broad T2/T3 gates were not rerun during a documentation assessment.
- Known implementation violations: A1 authenticated clinical boundary; A2 absent server shape authorization; A3 copied business state/disconnected materialization; A4 unscoped lifecycle; A5 citation semantic conflation and incomplete transport parity.
- Test coverage: **PARTIAL** for current scaffolding; integrated target path **NONE demonstrated**. Seven web test files were inventoried (schema, interaction state, evidence chips, case summary, navigation, timeline and row rendering). No instrumented percentage is available; do not manufacture one.
- Companion test sources cover Kratos errors, JWT claims, tenant/event view filtering and snapshot hydration/reopen. They were inspected, not run. Forge `crates/fdb-gateway/tests/rest_rls_isolation.rs:315` and line 327 can return early without database/role prerequisites; a future green command must prove tests actually exercised the boundary.

## CONSTRAINT CHECK

AGENTS.md violations are existing source gaps A1/A3/A4/A5, not newly introduced code. No application source, dependency, token output or schema was edited. No real patient data, fixture rows or clinical payloads were read/written. No new guards, retries or fallback implementation were added. Proposed boundary work traces directly to the explicit runtime contract and observed disconnected/authentication/lifecycle seams.

constraints.md: no new violation introduced by assessment. Full build/invariant/audit gates remain unverified in this turn. Exact PEM pins agree. Existing metadata notes lag the workspace and the runtime; neither a metadata correction nor an unrelated refactor is included.

## GOAL PROGRESS

| Phase goal | Status | Evidence |
|---|---|---|
| 1. Current handoff/decision precedence | MET for assessment | Index, current runtime/UI contracts and historical handoff distinguished |
| 2. Authorized persisted row in browser | NOT MET | A1–A4; no complete read path |
| 3. Ordered server/FRF/PEM/browser contracts | PARTIAL | Reusable server/graph primitives identified; required seams missing |
| 4. Resolve D1–D3 | NOT MET | All three source-reconfirmed, not fixed |
| 5. Startup, epochs, recovery and offline lock | NOT MET | A4 |
| 6. One runtime/UI sequence, retain placeholders | PARTIAL | Dependencies mapped including missing annotations/preview; delivery absent |
| 7. Preserve clinical/state/privacy invariants | PARTIAL | Exact pins and three-state primitives remain; integrated authority/state ownership fails |
| 8. Assess then plan and prove delivery | PARTIAL | Assessment produced; plan, execution and integrated evidence pending |

## Inputs for the next stage

The architecture already fixes order 1 before 2–4. Planning must assign bounded ownership to ASO session/membership/command repositories, Gate claims and caching, FRF facade, PEM lifecycle/publication and browser worker/materializer/hooks. Define the actual first-row gate before scheduling UI expansion.

Open decisions are approved browser persistence/data policy, native credential/encryption/SSO method, selected compatible sync/materializer versions, revocation and compatibility windows, committed multi-shape projection semantics and representative performance thresholds. Defaulting the synthetic first delivery to memory persistence does not settle production retention. Existing architecture research is input to those decisions, not proof an adapter already works.

Orders 5–7 remain tracked dependencies for native/update/release claims. Annotation/source-preview prerequisites must be explicit if the plan claims UI stage 3 complete. The first row can close the specific prior read-path blocker only after authorized browser proof; it cannot by itself certify clinical commands or a full deployment.

**The uncomfortable thing:** the current clinical service can apply real-looking capability checks to a caller-selected actor while bypassing the database entirely. At the same time, green frontend checks can coexist with empty local tables. The architecture is useful precisely because it exposes both gaps; its completeness on paper provides no runtime assurance.

ASSESSMENT COMPLETE
