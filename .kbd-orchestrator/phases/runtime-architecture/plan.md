PLAN: runtime-architecture
Project: Prior Authorization Workbench
Date: 2026-09-06
OpenSpec available: YES — root openspec/config.yaml selects spec-driven
Changes to implement: 24
Phase progress at entry: 0/0; all new changes will be Pending

## Outcome, scope and authority

Deliver an authorized persisted synthetic clinical-domain row through Forge Postgres → Electric → Gate/FRF authorized facade → owned local SQL → committed PEM graph → existing React timeline. Server authorization is established before client wiring. Runtime orders 1–7 and UI dependencies are one sequence. The first delivery is ra-14; it does not establish annotation/source-preview completeness, native parity, update safety or publication.

Inputs are [goals](goals.md), [assessment](assessment.md), its mandatory [review supplement](review/assess/review.md), and the current [decision index](../../../docs/architecture/README.md), [runtime architecture](../../../docs/architecture/application-runtime-architecture.md) and [React UI architecture](../../../docs/architecture/react-ui-component-architecture.md). ADRs 008/009 supersede 006/007. Source observations are not acceptance results. No implementation, dependency, schema or standing rule changes are authorized by this planning turn.

The operator's 2026-09-16 web-first direction supersedes the earlier placeholder-only sequencing for subsequent work. The `web-case-to-letter` child now owns the complete browser case-to-letter and denial-response workflow through actual-browser certification. After that child passes, run `ra-20-safe-browser-updates` and then the browser-scoped `ra-22-runtime-certification`. Defer `ra-19-native-sqlite-parity` and `ra-21-safe-native-updates` until the web application is certified. Completed native foundations remain historical evidence, but no native result substitutes for browser evidence. Do not implement unrelated settings screens, protected agent/media streams, a new query cache, or a Tauri Zustand clinical mirror. Forge remains the Postgres substrate; this plan does not migrate ASO to Forge's generic HTTP gateway or inject ASO schema details into it.

The root OpenSpec directory exists even though its specs are empty; previous native-backend metadata is stale. Use root OpenSpec spec-driven changes, with KBD as canonical ordering/status. No evolver plan or library-candidates file exists. Existing researched architecture supplies the skipped Analyze/Spec inputs; each change still receives an OpenSpec delta specification.

## Hard decisions and delivery gates

| Gate | Owner and required evidence | Blocking effect |
|---|---|---|
| G-PIN: PEM artifact adoption | ra-09 produces a concrete uniquely versioned candidate and resolved-export evidence. Operator controls any versions.toml change; no change to the existing exact 4.0.0 pin is presumed authorized. | Candidate tests may run in an isolated checkout. Main-application adoption and ra-11a onward remain blocked until a real approved artifact and matching pin/manifest/lock exist. No republish, hidden workspace override or substitute 4.0.0 claim. |
| G-REV: revocation budget | ra-06 records a numeric end-to-end deadline, component/cache/token/clock budgets and invalidation authority before implementation. | No bounded-revocation or Ready acceptance without a measured bound. A missing number is a decision task, not a passing placeholder. |
| G-DATA: private persistence | ASO/practice owner decides allowed data and device policy. Current five-table metadata remains protected; excluded fields remain excluded. | Synthetic memory-only baseline can proceed. Persistent real clinical data and release claims remain blocked without approval; snapshots/drafts cannot evade the policy. |
| G-SYNC: version/coherence | ra-11a verifies selected published materializer code, compatible versions, real checkpoint transactions and multi-shape consistency. | A failed conformance spike blocks materialization; replan a bounded adapter rather than claiming current snapshots or synthetic offsets suffice. |
| G-NATIVE: storage/SSO/update facilities | ra-17 and ra-21 require an approved credential/encryption/SSO and signing/distribution strategy with tested artifacts. | Native activation/certification waits; no fallback stores opaque tokens in renderer state or unapproved plaintext persistence. |
| G-MEASURE: supported surfaces and budgets | Before ra-11a measurements, record representative synthetic dataset sizes and pass thresholds; ra-22 fixes the explicit supported browser/OS/device list before its campaign. | A surface without actual evidence remains Build-only/Blocked. Desktop Chromium, mobile viewport emulation and a Tauri window are different claims; physical-device performance requires physical-device evidence. |

These are concrete execution checkpoints, not permission requests during planning. No operator approval is inferred from elapsed time. The uncomfortable constraint is G-PIN: the requested unchanged 4.0.0 pins cannot be treated as containing new PEM behavior. The plan can be complete while that delivery dependency remains blocked.

## Architecture and verification rules applying to every change

Feature components render intents; hooks/view models consume scoped stores; services own effects. PEM owns normalized business records and ordered ID lists, including durable drafts/preferences where permitted. Session/runtime/update/interaction projections are separate ephemeral Zustand stores; credentials, checkpoints, migration and logoutPending controls are not business entities. Related records publish atomically only after SQL commit. There is one writer for the relational lane.

Identity scope includes deployment, practice, subject, authorization revision and replica generation; async work also captures an epoch. Public routes open no private database. Startup includes DetectEnvironment, CheckingSession, Anonymous, SessionUnavailable, OpeningReplica, Migrating, Hydrating, CatchingUp, Ready, OfflineLimited, Quiescing and RecoveryRequired. Every protected invalidation fences ongoing startup as well as Ready. Offline protected work stays locked without an approved grant.

Every added HTTP operation has its corresponding typed desktop wrapper and refusal semantics in the same change; native registration/credential activation follows in ra-17. Neither wrapper nor request body can supply trusted actor identity. Gate, AppServices and Postgres clinical checks remain independently enforceable. No clinical operation enters automatic PEM/local SQL/Zustand replay. Lost results are reconciled against the authoritative command ledger.

Safety tests use synthetic records and named failure scenarios from each change's criteria. For clinical, privacy, tenant, three-state and state-ownership guards, prove the guard fails under deliberate controlled sabotage, then restore the code. Test the mounted boundary that can fail, not a helper that mirrors implementation. Test prerequisites must error visibly; a silently skipped database test is not Passed. Recheck callers of every exported adapter in the assembled application.

T0: touched Rust crate check/clippy; web typecheck/lint; documentation structure/link/schema checks. T1: targeted behavioral tests for each completed implementation unit, including the explicit assembled integration fixture for that unit. The web child's T2 runs the Rust workspace gates, web production build, architecture audit, local service stack and actual-browser campaign specified by `web-17`; Flutter and native-device gates are outside that child and cannot block its browser result. Browser-scoped RA22 repeats the applicable assembled browser gates after `ra-20`. Native/mobile successors run their own platform gates later. Rust builds run sequentially, one owner per build directory. T3: only the explicitly reached delivery/release milestone, after relevant lower-tier prerequisites. The first browser delivery is a narrow milestone; it does not authorize a broad release campaign. CI is never test evidence.

