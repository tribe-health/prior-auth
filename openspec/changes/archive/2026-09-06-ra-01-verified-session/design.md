## Context

This change implements runtime order 1 from the reviewed [phase plan](../../../.kbd-orchestrator/phases/runtime-architecture/plan.md). Source inspection found reusable primitives but no proof that the composed target path works. Read the assessment and its review supplement before editing.

## Goals / Non-Goals

**Goals:** Implement a sanitized session operation backed by active ASO membership in Postgres and verified Kratos identity. Derive subject/practice/principal/capabilities server-side; use transaction-local aso.kratos_identity_id with a non-bypass role. Add the corresponding typed desktop wrapper, inactive until host authentication is available.

**Non-Goals:** No unrelated placeholder views, general dependency refresh, clinical automatic replay or additional graph/query-cache owner. Do not claim native or release evidence from a fixture.

## Decisions

Ownership: ASO: aso-server-axum session/router, aso-web-server adapters/composition, Gate/Kratos deployment config; Gate: Kratos credential normalization only where required. Forge: PostgreSQL substrate and verified transaction-context conformance, without ASO-specific logic in its generic gateway.

Dependencies: NONE. Confirm their implementation evidence before applying this change. This root OpenSpec artifact coordinates the user-named five-repository workspace; companion implementation must run under its own repository rules and only within the explicitly assigned modules.

- Implement verified identity resolution and the ASO membership read in one mounted session path; verify pinned Kratos native-token transport before selecting header translation.
- Add transaction-context setup/reset under a non-bypass DB role and a shell-neutral verified context; mirror the operation in the desktop wrapper contract.
- Exercise mounted Gate/session/Postgres behavior with two synthetic identities and practices, plus unavailable Kratos and forged headers.

Keep the phase's G-PIN, G-REV, G-DATA, G-SYNC, G-NATIVE and G-MEASURE checkpoints. A missing decision blocks its dependent implementation; it does not authorize a default or silent pin override. All new modules and operation contracts described here are proposed until implemented.

## Task 1.2 implementation decisions (2026-09-06)

- `GET /api/session?practiceId=<uuid>` validates raw credentials freshly with the configured self-hosted Kratos provider. Caller identity/role headers and traits grant no authority. Omitted practice selects the ASO user's home practice only if it has a current `user_roles` grant; a requested foreign practice is denied. Multiple credential sources are refused to prevent gateway/service identity disagreement.
- Cookie and native Bearer/X-Session-Token requests share one service and camelCase summary contract. Browser and native logins create distinct Kratos sessions, so each summary must preserve its own verified expiry; equal authorization scope does not imply equal expiry timestamps. The response omits opaque credentials, raw traits and the originating session identifier, and all handler responses use `Cache-Control: no-store`.
- The database owns a coarse global `incarnation:revision` value. Statement triggers on users, user_roles, role_capabilities and capabilities advance it in the same transaction as authority changes, including remove-and-restore sequences. A no-op authority statement may invalidate other users too; that extra invalidation is accepted for this first slice. Read snapshots do not advance it. Restore procedures must rotate incarnation before serving a restored database. This is not the active-stream revocation deadline governed by G-REV.
- Session reads use a dedicated non-owner/non-bypass login, `SET LOCAL ROLE aso_session_reader`, a bound transaction-local identity GUC and a read-only repeatable-read transaction. These are prerequisites for the mounted membership read; task 1.3 still owns the complete context cleanup/parity evidence and task 1.4 the assembled Gate/pooled-connection campaign.
- `docker/bootstrap/25-session-authority.sql` is additive and rerunnable against an existing ASO schema. Bootstrap applies it on a fresh volume; upgrades apply this exact file administratively without deleting the volume. Runtime credentials have no migration/write authority. The database login/password is supplied through deployment secrets, not committed defaults.
- Runtime configuration uses `ASO_DATABASE_URL` and `ASO_KRATOS_PUBLIC_URL` together. Both absent retains the existing clean-checkout service composition with session requests explicitly unavailable; partial configuration fails startup. Plaintext Kratos requires explicit `ASO_ALLOW_INSECURE_KRATOS=true` for local development. Provider redirects are not followed; provider response size and request duration are bounded at the credential trust boundary.
- Required dependencies are exact reqwest 0.12.28 and the already declared SQLx 0.8.3 line, verified against crates.io metadata. Only PostgreSQL/runtime/TLS/JSON support is activated. Existing locked versions and the operator-owned PEM pins remain unchanged.
- The new desktop counterpart refuses with `NativeAuthenticationUnavailable` until ra-17 provides the host credential owner. It accepts no caller-supplied identity or credential. Existing clinical command repairs remain ra-02/03.

