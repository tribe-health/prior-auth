# RA-01 task 1.4 — mounted Gate and two-identity pool campaign

2026-09-06. Runtime-architecture Execute, driver task 4 of 8.
Result: **Passed** for task 1.4. RA-01 remains in progress.

The actual Gate image forwarded both synthetic identities through the ASO
session service, real Kratos validation and one shared PostgreSQL backend.
The database lookup observed the correct A/B identity GUC and
`aso_session_reader` role on every successful request. Membership removal,
deactivation, spoofed headers, foreign practices and provider outage were refused.

## File-by-file delivery

| File | Change |
| --- | --- |
| `docker/flint-gate/config.yaml` | Add exact GET session route and local site, passthrough authentication and ASO upstream base URL preserving practiceId. Other routes unchanged. |
| `scripts/test-session-gateway.py` | Disposable Gate/app/provider/database harness with two real Kratos identities, different capabilities, backend/context observation and independent cleanup. |
| `openspec/changes/ra-01-verified-session/design.md` | Document route ownership, forwarding, instrumentation and transport limits. |
| `openspec/changes/ra-01-verified-session/tasks.md` | Task 1.4 completion through KBD. |

Evidence/receipts and append-only memory record the execution. Final hashes are
in [task-4-files.json](task-4-files.json). No permanent Rust, dependency, schema
or companion-repository implementation change was added. Generated probe Python
bytecode was removed. No unrelated implementation or production guard was added.
The mounted negative tests trace to the explicit credential/tenant requirements.

## Commands and observed results

- T0: Python AST parse and PyYAML parse/route assertions: Passed.
  Scoped `git diff --check`: exit 0, no output.
- T0 after controlled Rust restoration: `cargo +1.97.1 check -p aso-web-server`
  and `cargo +1.97.1 clippy -p aso-web-server --no-deps`: exit 0. Three preexisting
  unit-struct-default warnings in unchanged memory composition.
- T1: `RUSTUP_TOOLCHAIN=1.97.1 python3 scripts/test-session-gateway.py`:
  exit 0, **36 checks Passed**, **34/34 responses no-store**. This count includes
  one direct application readiness response and 33 responses through Gate.
  **A backend count: 1; B backend count: 1; shared backend count: 1.**
  [Full evidence](gateway-session.json).
- T1 controlled mutation: remove verified identity GUC setup while preserving
  the rest of the mounted app. A's first valid Bearer request returned 403,
  expected 200; probe exit 1. Restored source byte-for-byte, then T0 and the full
  mounted campaign passed. [Mutation/restoration evidence](gateway-identity-guard.json).
- T0: `openspec validate ra-01-verified-session --strict --json --no-interactive`:
  `valid: true`, `issues: []`, one passed, zero failed.

The runner mounts the checked-in session site/route in an isolated Gate process,
changing only its app upstream port. The exact Gate image ID is in the JSON
receipt. It invokes the actual `cargo run -p aso-web-server` binary with a
restricted disposable login. No runtime credential has migration or write access.

Both identities use Cookie, Bearer and X-Session-Token. Assertions compare all
summary fields against fixture identity, verified session expiry, current DB
revision and practice capabilities. Twelve additional alternating requests prove
connection reuse. Fresh membership removal/restoration and user deactivation
leave the other identity unaffected. Anonymous access remains 401 during provider
outage; credentialed requests return 503 and recover after the outage ends.

The database instrumentation is confined to the disposable database: rename its
original identity function and call it unchanged from a STABLE wrapper that logs
only a unique fixture marker, A/B label, backend PID and reader role. No opaque
credentials or identity UUIDs are logged by that wrapper. Shared database logs
are filtered in memory; only label/count assertions enter the receipt. All owned
databases, roles, identities, sessions, app processes/logs, Gate container/config
and provider proxy were removed after every live attempt.

## Review and observed corrections

An isolated artifact-critic found one P2: a Docker timeout in cleanup escaped the
exception handler and skipped remaining cleanup/evidence. The runner now records
the failed removal and continues cleanup. Independent mocked recheck printed:

```text
Cleanup returned; downstream cleanup calls: ['second', 'base']
Cleanup evidence: {'cleanup': {'disposable_gate_removed': False}, 'result': 'Failed'}
```

The critic confirmed resolution and no remaining actionable scoped findings.
This is task-level source review, not the complete change's artifact-refiner and
adversarial gate. The first live attempt used the nonexistent coordinator role
key; it failed before Gate assertions. Corrected to schema key `staff` and
`deactivated` status; failed attempt and cleanup remain in receipt history.

## Limits and deployment

The uncomfortable transport limit: the current Gate implementation collapses
repeated same-name credential headers. Mixed distinct sources are tested and
refused, but duplicate-header rejection parity with direct ASO HTTP is not
claimed. ASO still validates the forwarded credential freshly. This limitation
must remain visible in full-change acceptance/review.

This campaign mounts the session subset of configuration, not every production
route or policy. Local site matching includes the default Gate port 4456;
deployment hostnames/ports need explicit site configuration. No production
database migration or service credentials were provisioned. The provider outage
is injected by a forwarding proxy; shared Kratos was not stopped.

Database context observation covers successful requests. Denial responses are
tested here; restoration after errors/cancellation is task 1.3 evidence. Native
UI/IPC, HTTP disconnect propagation, production deployment and full-change QA
remain unverified. No T2/T3, archive, commit or publication was performed.