Every implementation change runs artifact-refiner then isolated adversarial review before its completion/archive, and records observed results. ra-22 repeats the appropriate assembled certification review. Plan validation is structural/OpenSpec plus critic/judge review, not an application build claim. Results use Passed / Build-only / Blocked / Failed.

## Reuse decision and protocol verification

Evaluate the maintained PGlite sync extension before building a replacement. Current documentation exposes multi-table transactional synchronization, persisted subscription keys and refetch cleanup; it also describes alpha status and potentially substantial initial-sync memory usage. These features make it a candidate, not proof of compatibility or a committed-graph hook. ra-11a must inspect the selected artifact's source and prove checkpoint/row atomicity and coherent publication through the facade. [PGlite sync documentation](https://pglite.dev/docs/sync) (Context7 and official page checked 2026-09-06).

Keep the already inspected PEM atomic graph primitive; replace global lifecycle ownership at the explicit strict entrypoint. Keep Gate whoami/minting and FRF per-event view checks where applicable. Source details and the assessment judge's omitted-excerpt warnings are retained in the assessment review supplement; executors reopen the exact named modules before editing. No new version or API is invented by this plan.

## CHANGE LIST (ordered)

### 1. ra-01-verified-session — Return an authoritative ASO session and practice scope

- Scope / runtime order: 1.
- Depends on: NONE.
- Ownership: ASO: aso-server-axum session/router, aso-web-server adapters/composition, Gate/Kratos deployment config; Gate: Kratos credential normalization only where required. Forge: PostgreSQL substrate and verified transaction-context conformance, without ASO-specific logic in its generic gateway.
- Recommended agent: Codex. Est. complexity: L. Complexity score: High. Model class: frontier. Customer value: HIGH.

Implement a sanitized session operation backed by active ASO membership in Postgres and verified Kratos identity. Derive subject/practice/principal/capabilities server-side; use transaction-local aso.kratos_identity_id with a non-bypass role. Add the corresponding typed desktop wrapper, inactive until host authentication is available.

Acceptance:
1. When a valid browser cookie or native-token harness request selects an allowed practice, both yield the same sanitized scope, expiry and authorization revision without exposing credentials; fresh Postgres membership is authoritative.
2. When a client forges identity headers, role traits or a foreign practice, the mounted service ignores untrusted identity hints and denies the unauthorized scope; anonymous returns 401, provider failure remains distinguishable as unavailable.
3. When two identities reuse pooled database connections, each transaction receives only its verified context and cannot inherit the previous identity; deactivated membership is refused.

Bounded tasks: 1) Implement verified identity resolution and the ASO membership read in one mounted session path; verify pinned Kratos native-token transport before selecting header translation. 2) Add transaction-context setup/reset under a non-bypass DB role and a shell-neutral verified context; mirror the operation in the desktop wrapper contract. 3) Exercise mounted Gate/session/Postgres behavior with two synthetic identities and practices, plus unavailable Kratos and forged headers.

Risk / limit: Readiness for this endpoint does not activate private replicas. Production browser persistence remains unapproved.

### 2. ra-02-durable-affirmation — Persist authenticated gate affirmation with independent controls

- Scope / runtime order: 1.
- Depends on: ra-01-verified-session.
- Ownership: ASO: aso-host services/ports, Axum gate routes, Postgres adapter/composition, additive server migrations and desktop command wrapper; Gate: ASO clinical route policy.
- Recommended agent: Codex. Est. complexity: L. Complexity score: High. Model class: frontier. Customer value: HIGH.

Replace the production memory affirmation path with verified human context and a Postgres transaction. Introduce the persisted command-result ledger for this operation, binding identity, practice, command ID and payload; install equivalent behavior on fresh and existing databases. Maintain the existing trigger-derived cases.gate_affirmed_at and serve its authoritative read; prevent callers from directly forging the derived value.

Acceptance:
1. When an authorized surgeon affirms with a stable command ID, gate policy, AppServices capability and the database each enforce authority; one durable affirmation and audited result commit atomically.
2. When administrator, agent or foreign-practice actor attempts affirmation at each enforcement layer separately, each layer refuses independently, even when the other two are bypassed by the test harness.
3. When the response is lost, or the same command ID carries a different payload, a lookup/retry reconciles the committed result without a second effect; payload conflict is explicit.
4. When another authorized surgeon adds or removes a required affirmation, the cases.gate_affirmed_at derived value updates or clears transactionally, and a caller cannot directly spoof it.

Bounded tasks: 1) Add an additive, checksummed server migration and least-privilege repository transaction for affirmation and its command-result record. Include the existing gate-summary read/trigger behavior and direct-column write refusal. 2) Remove body-selected actor authority from mounted affirmation; implement Gate/service/database refusal and the equivalent desktop wrapper contract. 3) Test fresh and upgrade installs, all three independent refusals and lost-response/payload-conflict behavior against real Postgres.

Risk / limit: Never relax database triggers or use superuser service connections to make the new adapter pass.

### 3. ra-03-clinical-command-parity — Use verified context for signing and evidence reassessment

- Scope / runtime order: 1.
- Depends on: ra-02-durable-affirmation.
- Ownership: ASO: Axum letters and proposed reassessment route, aso-host services/ports, existing Postgres adapter, desktop wrappers; Gate: matching clinical route policy.
- Recommended agent: Codex. Est. complexity: L. Complexity score: High. Model class: frontier. Customer value: HIGH.

Close the caller-selected signing actor defect and implement the endpoint already called by timelineApi.reassess. Reuse the authoritative command ledger; signing is bound to the approved current letter revision, cited assertions, completed QA and committed gate. Add no letter-composer or other placeholder view.

Acceptance:
1. When a caller submits a forged surgeon actor or stale letter revision, signing is denied; request-body identity never grants authority and stale QA/signature revision cannot pass.
2. When an authorized reassessment or signing command loses its response, the persisted command result resolves the outcome and a repeat creates no duplicate clinical effect; signing/affirmation never enter PEM replay.
3. When administrator or agent directly reaches service/database signing paths, each independent clinical control refuses; allowed evidence changes retain met/gap/void and an audit record.

Bounded tasks: 1) Implement verified-context signing with revision/QA/source preconditions and matching Gate/service/DB refusal tests. 2) Add authoritative reassessment and matching HTTP/desktop operation contracts using the existing command ledger. 3) Remove production memory authority/repositories from these mounted paths and prove command reconciliation and rollback with synthetic records.

Risk / limit: A signed-letter fixture may support the command test; this change does not implement generation, QA production or a letter-editing UI.

### 4. ra-04-projection-grants — Derive replica grants and FRF identity on the server

- Scope / runtime order: 1→2.
- Depends on: ra-03-clinical-command-parity.
- Ownership: ASO: session/membership service and proposed projection registry; Gate: jwt_mint, claims-enhancement pipeline and ASO routes; FRF: identity claims/port/verifier.
- Recommended agent: Codex. Est. complexity: L. Complexity score: High. Model class: frontier. Customer value: HIGH.

