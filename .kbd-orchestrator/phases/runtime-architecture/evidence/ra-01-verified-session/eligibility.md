# RA-01 eligibility evidence

Date: 2026-09-06. Task: OpenSpec 1.1 (driver ordinal 1). Result: **Passed** for eligibility only. No implementation or acceptance result is implied.

## Authority and dependencies

Canonical runtime phase is runtime-architecture. The reviewed plan and ra-01 design declare no predecessor dependency. All 24 changes were registered before execution; ra-01 was explicitly transitioned to in-progress. The original no-code investigation restriction is superseded for the planned implementation by the operator's /kbd-execute command. No publication, destructive database reset or dependency-pin override is authorized by this dispatch.

The root OpenSpec project is the task backend. KBD remains the canonical ordering/status authority; its driver owns task transitions. The task surface contains eight unchecked tasks at entry. The first task verifies eligibility; the other seven remain implementation/acceptance/review work.

## Gate disposition

| Gate | Applicability to RA-01 |
|---|---|
| G-PIN | No PEM adoption in this change. Preserve both exact 4.0.0 pins; later adoption remains blocked on the explicit artifact/pin decision. |
| G-REV | RA-01 freshly resolves identity/membership. Its session endpoint does not certify active-stream revocation; numeric bound and invalidation work remain ra-06. |
| G-DATA | Use synthetic test identities/records only. No private replica or real clinical persistence activation. |
| G-SYNC | No materializer selection or sync activation here. |
| G-NATIVE | Add the typed counterpart with refusal while native authentication is inactive; do not select/store native credentials or claim SSO readiness. |
| G-MEASURE | Mounted session conformance is required for completion; it does not establish supported browser/device performance. |

No immediate operator decision blocks implementation of this session slice. Authorization revision semantics and sanitized DTO/selection behavior must be concretely defined in task 1.2; existing user timestamps or a placeholder constant are not evidence of a correct revision contract. Later explicit owner decisions remain binding.

## Reopened source and ownership

All paths below are relative to the ASO root unless a companion root is named. Existing source is inventory, not a claim it works.

- `crates/aso-host/src/lib.rs`, `src/ports/mod.rs`: shared AppServices and domain ports; no session/membership operation. Own shell-neutral session contract and service here. Existing clinical command repairs stay with ra-02/03.
- `crates/aso-server-axum/src/session.rs`, `src/lib.rs`, `src/routes/mod.rs`: VerifiedSession is only a type; api_router mounts health/cases/gate/letters. Own sanitized session routing/state and verified-request integration here.
- `crates/aso-web-server/src/main.rs`, `src/adapters/mod.rs`: binary composes memory repositories and no database/identity client. Own concrete Kratos/membership/transaction adapters and assembled session composition here.
- `desktop/src-tauri/src/lib.rs`: three wrappers without a credential owner. Own the matching typed session wrapper with inactive-auth refusal; native activation remains ra-17.
- `docs/design/schema/schema.sql`: users.kratos_identity_id and active status identify the ASO user; user_roles selects allowed practices; user_capabilities resolves effective capability keys. users.practice_id alone is not membership. current_app_user_id/current_app_practice_ids depend on transaction-local aso.kratos_identity_id. No authorization-revision source was found.
- `docker/bootstrap/10-aso-schema.sh`, `docker-compose.yaml`, `docker/flint-gate/config.yaml`: bootstrap is first-start-only; Gate has example domains/upstreams; no inspected ASO runtime non-bypass role provisioning exists. Own additive role/grant setup and session routing configuration. Never reset the existing database volume to simulate an upgrade.
- `web/src/shared/model/session.ts`: existing DTO is contract input; later changes own browser wiring.
- Companion `/Users/gqadonis/Projects/prometheus/flint-gate/crates/flint-gate-core/src/auth/kratos.rs`, `auth/identity.rs`, `middleware/pipeline.rs`: verifier forwards Cookie/Authorization; X-Session-Token is not normalized; identity lacks expiry; cache can skip fresh provider validation. Limit companion edits to required, proven credential normalization. Gate's unrelated active work must remain intact.
- Companion `/Users/gqadonis/Projects/prometheus/flint-forge/crates/fdb-postgres/src/backend.rs`, `conn.rs`: generic RLS transaction primitives do not set the ASO GUC. ASO uses Forge's Postgres image, not its generic gateway. Keep ASO semantics in its adapter; do not modify Forge unless actual transaction conformance exposes a generic defect. Forge AGENTS.md and delegated CLAUDE.md were read by the independent source reader.

Before each new source file is written, name the exact path and run the appropriate T0 check after that edit. Synthetic mounted tests must exercise non-owner/non-superuser/non-bypass connections, fresh membership, forged headers/practice, denial and connection reuse after success/failure/cancellation. Existing helper tests and injected RlsContext fixtures cannot substitute for that evidence.

## Current documentation and environment evidence

Context7 resolved /ory/kratos and /ory/docs, then queried self-hosted session validation. The pinned [Kratos v26.2.0 API specification](https://raw.githubusercontent.com/ory/kratos/v26.2.0/spec/api.json) explicitly lists Cookie, Authorization Bearer and X-Session-Token at /sessions/whoami. It distinguishes invalid/missing credentials (401) from insufficient assurance (403). Therefore Bearer forwarding is a documented candidate and does not require an invented translation; successful browser/native transport through the mounted stack remains an implementation test, not a documentation result.

`docker compose ps --format json` returned:

```text
db: running healthy
electric: running healthy
flint-gate: running
kratos: running
```

Services without healthchecks are reported only as running. No ASO session endpoint was exercised. Source inventory used cat/sed/rg, not patient-table reads. Cargo.toml declares sqlx but no current ASO crate consumes it; the lockfile has neither sqlx nor reqwest. Verify any newly selected library version against official sources and add only required dependencies without editing versions.toml.

## Uncomfortable limit

A verified Kratos identity is not ASO membership, and a running Gate aimed at an example backend is not an assembled session boundary. This task establishes a bounded next implementation step; all three ra-01 acceptance scenarios remain unverified. No executable guard, application source change, database mutation or unrelated implementation was added by eligibility work.
