# RA-03 task 2.1 — forged authority and stale signing proof

2026-09-07. Runtime-architecture / Execute. Driver task 5 of 8.
Result: **Passed**. RA-03 remains in progress.

## Requirement and observed result

When a caller submits a forged surgeon actor, the shared mutation schema and
HTTP request schema reject the unknown field before session resolution or
service access. The trusted session context remains the only source of actor,
principal and practice. An agent principal is refused before the signing write
even when the injected authority port would otherwise accept it.

When a verified caller submits a stale letter version, QA revision or signature
version, `AppServices` and the restricted PostgreSQL repository each refuse the
command. The letter remains approved and unsigned. The live database marker was
`signing_service_and_database_refuse_stale_letter_qa_and_signature_revisions`.
The same campaign observed independent administrator, agent and foreign-practice
refusals through the service, restricted function and direct trigger.

## Actual commands and prerequisites

The following commands ran against the current worktree:

| Command | Observed result |
| --- | --- |
| `RUSTUP_TOOLCHAIN=1.97.1 cargo test -p aso-host signing::tests` | Passed: 5 passed, 0 failed |
| `RUSTUP_TOOLCHAIN=1.97.1 cargo test -p aso-server-axum routes::letters::tests` | Passed: 5 passed, 0 failed |
| `RUSTUP_TOOLCHAIN=1.97.1 cargo test -p aso-desktop signing_refuses_even_when_injected_ports_accept` | Passed: 1 passed, 0 failed |
| `RUSTUP_TOOLCHAIN=1.97.1 python3 scripts/test-signing-transaction.py --install-mode fresh --output .kbd-orchestrator/phases/runtime-architecture/evidence/ra-03-clinical-command-parity/task-5-signing-proof.json` | Passed: 16 fixture checks, 10 lifecycle markers, 1 ignored Rust integration test, and 6 cleanup checks |

The live fixture confirmed an existing Docker Compose PostgreSQL service with
the required schema extensions, a configured administrator credential captured
without writing it to evidence, the pinned 1.97.1 toolchain, and an exclusive
fixture lock. It created a disposable database, login and any absent fixture
roles. Cleanup deleted every owned resource.

The machine-readable acceptance receipt is `task-5-acceptance.json`; its live
database source is `task-5-signing-proof.json`. The acceptance receipt records
the exact commands, prerequisites, selected assertions, receipt hash, current
source hashes and remaining unverified surfaces.

## Evidence strength and limits

This is current Tier 1 evidence. The host test covers mutation deserialization,
verified-context enforcement and revision checks. The HTTP test proves a forged
body actor is rejected before the session and service ports are called. The live
PostgreSQL test exercises actual `AppServices` and `PgGateRepository` code under
a non-owner, non-BYPASSRLS executor and observes the unchanged letter after stale
letter, QA and signature inputs.

No application source, migration, dependency, architecture document or
companion repository changed in this task. Only task evidence and append-only
learning records were added. No new guards were introduced. The proof exercises
the existing guards for the explicit forged-authority and stale-revision failure
scenarios.

No T0 was required because no application source changed. No T2/T3,
workspace-wide test/build, release build, mounted production Gate image, browser
UI, native credential owner, Tauri window, physical device, production database,
deployment, commit or real patient data was used. Those surfaces remain
unverified by this task.

The uncomfortable limit is the desktop result: its typed operation contract is
actor-free, but it refuses before clinical ports because native authentication
does not exist until RA-17. This test proves the renderer cannot bypass that
boundary; it does not prove native signing works.

The KBD task-begin hook reported `kbd-memory-log: mirror write failed; lifecycle
continues`. Canonical KBD state advanced to task 5, and this append-only evidence
is the required local fallback. The mirror failure does not weaken the observed
Rust or PostgreSQL results.