Define approved shape identifiers for the five current base tables, exact primary keys and approved columns, then bind them to verified scope and projection revision. Mint an allowlisted FRF token through verified identity enhancement, not Kratos OAuth exchange; carry originating session and bounded expiry. Explicitly add cases.gate_affirmed_at to the versioned approved projection for reactive navigation, keeping gate_affirmed_by excluded unless separately justified.

Acceptance:
1. When the five-table projection registry is evaluated for two practices, only authorized rows/columns are permitted; evidence_states explicitly uses key; remaining metadata is treated as protected unless approved otherwise.
2. When a caller supplies table/where/columns, forged traits, headers or another service token, none broadens the server grant; wrong issuer/audience/scope/revision is rejected.
3. When required token minting or membership resolution fails, protected downstream access is denied; no permissive pass-through or invented session linkage is used.
4. When a committed gate affirmation is removed in another session, the projected cases.gate_affirmed_at clears through the authorized stream; navigation will consume this entity field, not a one-time HTTP copy.

5. **When:** Fresh and upgraded databases receive forged practice_id, parent-key changes and permitted parent transfers under the non-bypass role. **Then:** The existing case_evidence, evidence_citations and documents triggers overwrite forged derived practice IDs and preserve tested cascades. Cases use authorized practice ownership/RLS; evidence_states remains explicitly approved reference data without an invented practice trigger.

Bounded tasks: 1) Record the privacy/projection contract and negative request fixtures in the mounted grant boundary; keep existing exclusions and defer criterion-label expansion. 2) Implement strict claim allowlisting, originating-session linkage, expiry and issuer/audience validation across Gate and FRF. 3) Prove modified clients cannot broaden grant scope and required mint failure refuses access. Re-run the seven established practice-derivation cases against fresh and upgraded schema, including direct practice_id writes and parent changes.

Risk / limit: Privacy approval for real clinical persistence remains a decision gate; synthetic data permits contract testing only.

### 5. ra-05-authorized-shape-facade — Serve Electric snapshots and continuations through the authorized facade

- Scope / runtime order: 2.
- Depends on: ra-04-projection-grants.
- Ownership: FRF: gateway/application/port modules for a proposed Electric facade and outbound adapter; ASO: compose and Gate route configuration.
- Recommended agent: Codex. Est. complexity: L. Complexity score: High. Model class: frontier. Customer value: HIGH.

Implement the approved shape route through Gate→FRF→private Electric, including initial snapshot, handles, offsets, control messages, errors and refetch. Authorization applies to every request and handle binding. The certified composition has no client-reachable upstream bypass.

Acceptance:
1. When a persisted synthetic clinical row is requested through Gate and FRF, the response preserves Electric protocol semantics and contains only approved columns for the authorized practice.
2. When a client changes scope/projection or reuses another identity's handle on continuation/refetch, the facade denies the request and never exposes the other scope's rows or headers identifying its shape.
3. When the client network attempts direct Electric access, the certified topology denies the bypass; local diagnostic access is separately isolated and cannot be mistaken for the certified route.

Bounded tasks: 1) Implement the facade use case and outbound adapter using the grant contract; preserve protocol headers and control frames rather than the current synthetic-offset bridge. 2) Wire the complete required FRF service dependencies and Gate routes in a bounded test composition; keep unrelated media/agent lanes disabled. 3) Run the real HTTP path with allowed/denied initial, continuation and expired-handle requests plus topology evidence.

Risk / limit: A server-only shape proof is not PGlite/graph/browser proof. Generic FRF event routes are not a substitute.

### 6. ra-06-bounded-revocation — Expire and revoke active replica delivery within a measured bound

- Scope / runtime order: 2.
- Depends on: ra-05-authorized-shape-facade.
- Ownership: Gate: cache, Kratos validation and ASO invalidation integration; FRF: facade/subscription lifecycle and identity expiry; ASO: session/logout and membership-revision service.
- Recommended agent: Codex. Est. complexity: L. Complexity score: High. Model class: frontier. Customer value: HIGH.

Establish one enforceable revocation contract across cached identity, minting, open responses and reconnects. Clinical commands freshly validate authority. Implement the server logout result consumed by browser logoutPending; retain original session linkage and stop streams when revalidation cannot succeed.

Acceptance:
1. When logout, membership removal or session expiry occurs while a response remains open, protected delivery stops within the recorded pre-implementation budget, including cache/token propagation and clock allowance; new requests deny.
2. When invalidation races a cached identity refill or the authority service becomes unavailable, old authorization cannot be resurrected; protected output stops by the same deadline.
3. When a clinical command arrives after revocation, fresh validation refuses it even when a former replica grant/token remains otherwise time-valid.

Bounded tasks: 1) Before code, define and record the numeric bound, component budgets, clock assumptions and invalidation authority; add a deterministic conformance harness. 2) Implement expiry-aware caching/invalidation and a bounded active-response lease, including reconnect and failure behavior. 3) Measure logout, role removal, expiry and stale-refill races across Gate/FRF; preserve existing per-event tenant/view checks.

Risk / limit: Budget selection is an explicit engineering decision before implementation; this plan invents no approved SLA. Protected agent/media activation remains out of scope.

### 7. ra-07-scoped-pem-runtime — Own hydration, status, listeners and persistence per runtime

- Scope / runtime order: 3.
- Depends on: ra-06-bounded-revocation.
- Ownership: PEM: core local-first-runtime/graph-actions/realtime-manager/Electric listener cleanup and React graph-store binding; public exports and focused package tests.
- Recommended agent: Codex. Est. complexity: L. Complexity score: High. Model class: frontier. Customer value: HIGH.

Provide a strict explicit-scope runtime entrypoint with cancellable hydration, tracked saves, drainable disposal and queued-flush cancellation. Keep compatibility APIs separated; ASO must not use global fallback status/actions or automatic clinical replay.

Acceptance:
1. When identity A hydration or a persistence save is delayed, then runtime B mounts, releasing A's operation causes no publication, action or write in B; disposal settles tracked work and closes A's namespace.
2. When dispose occurs during a timer, listener registration or queued graph flush, no later callback publishes, no listener leaks, and cleanup is safe when repeated.
3. When a stored queue contains a signing/affirmation action or hydration alone completes, clinical replay is refused/disabled and hydration readiness is not reported as server catch-up.

Bounded tasks: 1) Add scope-bound runtime/status/action ownership while preserving existing callers through explicit compatibility adapters. 2) Track async hydration, saves, listener registration and flush work so cancellation/drain have testable completion semantics. 3) Exercise adversarial interleavings with real persistence and package-level scoped React consumers; exclude clinical actions from replay.

Risk / limit: Creating a fresh graph object without replacing global action/status ownership cannot satisfy this change.

### 8. ra-08-committed-graph-projection — Publish committed replica batches atomically into PEM