## Task 1.3 transaction and wrapper contract (2026-09-06)

The membership adapter owns `begin_scoped`, which accepts the shell-neutral
`AuthenticatedIdentity` produced by the identity provider. The mounted resolver
uses this same transaction owner. It validates the non-bypass runtime role and
sets the reader role, search path, identity GUC and statement timeout locally in
a read-only repeatable-read transaction. Success and membership denial finish the
transaction; errors or cancellation drop its SQLx owner and queue rollback.
No session summary or caller-selected actor is accepted as verified authority.

SQLx 0.8.3 flushes pending rollback during pool release. If the interrupted
query makes its release ping fail, it discards that connection. Verification
requires the same backend and restored settings on normal exits. Cancellation
requires clean settings for the next borrower and, if replaced, proof that the
old backend disappeared. Cancellation can take until the five-second statement
timeout; immediate server-query cancellation is not promised.

`scripts/test-session-context.py` provisions disposable synthetic resources and
explicitly runs the otherwise ignored database contract test. It also runs the
actual HTTP composition with real Kratos and with a controlled provider for
forged role traits and distinct 401/403/503 semantics. The typed desktop wrapper
is exercised with an accepting injected session port but still refuses for both
absent and selected practice. This does not activate native credentials or IPC.

Direct transaction-owner cancellation does not prove HTTP-disconnect propagation.

## Task 1.4 mounted gateway contract (2026-09-06)

The local Gate configuration has an exact GET `/api/session` route on
`localhost:4456` and `127.0.0.1:4456`, forwarding to the ASO host on port 8787.
Its site owns the upstream base URL so Gate preserves the request path and
`practiceId` query. Deployments with other hostnames/ports must configure those
site values explicitly.

This discovery operation uses Gate's anonymous passthrough provider; the ASO
session service freshly validates every credential with Kratos and derives
membership from Postgres. Gate identity headers and cached identity metadata
grant no authority. Gate's own Kratos middleware omits X-Session-Token validation
and would change provider-failure semantics; applying it here would conflict
with the shared browser/native session contract. This decision does not grant
anonymous access to protected clinical operations.

`scripts/test-session-gateway.py` boots an isolated instance of the existing Gate
image using the checked-in session site/route, with only the ASO upstream port
changed for the fixture. It exercises two real synthetic Kratos identities with
different practice grants/capabilities and actual ASO composition. A forwarding
provider proxy injects outages without stopping shared Kratos. The disposable
database wraps its unchanged original identity lookup with label-only log
instrumentation, proving verified GUC, reader role and shared backend reuse.
Instrumentation and all disposable resources are removed after verification.

Known transport limitation: this Gate image collapses repeated same-name
credential headers while forwarding. Mixed distinct sources are refused by ASO;
duplicate-header rejection parity with direct HTTP is not established. Raw
credentials that survive forwarding still require fresh provider validation.
No companion Gate implementation change or native activation is included here.

## Risks / Trade-offs

Readiness for this endpoint does not activate private replicas. Production browser persistence remains unapproved.

Use synthetic data only. Preserve three evidence states, independently enforced clinical authority, generated tokens and no query cache. Reopen cited source before writing; no file-presence or helper-only test can prove an assembled runtime.

## Validation and rollback

Run per-stack T0 after edits and targeted T1 behavior checks when the unit is complete. Test each scenario in spec.md at the actual boundary, including named denial/race/failure cases. Demonstrate sensitive guards fail under controlled sabotage and restore the code. Run artifact-refiner then isolated adversarial review before completion/archive.

Phase T2 includes Rust workspace test/build, web build, Flutter analyze/test and architecture audit; Rust builds are sequential. Broader T3 is restricted to a reached milestone. Never claim a silently skipped prerequisite passed.

Keep additive schema and compatibility steps reversible where possible; preserve current authorized generation until coherent handover. A failed prerequisite or conformance check leaves this change Blocked and dependent work unstarted.
