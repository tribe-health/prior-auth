## Context

This change implements runtime order 1 from the reviewed [phase plan](../../../.kbd-orchestrator/phases/runtime-architecture/plan.md). Source inspection found reusable primitives but no proof that the composed target path works. Read the assessment and its review supplement before editing.

## Goals / Non-Goals

**Goals:** Replace the production memory affirmation path with verified human context and a Postgres transaction. Introduce the persisted command-result ledger for this operation, binding identity, practice, command ID and payload; install equivalent behavior on fresh and existing databases. Maintain the existing trigger-derived cases.gate_affirmed_at and serve its authoritative read; prevent callers from directly forging the derived value.

**Non-Goals:** No unrelated placeholder views, general dependency refresh, clinical automatic replay or additional graph/query-cache owner. Do not claim native or release evidence from a fixture.

## Decisions

Ownership: ASO: aso-host services/ports, Axum gate routes, Postgres adapter/composition, additive server migrations and desktop command wrapper; Gate: ASO clinical route policy.

Dependencies: ra-01-verified-session. Confirm their implementation evidence before applying this change. This root OpenSpec artifact coordinates the user-named five-repository workspace; companion implementation must run under its own repository rules and only within the explicitly assigned modules.

- Add an additive, checksummed server migration and least-privilege repository transaction for affirmation and its command-result record. Include the existing gate-summary read/trigger behavior and direct-column write refusal.
- Remove body-selected actor authority from mounted affirmation; implement Gate/service/database refusal and the equivalent desktop wrapper contract.
- Test fresh and upgrade installs, all three independent refusals and lost-response/payload-conflict behavior against real Postgres.

Keep the phase's G-PIN, G-REV, G-DATA, G-SYNC, G-NATIVE and G-MEASURE checkpoints. A missing decision blocks its dependent implementation; it does not authorize a default or silent pin override. All new modules and operation contracts described here are proposed until implemented.

## Risks / Trade-offs

Never relax database triggers or use superuser service connections to make the new adapter pass.

Use synthetic data only. Preserve three evidence states, independently enforced clinical authority, generated tokens and no query cache. Reopen cited source before writing; no file-presence or helper-only test can prove an assembled runtime.

## Validation and rollback

Run per-stack T0 after edits and targeted T1 behavior checks when the unit is complete. Test each scenario in spec.md at the actual boundary, including named denial/race/failure cases. Demonstrate sensitive guards fail under controlled sabotage and restore the code. Run artifact-refiner then isolated adversarial review before completion/archive.

Phase T2 includes Rust workspace test/build, web build, Flutter analyze/test and architecture audit; Rust builds are sequential. Broader T3 is restricted to a reached milestone. Never claim a silently skipped prerequisite passed.

Keep additive schema and compatibility steps reversible where possible; preserve current authorized generation until coherent handover. A failed prerequisite or conformance check leaves this change Blocked and dependent work unstarted.

## Task 1.2 implementation contract

The shell-neutral `ClinicalContext` contains verified identity, actor, selected
practice, principal and session expiry. It is not a request-deserializable DTO.
Task 1.3 must construct it from fresh session verification in the trusted host.
AppServices checks human principal, expiry and current capability before calling
the repository. The PostgreSQL command and affirmation trigger independently
check database authority. Selected practice follows current membership,
including when it differs from the user's home practice.

Commands contain command ID, case ID, kind and affirm/remove action. The
immutable result ledger binds identity, practice and command ID to actor and
payload. Command advisory locking precedes case-row locking. Equivalent retries
return the original committed result and original gate snapshot; changed
payloads conflict. The service and PostgreSQL function perform the
identity/practice-scoped command lookup before checking authority over the
payload's target case. This makes a reused command ID conflict even when the
changed case is missing or outside the current practice, without exposing any
other identity's receipt. Explicit lookup remains identity/practice and
requested-case scoped. Reconciliation does not authorize automatic clinical
replay.

`PgGateRepository` requires a restricted login in `aso_gate_executor`, which
receives four function grants and no table writes. The distinct NOLOGIN
`aso_gate_owner` owns the bounded functions and holds only their required table
grants. Runtime validation rejects privileged flags, writes and ownership,
including membership that permits `SET ROLE` without inheritance. Transactions
set local role, identity, actor, practice, principal and expiry, with a
five-second statement limit. Errors and cancellation roll back. Neither role
expands the existing session reader.