- Scope / runtime order: 3.
- Depends on: ra-07-scoped-pem-runtime.
- Ownership: PEM: proposed committed-replica projection adapter, graph atomic primitives and public exports; ASO: five-table identity/normalization contract fixtures only.
- Recommended agent: Codex. Est. complexity: L. Complexity score: High. Model class: frontier. Customer value: HIGH.

Expose an explicit committed-SQL-batch input and publish normalized entities plus ordered lists at one graph boundary, reusing ingestFetchedList where appropriate. Preserve valid keys, deletes and generation replacement; do not add a second graph writer or mistake snapshots for SQL replication.

Acceptance:
1. When one committed batch changes evidence, citations, documents and their lists, subscribers observe a coherent old or new graph, never partial relationships; SQL commit precedes publication.
2. When reference rows met, gap and void or a row without its declared key arrive, all three valid identities remain distinct; a missing key is rejected instead of becoming undefined.
3. When refetch replacement or authorization narrowing removes rows, obsolete entities/list memberships disappear together; stale-generation batches cannot publish.

Bounded tasks: 1) Define a proposed committed projection contract with scope/generation/batch identity and explicit primary-key mappings. 2) Implement atomic entity/list/metadata application and deletion/replacement using scoped stores only. 3) Test subscriber observations across multi-entity updates, all three reference keys, invalid identities and stale batches.

Risk / limit: Independent shape offsets do not prove one transaction. The SQL materializer must establish that boundary before invoking this adapter.

### 9. ra-09-pem-delivery-gate — Prove and adopt the actual PEM package artifact

- Scope / runtime order: 3.
- Depends on: ra-08-committed-graph-projection.
- Ownership: PEM: package exports/build/release metadata and consumer contract harness; ASO: package/lock adoption only after pin authority is resolved. Operator owns versions.toml.
- Recommended agent: Codex. Est. complexity: M. Complexity score: High. Model class: frontier. Customer value: HIGH.

Build a uniquely identified candidate package closure and test its exported dist entrypoints in an isolated ASO acceptance checkout. Record source revision, artifact hash and actual resolved packages. Retain the project's exact 4.0.0 installation until an explicit release/pin decision authorizes a real produced version.

Acceptance:
1. When candidate packages are consumed by the isolated acceptance checkout, scoped lifecycle and committed projection tests run through installed public exports, with source and artifact provenance recorded.
2. When no authorized pin change or matching published/approved artifact exists, adoption stays Blocked; a candidate result is not reported as delivery in the original 4.0.0 installation.
3. When an authorized real release is adopted, pin authority, manifests, lockfile, installed versions and package identity agree; no overwritten 4.0.0, silent workspace alias or duplicate core singleton remains.

Bounded tasks: 1) Produce and verify the candidate package closure without republishing or relabeling 4.0.0. 2) Attach a concrete package-diff/provenance and consumer-test receipt for the operator-controlled pin decision. 3) After that decision, adopt the actual artifact and rerun resolved-entrypoint/pin/singleton checks; otherwise record the downstream block.

Risk / limit: This is a real prerequisite to first-row delivery in the main application. Unchanged 4.0.0 pins and new companion behavior cannot both be assumed.

### 10. ra-10-remove-transitive-query-cache — Remove the unused bridge that brings SWR into the application

- Scope / runtime order: independent invariant.
- Depends on: NONE.
- Ownership: ASO: web/package.json, lockfile and architecture dependency check; existing assistant-ui presentation components only if verification finds a real affected import.
- Recommended agent: Codex. Est. complexity: M. Complexity score: High. Model class: frontier. Customer value: HIGH.

Reconfirm that @assistant-ui/ai-sdk is unused, then remove that dependency edge so its @ai-sdk/react→SWR closure is absent. Preserve the existing assistant-ui presentation surface and exact framework/PEM pins; do not introduce another cache.

Acceptance:
1. When the dependency cleanup is installed from the updated lockfile, resolved dependencies contain no SWR/TanStack Query/Apollo query-cache path and exact existing pins remain unchanged.
2. When the current presentation components and timeline are checked, type/lint and relevant render tests pass; no active import points at the removed bridge.
3. When a transitive forbidden query cache is deliberately introduced in a test fixture, the dependency guard fails, proving it detects the assessment's manifest-only blind spot.

Bounded tasks: 1) Recheck static/dynamic consumers and the resolved SWR dependency chain before removal; stop this change for replanning if an active bridge consumer is found. 2) Remove the unused bridge and regenerate only the necessary lock closure. 3) Extend the architecture dependency guard to cover transitive paths, prove its negative case, and verify presentation/pins.

Risk / limit: No general dependency refresh or assistant feature implementation belongs here.

### 11. ra-11a-sync-conformance — Prove the selected SQL materializer and commit contract

- Scope / runtime order: 4.
- Depends on: ra-09-pem-delivery-gate.
- Ownership: ASO: proposed isolated sync conformance harness and artifact/version evidence; PEM/FRF: adopted public APIs and facade contract, with no production wiring yet.
- Recommended agent: Codex. Est. complexity: M. Complexity score: High. Model class: frontier. Customer value: HIGH.

Evaluate the documented PGlite multi-table sync extension against the actual Electric/facade and adopted PEM contract. Use isolated durable synthetic storage to prove transaction, checkpoint, refetch and memory properties before implementing the application worker.

Acceptance:
1. When a related multi-table source transaction crosses the real authorized facade, the candidate preserves its transaction boundary and exposes a verifiable committed-data boundary before graph publication; fabricated offsets or independent uncoordinated snapshots fail.
2. When the test process stops around a checkpoint/data commit and restarts with the same isolated durable synthetic store, no rows are skipped, replay is idempotent and obsolete refetch rows are removed coherently.
3. When the selected artifact lacks the required hook, compatibility or memory budget, record Blocked and a concrete capability gap; no production adoption proceeds on documentation claims alone.

Bounded tasks: 1) Record actual compatible artifact versions, source/API evidence, representative synthetic data size and pass thresholds before the experiment. 2) Build a narrow real-facade/PGlite conformance test for multi-shape commits, durable resume, refetch and memory peak. 3) Record pass/failure and the materializer contract consumed by the worker implementation; remove isolated test data afterward.

Risk / limit: Durable synthetic test storage proves restart semantics; the memory-only browser baseline cannot prove persistence survival.

### 12. ra-11b-worker-ownership — Own database opening, migrations and leader handover

- Scope / runtime order: 4.
- Depends on: ra-11a-sync-conformance.
- Ownership: ASO: proposed replica worker/owner service, migration ledger and scope/generation repository; browser ownership tests.
- Recommended agent: Codex. Est. complexity: L. Complexity score: High. Model class: frontier. Customer value: HIGH.

Implement one worker database owner, namespaced by deployment/identity/practice/auth revision/generation, and a checksummed migration lifecycle before allowing sync. Use an exclusive cross-tab owner/schema lease and explicit recovery state.