The deployment command is `cargo run -p aso-web-server -- --migrate-server`,
with `ASO_MIGRATION_DATABASE_URL` supplied through secrets. Ordinary startup
neither reads this credential nor migrates. The existing ASO schema and RA-01
session-authority bootstrap are prerequisites for fresh installs and upgrades.
SQLx stays at 0.8.3; its migration feature provides locking, transactional
application and SHA-384 checksums in `public._sqlx_migrations`. Applied SQL is
immutable; later changes require another migration. Deployment credentials must
create restricted roles, transfer function ownership and install grants and
policies. They never become service credentials.

The migration reconciles existing gate summaries from all required affirmation
rows before installing direct-column protection. It updates only differing
pairs, preserving correct cases and their update timestamps. Later commands
update or clear the summary transactionally. Prefilled summary inserts and
direct modifications are refused. Affirmation, audit and original result commit
together; failure of any write rolls the operation back.

The ledger has a server-authoritative relational lane and `local` privacy. It
is not replicated, placed in a PEM queue or persisted through Zustand. The
migration refuses all-table and whole-ASO-schema publications; future explicit
table publications must continue to exclude the ledger. No replication or
materializer is introduced.

Task 1.2's receipt records backend-only evidence. Task 1.3 adds the composition
and transport below; full change acceptance remains explicitly separate.

## Task 1.3 transport and policy contract

Set `ASO_GATE_DATABASE_URL` to a non-owner login with executor membership;
`ASO_DATABASE_URL` retains session-reader credentials. Both must name the same
authoritative ASO data deployment; startup compares the parsed host, port and
database before opening the gate repository. The gate adapter is selected explicitly and
requires configured session authority. Without gate configuration, verified
gate operations refuse. Migration credentials are never used by server startup.

GET `/api/cases/{case_id}/gate` returns the authoritative snapshot. POST suffixes
`/affirm` and `/remove` accept only `{commandId, kind}` and return the committed
command result. GET suffix `/commands/{command_id}` reconciles an original
result under both the current identity/practice and requested case. All accept
optional `practiceId` selection, freshly verified; none accepts actor or a
session summary. Errors and successes carry `Cache-Control: no-store`.
After a definitive 403 refusal, the web hook clears its pending command ID;
only an uncertain transport outcome retains an ID for explicit reconciliation.

The four Gate routes use passthrough authentication plus the mandatory
`aso_clinical_authorize` hook. Passthrough does not authorize forwarding: the
hook always obtains a fresh policy decision, including on identity-cache hits.
It forwards original Cookie, Authorization or X-Session-Token, method and URI
to a fixed trusted callback. Ambiguous credentials refuse before forwarding.
The callback URL is deployment configuration, never a request field. Its client
is dedicated and process-wide, disables redirects, proxy discovery and retries,
and has a five-second timeout.
Only 204 permits; 401/403 refuse; other responses and transport failures yield
503. Callback bodies and identity hints are not consumed.

The read-only ASO callback `/internal/gate/authorize` resolves raw credentials
through Kratos and current ASO membership. Mutations require a human principal
with `affirm_gate`; a scoped case read establishes actual practice membership.
The Kratos identity adapter stamps authenticated identities as `User`.
`SessionService` consumes the principal from the trusted identity provider and
refuses `Agent` or `Service` before membership resolution; a future delegated-agent
provider must stamp `Agent` and receives no inherited human authority.
The callback does not call AppServices command execution or its capability port.
The subsequent command route resolves authority afresh and invokes the service,
whose capability check and database write trigger still run independently.
There is no permit token or cached policy result to reuse for later commands.

Desktop mirrors all four domain operations with typed native-authentication
refusal until RA-17. The internal policy callback is a server-only operation.
The existing web feature API now uses command IDs, translates committed
snapshots for its component, and offers explicit reconciliation with no
automatic clinical write retries. Practice selection is an options object, so
an old positional actor identifier cannot compile as a tenant selector. It does
not establish a mounted clinical UI.

The uncomfortable deployment limit: the existing Compose Gate image needs
rebuilding to recognize this new hook. A native debug Gate fixture can prove
the mounted HTTP boundary, but cannot certify the container image, desktop
credential ownership, physical devices or release readiness. The planned
fresh/upgrade and transport failure acceptance tasks remain separate.