Acceptance:
1. When two tabs open the same approved replica and one owner closes, exactly one replacement owner opens/writes the database, with no stale owner resuming after handover.
2. When a new generation, checksum drift or unsupported newer schema is encountered, migration occurs under exclusive ownership or returns RecoveryRequired; incompatible old writers are fenced and the current generation is not partially mutated.
3. When identity changes during opening or migration, the old namespace closes or remains quarantined; the new identity never receives its handle/data.

Bounded tasks: 1) Implement worker lifetime and owner/follower coordination with explicit close/drain boundaries. 2) Implement migration ledger/checksums, logical version validation and generation handover under exclusive ownership. 3) Test leader death, old-tab conflict, migration failure and scope invalidation using isolated durable synthetic replicas.

Risk / limit: This change owns database lifecycle only; no Ready or live-materialization claim before ra-11c.

### 13. ra-11c-sql-materialization — Apply authorized streams and publish committed graph batches

- Scope / runtime order: 4.
- Depends on: ra-11b-worker-ownership.
- Ownership: ASO: replica worker materialization service, shared sync projection/key mapping and explicit live integration runner; PEM: adopted committed projection API.
- Recommended agent: Codex. Est. complexity: L. Complexity score: High. Model class: frontier. Customer value: HIGH.

Implement the bounded internal FRF-to-PGlite materializer selected after the ra-11a published candidate failed the authorized-facade check. Run it inside the owned worker and apply the approved projection revision, including the cases gate field. Commit SQL rows plus per-shape opaque checkpoints in one transaction, then publish coherent graph entities/lists, preserving all three reference keys and generation/refetch behavior.

Acceptance:
1. When the real authorized stream inserts, updates or deletes related records, SQL rows/checkpoints and graph entities/lists agree before readiness, including gate-summary updates and met/gap/void reference identities.
2. When a crash, refetch or authorization narrowing interrupts the assembled runtime, resume cannot skip data, replacement removes stale rows and no partial relationship batch is published.
3. When the owner is revoked or disposed while materialization is in flight, old-scope work drains or is fenced and cannot publish/write through the next runtime.

Bounded tasks: 1) Implement the selected internal adapter within ra-11b ownership and remove the unused aggregate/synthetic-offset read-path seam from active use; do not add or adopt the blocked `@electric-sql/pglite-sync` candidate. 2) Implement committed SQL-to-graph publication with explicit primary keys, replacement generations and catch-up status. 3) Run real Postgres→Gate/FRF→SQL→graph acceptance with update/delete/crash/refetch; use isolated durable synthetic storage for restart cases and memory-only browser baseline until persistence policy is approved.

Risk / limit: No duplicated graph writer and no shadow graph-snapshot table pretending to materialize clinical rows.

### 14. ra-12-public-auth-startup — Mount real public authentication and explicit startup states

- Scope / runtime order: 4 / UI 2.
- Depends on: ra-11c-sql-materialization.
- Ownership: ASO: main composition, session/graph providers, public authentication feature and routing, proposed runtime status store/hooks; existing shadcn field/message parts.
- Recommended agent: Codex. Est. complexity: L. Complexity score: High. Model class: frontier. Customer value: HIGH.

Implement real Kratos browser login/recovery flows with typed nodes and CSRF handling, and separate Anonymous from SessionUnavailable. Route public pages outside private providers; drive startup through environment/session/open/migrate/hydrate/catch-up states with scoped hooks.

Acceptance:
1. When the browser cold-starts logged out, or Kratos is unavailable, login/recovery remains usable with zero private DB opens/shape subscriptions; anonymous and unavailable render distinctly.
2. When a valid identity starts the application, migration precedes hydration and required shape catch-up; Ready is never inferred from DB-open or snapshot hydration alone.
3. When a flow has field errors, expires or completes recovery/login, the UI renders provider messages and renews only the correct flow; no token/CSRF secret is persisted into a business or interaction store.

Bounded tasks: 1) Separate public/authenticated route composition and add a sanitized session/runtime store with explicit state transitions. 2) Implement the typed Kratos flow hook and shadcn AuthFlowForm against real browser-flow endpoints. 3) Test public cold start, upstream failure, expired/invalid form flow and authenticated state ordering with an instrumented DB owner.

Risk / limit: The native credential facility is separate. A prototype persona selector cannot count as authentication.

### 15. ra-13-epoch-logout-and-drafts — Fence scope changes and failed logout across tabs and reloads

- Scope / runtime order: 4 / lifecycle 6.
- Depends on: ra-12-public-auth-startup.
- Ownership: ASO: runtime/session coordinator, per-view store factories, logout control storage and draft repository; PEM: adopted lifecycle APIs.
- Recommended agent: Codex. Est. complexity: L. Complexity score: High. Model class: frontier. Customer value: HIGH.

Invalidate the session epoch synchronously, lock protected rendering, drain old resources, and create a fresh graph on identity/practice/revision changes. Persist a noncredential logoutPending marker before revocation. Separate recoverable draft entities from disposable replica generations; clinical commands are never queued for replay.

Acceptance:
1. When account/practice changes during hydration, catch-up, persistence or an attachment request, old work cannot publish, save into or execute in the new scope; protected content locks immediately and Quiescing completes deterministically.
2. When logout fails offline, then the browser reloads or another tab opens, the durable marker blocks passive cookie reentry; only confirmed revocation or explicit fresh login can resolve it; marker-storage failure is honestly reported.
3. When a replica rebuild, revocation or unsupported migration intersects unsent work, only the freshly authorized original user can recover permitted drafts; memory-only loss on emergency lock is explicit; offline access stays locked without a grant.

Bounded tasks: 1) Implement epoch invalidation, coordinated cross-tab hints and revalidation on resume; scope view state by identity/practice/epoch/case/view instance. 2) Implement logoutPending durability and revocation retry using credentials only in their protected facility. 3) Implement separately scoped draft persistence/recovery and test delayed old work, reload/new-tab logout, unavailable storage and migration/rebuild behavior.

Risk / limit: Memory-only draft loss on emergency logout is preferable to leaking data; do not claim durable recovery without an approved persistence policy.

### 16. ra-14-live-evidence-timeline — Render the first authorized persisted row through graph selectors

- Scope / runtime order: 4 / first delivery.
- Depends on: ra-13-epoch-logout-and-drafts, ra-10-remove-transitive-query-cache.
- Ownership: ASO: evidence-timeline hooks/model/components, scoped interaction provider, committed gate navigation hook, explicit browser acceptance runner; cross-repo services as configured.
- Recommended agent: Codex. Est. complexity: L. Complexity score: High. Model class: frontier. Customer value: HIGH.

Replace the copied one-shot SQL result with scoped PEM entity/list selectors. Preserve three-state counts and citation semantics, use committed gate/readiness/read permissions for navigation, and prove the complete persisted synthetic row path in a real browser. Leave twelve placeholder routes intact. Navigation reads the streamed cases.gate_affirmed_at entity field from ra-02/04; a remote revocation clears reachability without a route reload.

Acceptance:
1. When a synthetic Postgres row is inserted then updated/deleted through the authorized source, the existing timeline and a second subscriber update from the same graph, with no reload or copied clinical React state; SQL/graph/network/rendered values agree.
2. When wrong-practice or broadened-column requests are attempted, including continuation, they are denied and excluded fields never arrive; all three reference state identities remain distinct.
3. When the browser exercises logged-out start, account change, reduced motion and resize, public routes remain usable, old protected state disappears immediately, per-view state survives ordinary resize, and no protected document-transition snapshot remains.

Bounded tasks: 1) Wire scoped graph selectors and intent commands into the existing timeline; replace citation-absence-as-void and the false gate placeholder with explicit semantic/committed states. 2) Recheck every newly exported runtime adapter's caller and use the actual installed package entrypoint. 3) Capture the real synthetic Postgres→Gate→FRF→Electric→SQL→graph→browser path, denied payloads, update/delete and logout evidence; keep screenshots/logs synthetic.

Risk / limit: Only this evidence can close the specific old read-path blocker. It does not certify all UI stage 3, native support or publication.

### 17. ra-15-attributed-annotations — Persist attributed annotations with scoped draft recovery

- Scope / runtime order: UI 3.
- Depends on: ra-14-live-evidence-timeline.
- Ownership: ASO: proposed annotation feature/command/repository and desktop wrapper, PEM entity registration/projection configuration through approved APIs, Gate projection/command policy.
- Recommended agent: Codex. Est. complexity: L. Complexity score: High. Model class: frontier. Customer value: MEDIUM.

Implement the prototype's annotation intent as an authoritative audited opinion record, separate from chart facts, with author/time/source and include/hold state. Drafts use the scoped draft repository and a stable editor instance across responsive layout changes.

Acceptance:
1. When an authorized user saves, includes or holds an annotation, one server audit/record is committed and projected reactively; attribution and source are preserved and chart facts remain separate.
2. When the editor crosses desktop/mobile widths or opens another view of the same case, draft text, caret/IME state and independent selection are preserved without remounting or global interaction leakage.
3. When the session changes or a stale annotation revision is submitted, old autosave/submission is fenced, another user cannot recover the draft, and conflicts/refusals are explicit.

Bounded tasks: 1) Add the annotation domain/revision/audit and projection contract, authenticated HTTP routes and fail-closed desktop wrappers; ra-17 owns executable desktop parity. 2) Implement scoped draft/command hooks and shadcn annotation parts/cards within the evidence feature. 3) Verify live save/refusal/projection, include/hold semantics, resize editor continuity and recovery isolation.

Risk / limit: No annotation becomes a generated clinical assertion without document/page/date provenance and the separate generation/QA contract.

### 18. ra-16-authorized-source-preview — Open cited sources through an authorized adaptive preview

- Scope / runtime order: UI 3.
- Depends on: ra-15-attributed-annotations.
- Ownership: ASO: attachment authorization/byte service and desktop wrapper, evidence source-preview hooks/parts, shared adaptive dialog/sheet and token source if needed.
- Recommended agent: Codex. Est. complexity: L. Complexity score: High. Model class: frontier. Customer value: MEDIUM.

Fetch bounded document bytes through an audited subject/practice/document access service; never expose storage_uri as ambient authority. Integrate an accessible adaptive preview and source-location actions into the timeline, with epoch cancellation and object-URL cleanup.

Acceptance:
1. When an authorized citation opens its source at a known page/date, the preview uses the audited byte service, presents provenance and keyboard/focus controls, and respects bounded fetch behavior.
2. When a forbidden document is requested or logout occurs during fetch/render, access is denied or aborted; bytes/handles/object URLs are released and old content never appears in a new scope.
3. When the viewport crosses mobile/desktop thresholds or reduced motion changes, dialog/sheet adapts without duplicating editors; focus returns correctly, navigation remains reachable, safe areas and 44px touch targets hold.

Bounded tasks: 1) Implement document-level authorization and bounded source delivery with HTTP/native parity and no private service-worker cache. 2) Add source-preview model/actions and accessible adaptive composition using current shadcn primitives and generated layout tokens. 3) Verify forbidden source access, logout during fetch, URL cleanup, 320/600/1200/1440px resize, focus and reduced-motion interruption.

Risk / limit: A download URL is not authorization. Preserve medical source content boundaries and use synthetic fixtures only.

### 19. ra-17-native-session-transport — Own native credentials and verified commands in the Tauri host

- Scope / runtime order: 5.
- Depends on: ra-16-authorized-source-preview.
- Ownership: ASO: desktop Tauri host/session/IPC and web composition-root transport adapter; shared AppServices contracts; Gate native credential path.
- Recommended agent: Codex. Est. complexity: L. Complexity score: High. Model class: frontier. Customer value: MEDIUM.

Implement one native session owner and protected credential facility, sanitized renderer projection and per-invocation session-generation/scope checks. Bind all existing HTTP operations to matching host commands; keep the same React feature hooks and model.

Acceptance:
1. When a native login/session is created and a protected command is invoked, opaque credentials stay in the approved host facility, the renderer receives sanitized state, and Gate/service/database checks remain independent.
2. When a renderer supplies an actor, stale epoch or unauthorized window request, the host rejects it; renderer hints cannot confer signing or practice authority.
3. When two windows observe logout/account change or native SSO completion fails, both lock consistently; incomplete authentication is explicit and no token appears in URLs, Zustand, graph snapshots or logs.

Bounded tasks: 1) Resolve and document the native credential/encryption/SSO facility before storing real credentials; test pinned native Kratos transport end-to-end. 2) Implement the host session owner, constrained IPC and composition-root environment transport with full operation parity. 3) Run host-boundary refusal and multi-window invalidation checks using synthetic identities.

Risk / limit: Credential/encryption and native SSO policy are decision gates; lack of approval leaves native adoption blocked, not silently downgraded to browser storage.

### 20. ra-18-tauri-pglite-baseline — Run the shared evidence runtime in Tauri with PGlite

- Scope / runtime order: 5.
- Depends on: ra-17-native-session-transport.
- Ownership: ASO: desktop/webview composition, native runtime ownership and web storage adapter; PEM consumed runtime contracts.
- Recommended agent: Codex. Est. complexity: L. Complexity score: High. Model class: frontier. Customer value: MEDIUM.

Establish the PGlite baseline in the actual Tauri application before selecting another engine. Coordinate one database/sync owner across windows using an explicit host-controlled ownership service and validate supported persistence rather than assuming browser behavior transfers to every webview.

Acceptance:
1. When two Tauri windows show the same case, one DB/sync owner supplies identical entities/lists while selection/filter state remains independent.
2. When a window closes, the owner exits, or identity changes, ownership transfers or restarts without duplicate commits and stale windows cannot read/write the old scope.
3. When the baseline runs on a claimed OS/webview, actual first-row/catch-up/teardown measurements and runtime evidence are recorded; a browser build is not substituted.

Bounded tasks: 1) Implement the native PGlite owner/follower adapter and retain the same committed replica and graph contracts. 2) Run lifecycle and data conformance fixtures in an actual Tauri window, then two windows. 3) Record OS/webview/persistence policy and cold/warm/catch-up/teardown measurements for the baseline.

Risk / limit: Do not enable a Tauri Zustand plugin as a second graph owner; optional non-sensitive shell coordination is not required by this plan.

### 21. ra-19-native-sqlite-parity — Evaluate a native SQLite materializer against the PGlite baseline

- Scope / runtime order: 5.
- Depends on: ra-18-tauri-pglite-baseline.
- Ownership: ASO: host-owned SQLite replica/query/migration adapter; PEM: engine-neutral committed projection contract and parity harness only.
- Recommended agent: Codex. Est. complexity: L. Complexity score: High. Model class: frontier. Customer value: MEDIUM.

Implement a SQLite candidate for the complete approved projection revision used by ra-18, including annotations and the gate summary with native transactions/checkpoints and the same typed read model. Compare it against the PGlite baseline before selecting a release engine; graph snapshot persistence alone cannot count as a materializer.

Acceptance:
1. When the same synthetic stream including deletes/refetch is applied to both engines, normalized IDs, nulls, dates, ordering, relationships and checkpoint recovery match. Annotation entities, gate summary and every relation in the ra-18 projection are included; a five-table-only experiment cannot pass release parity.
2. When two windows, migration failure or an interrupted commit are exercised, a single host owner preserves transaction/isolation and recovery behavior equivalent to the baseline.
3. When parity, approved encryption/storage or a measured benefit is absent, SQLite release selection remains blocked and the tested PGlite baseline remains the candidate; no parity success is fabricated.

Bounded tasks: 1) Define engine-neutral conformance fixtures and record SQLite/encryption dependency choices against verified artifacts before adoption. 2) Implement native relational materialization/repositories/migrations for that complete revision, extending the original five-table contract to every projection required by the native reference slice. 3) Measure parity and resource/latency trade-offs, then record an evidence-based engine disposition without changing the UI API.

Risk / limit: This is an explicit candidate evaluation, not a mandate to ship SQLite regardless of evidence.

### 22. ra-20-safe-browser-updates — Coordinate compatible web code, schema and draft updates

- Scope / runtime order: 6.
- Depends on: web-case-to-letter/web-17-browser-scenario-certification.
- Ownership: ASO: runtime update coordinator, compatibility service/manifest and browser deployment assets; server migration deployment job; scoped draft and replica services.
- Recommended agent: Codex. Est. complexity: L. Complexity score: High. Model class: frontier. Customer value: MEDIUM.

Version API, shape, logical schema, engine format, graph snapshot and app contracts independently. Stage immutable assets and activate only at a safe user-work boundary; coordinate old tabs/schema leases and use expand/migrate/contract on the server.

Acceptance:
1. When a compatible update arrives with dirty drafts or an unresolved clinical command, the page does not force reload or lose work; command outcome is reconciled before activation.
2. When an incompatible old tab resumes while schema migration begins, it is fenced or the upgrade waits; checksummed migration/generation handover cannot partially corrupt the active replica.
3. When quota eviction, incompatible snapshot or migration failure occurs, recoveryRequired distinguishes rebuildable rows from retained drafts; session and data are revalidated after recovery.

Bounded tasks: 1) Implement compatibility metadata and additive server deployment migration flow for existing installations. 2) Add safe activation across tabs with retained chunks, draft resolution and clinical idempotency reconciliation; add a service worker only if required, static-only by default. 3) Exercise dirty-work updates, old-tab schema conflicts, migration failure, quota/rebuild and post-activation revalidation.

Risk / limit: No unconditional skipWaiting, private API/shape/attachment cache or automatic clinical command replay is permitted.

### 23. ra-21-safe-native-updates — Update paired native host/frontend bundles safely

- Scope / runtime order: 6.
- Depends on: ra-19-native-sqlite-parity, ra-20-safe-browser-updates.
- Ownership: ASO: desktop updater integration, host migration/compatibility coordinator and deployment bundle contract.
- Recommended agent: Codex. Est. complexity: L. Complexity score: High. Model class: frontier. Customer value: MEDIUM.

Stage matching signed native host/frontend versions, reconcile work, quiesce sync and relaunch into validated migrations. Never hot-replace privileged renderer JavaScript from the website; rollback requires compatibility with current data or an approved rebuild.

Acceptance:
1. When a native update arrives with dirty work or an unresolved command, activation waits for explicit resolution; relaunch revalidates session/schema and resumes coherently.
2. When a bundle is unsigned, host/frontend incompatible or rollback cannot read the data, the update/rollback is refused with an actionable state; current authorized data is not silently corrupted.
3. When the application restarts during migration or with logoutPending set, recovery and local locking survive restart; the previous identity cannot be passively restored.

Bounded tasks: 1) Implement signed paired-version compatibility and updater staging using verified Tauri mechanisms. 2) Coordinate native work/command reconciliation, DB ownership, relaunch migration and compatible rollback. 3) Exercise signed/invalid bundles, dirty-work deferral, migration interruption and logout restart on each claimed platform.

Risk / limit: Signing keys, distribution and real-device certification are release prerequisites, not artifacts this planning turn provisions.

### 24. ra-22-runtime-certification — Certify the assembled browser runtime

- Scope / runtime order: 7.
- Depends on: web-case-to-letter/web-17-browser-scenario-certification, ra-20-safe-browser-updates.
- Ownership: ASO: explicit cross-repository acceptance runner/evidence and phase reflection; all companion owners supply prerequisite services/artifacts and their gate results.
- Recommended agent: Codex. Est. complexity: L. Complexity score: High. Model class: frontier. Customer value: MEDIUM.

Run the complete browser runtime and product-workflow scenarios against the actual adopted artifacts after the web child and safe browser updates pass. Recheck the four standing invariants, document browser performance thresholds before measurement, and keep first-row closure separate from complete browser workflow certification. Native and mobile publication remain separate later milestones.

Acceptance:
1. When the configured browser deployment is certified, every required browser startup, case workflow, denial-response, update and security scenario has observed command/service/actual-browser evidence, artifact versions and a Passed/Build-only/Blocked/Failed result; no prerequisite silently skips.
2. When a claimed browser, hard pin or policy gate lacks evidence, browser publication remains Blocked; fixture, native or mobile results do not substitute.
3. When a new guard is relied on or a new runtime adapter is exported, its failure mode is demonstrated at the real integration boundary and caller tracing shows the intended runtime path is actually mounted.

Bounded tasks: 1) Confirm `web-17` and `ra-20` evidence, then assemble explicit non-skipping service and actual-browser checks for the complete browser scenario/UI mapping. 2) Run the browser-scoped T2 gates with sequential Rust builds and the local stack; do not require or claim native/mobile certification. 3) Run artifact-refiner followed by isolated adversarial review, record warning disposition and evidence, then reflect and update only genuinely satisfied completion dimensions.

Risk / limit: The first row is necessary and insufficient. This change can certify the browser application only; native and mobile remain explicitly deferred rather than silently inferred.

## EXECUTION ROUND ORDER

The list is a dependency graph, not authorization to launch all agents. Shared ownership forces serial edits even where dependencies permit parallel work. No concurrent Rust builds.

| Round | Work | Concurrency and gate |
|---|---|---|
| 1 | ra-01; independently ra-10 | ASO server versus package-only ownership; source work may parallelize, builds do not |
| 2 | ra-02 | Verified membership prerequisite |
| 3 | ra-03 | Reuses completed authoritative transaction/ledger |
| 4 | ra-04 | Order 1 clinical boundary complete before downstream grants |
| 5 | ra-05 | Approved server projections precede facade |
| 6 | ra-06 | Complete continuation/active-response revocation |
| 7 | ra-07 | Strict scoped PEM lifecycle after server contracts |
| 8 | ra-08 | Committed graph projection after scoped ownership |
| 9 | ra-09 | G-PIN adoption checkpoint; downstream main-app work waits |
| 10 | ra-11a | Requires adopted PEM; resolve materializer compatibility/coherence and measurement budgets |
| 11 | ra-11b | Worker ownership and migration lifecycle after conformance |
| 12 | ra-11c | Live materialization and committed graph publication after ownership |
| 13 | ra-12 | Public real auth and explicit startup |
| 14 | ra-13 | Account/logout/draft fencing before first browser delivery |
| 15 | ra-14 | First-row milestone; requires ra-10 invariant cleanup plus the runtime chain |
| 16 | ra-15 | Attributed annotations |
| 17 | ra-16 | Authorized preview and adaptive UI stage-3 acceptance |
| 18 | web-case-to-letter web-00 through web-17 | Serial child execution implements and certifies the complete browser case-to-letter and denial-response workflow |
| 19 | ra-20 | Browser update safety follows the certified product workflow |
| 20 | ra-22 | Browser runtime acceptance/publication decision; no green status inferred from fixtures or native foundations |
| Deferred | ra-17 through ra-19, then ra-21 | Resume native session, PGlite/SQLite and updater certification only after browser Passed; completed portions remain evidence and are not repeated |

## Acceptance traceability

Each acceptance row names the primary owner and where integrated proof is collected. All are currently Pending/unverified.

| Runtime §14 scenario | Implementation owner(s) | Integrated proof |
|---|---|---|
| Logged-out cold start | ra-01, ra-12 | ra-14, ra-22 |
| Logged-in cold start | ra-11b, ra-11c, ra-12 | ra-14, ra-22 |
| Warm startup | ra-07, ra-11b, ra-11c, ra-13 | ra-14, ra-22 |
| Account/practice switch during hydration | ra-07, ra-13 | ra-14, ra-22 |
| Failed logout, reload/new tab | ra-06, ra-13 | ra-14, ra-22 |
| Offline grant absent/expired | ra-12, ra-13 | ra-14, ra-22 |
| Revocation during open stream | ra-06, ra-13 | ra-14, ra-22 |
| Browser leader closes | ra-11b, ra-11c | ra-14, ra-22 |
| Complete browser request workflow | web-00 through web-11 | web-17, ra-22 |
| Browser denial-response workflows | web-12 through web-15 | web-17, ra-22 |
| Generated assertion provenance | web-00, web-08 through web-15 | web-17, ra-22 |
| Old tab versus new schema | ra-11b, ra-11c, ra-20 | ra-22 |
| Crash between row/checkpoint | ra-11b, ra-11c | ra-14, ra-22 |
| Entity/list projection batch | ra-08, ra-11c | ra-14, ra-22 |
| Rebuild with unsent draft | ra-13, ra-15, ra-20 | ra-22 |
| Expired Electric handle/refetch | ra-05, ra-11c | ra-14, ra-22 |
| Lost command response | ra-02, ra-03, ra-20 | ra-22 |
| Browser update with dirty work | ra-20 | ra-22 |
| Administrator/agent signing | ra-03 | ra-22 |
| Browser quota/eviction recovery | ra-11b, ra-11c, ra-20 | ra-22 |
| Two desktop windows, SQLite parity, native update/migration | ra-17 through ra-19, ra-21 | Deferred native certification after browser Passed |

UI stage 2 live authentication is ra-12 after runtime 1–4 prerequisites. UI stage 3 is ra-14 through ra-16, including annotations and authorized sources. The web child now implements UI stages 4–5 for the complete request and denial-response workflows. Browser stage-6 behavior is certified by web-17 and ra-22 after ra-20; native and physical-mobile claims retain separate later gates.

All four invariants are explicit: three-state identities/rendering ra-08/14; independent clinical checks ra-02/03; single generated token source ra-16 and certification equality checks; no query-cache dependency/ownership ra-10/14. D1 is resolved only by ra-11c/14, D2 by ra-07/13, and D3 by ra-12. The assessment's SWR and key/id findings are required work, not dismissed warnings.

## Change artifacts and execution contract

After plan review, create one root OpenSpec change per full ID above using the configured spec-driven schema. Each includes proposal.md, specs/<change-id>/spec.md, design.md and tasks.md. IDs are phase-unique; all tasks start unchecked. KBD registers the same full IDs and order without marking implementation complete. OpenSpec requirements are new because the root spec store is empty; do not overwrite accepted architecture documents or historical phase artifacts.

Use the CLI-resolved planningHome/changeRoot/artifactPaths when creating files. Verify every change with strict OpenSpec validation and check that proposal capabilities, requirements, task criteria and dependency IDs match this plan. Do not invent a parallel native change set.

Next operator command after planning: `/kbd-execute runtime-architecture`. Its first eligible change is `ra-01-verified-session`; ra-10 can be assigned independently under the ownership rule. G-PIN, G-DATA and native decision gates remain gates, not presumed approvals. No application work starts in this turn.

## Completion and limits

ra-14 may produce a specific read-path closure receipt after the real adopted application passes its authorized synthetic browser proof. Publication remains blocked until all required invariants, applicable acceptance cases and unresolved review/decision gates are satisfied. A candidate install, fixture-only UI or PGlite snapshot cannot close that blocker.

This plan is deliberately larger than “call the adapter”: the observed mounted command path accepts caller authority, and the current adapter neither writes clinical SQL nor gives the timeline reactive ownership. Omitting those seams would reproduce the previous green-but-disconnected result. Each change is bounded to its named operation/runtime seam; if implementation grows beyond one agent session, split it before execution and preserve the dependency/acceptance mapping.

PLAN COMPLETE
