# RA-01 completion evidence

2026-09-06. Runtime-architecture Execute, driver task 8 of 8.
Completion QA result: **Passed** for the scoped RA-01 session capability.
KBD completion: **8/8 tasks complete, verified and archived**.

## Plan and delivery

The delivered scope is a mounted, server-verified session read. The actual ASO
binary composes `SessionService` with Kratos verification and PostgreSQL membership
resolution. `api_router` mounts `session::router`; the handler invokes the injected
session port. The local Gate session route forwards that operation. The typed
desktop counterpart refuses until RA-17 supplies native credential ownership.

No application code changed during this completion task. Earlier task reports
provide the file-by-file implementation inventory: [task 1.2](task-2.md),
[task 1.3](task-3.md) and [task 1.4](task-4.md). Acceptance mappings cover
[transport and fresh authority](task-5.md), [untrusted hints and refusal states](task-6.md),
and [pooled identity isolation](task-7.md).

The web UI does not yet call this operation. RA-12 owns public authentication and
startup integration; this change's real callers are the mounted HTTP handler and
synthetic Gate/direct HTTP campaigns. Clinical handlers retain their prior
scaffolding until RA-02/03. These limits prevent a session-read pass from implying
that all application operations are authorized.

## Verification at the applicable tiers

Current T0: [task-8-checks.json](task-8-checks.json) records 18 unchanged
source/design hashes and two matching source evidence hashes, three probe scripts
parsed with Python AST, Gate YAML parsing, operator pins, the shell-neutral host
dependency boundary and scoped `git diff --check` exit 0. Strict OpenSpec validation
returned `valid: true`, `issues: []`, one passed and zero failed.

Prior T0, preserved because the implementation hashes match: touched-crate Cargo
check/clippy for host, Axum, web server and desktop exited 0. The web binary retained
three preexisting unit-struct-default warnings in unchanged memory composition.
Prior targeted T1 provider tests reported 3 passed; desktop refusal reported 1
passed. Those execution commands and results are recorded in tasks 1.2/1.3 above.

| Prior T1 command | Recorded outcome |
| --- | --- |
| `RUSTUP_TOOLCHAIN=1.97.1 python3 scripts/test-session-gateway.py` | Passed: 36 checks, 34/34 responses no-store; A/B shared one actual PostgreSQL backend. |
| `RUSTUP_TOOLCHAIN=1.97.1 python3 scripts/test-session-context.py` | Passed: 41 checks, 37/37 responses no-store; all six transaction exit paths passed. |
| Explicit `cargo test -p aso-web-server session_transaction_context_lifecycle -- --ignored --nocapture` inside the context fixture | 1 passed, 0 failed, 0 ignored; clean replacement after cancellation, with the old backend removed. |

The prior campaigns used real Kratos v26.2.0, PostgreSQL on detected port 55432,
restricted disposable database logins and synthetic identities. Gate image,
timestamps and owned-resource cleanup are preserved in [gateway evidence](gateway-session.json)
and [context evidence](context-session.json). These are prior executions, not
claims of current service availability. The [schema receipt](session-schema.json)
records 12 checks, including rerunnable migration, 16 table/statement combinations,
rollback and restricted-role refusal. No live test was repeated in this task.

Existing negative controls deliberately broke provider active-state checks,
membership selection, transaction-local identity, mounted identity setup and
desktop refusal. Each failed before restoration and passed afterward. Those
guards enforce actual credential, identity and tenant boundaries. No new guard,
dependency or unrelated implementation was added during completion.

## Review and lifecycle

Artifact-refiner passed 96 deterministic checks with zero issues, including full
manifest/constraints/state schema validation. The independent artifact critic
found no concrete defects. The configured `k3` REST judge timed out after 180
seconds with exit 3 and no verdict. The skill's documented fallback used a fresh
`gpt-5.6-sol` native agent, distinct from producer `gpt-6-astra`, with only the
mandate and review packet. It returned PASS: zero critical, warning or suggestion
findings, with six checked failure classes. Native-agent isolation is weaker
than the standalone REST request; that fallback is explicit in the receipt.

The findings passed Draft-07 schema validation. The anti-theater script printed
`[adv-gate] PASS (score=0.0, strictness=strict)` and exited 0; direct MCP detection
also returned score 0.0, no classifications and no mandatory correction.
See [refiner output](../../review/ra-01-verified-session/refiner/validation-output.json),
[critic](../../review/ra-01-verified-session/critic.json),
[judge](../../review/ra-01-verified-session/findings.json),
[transport fallback](../../review/ra-01-verified-session/judge-transport.json) and
[report screen](../../review/ra-01-verified-session/sycophancy.json).

The review packet includes tracked changes and complete
untracked RA-01 source files, acceptance criteria, deployment decisions, current
source hashes and synthetic execution evidence. It excludes generation history.

Task-8 completion evidence, the scoped OpenSpec `files.txt` inventory, review
artifacts and append-only memory are the only authored additions in this task.
KBD owns task/change transitions and generated projections. Its verify command
printed `verify: PASS`; archive printed `archived: ra-01-verified-session`.
The [archived change](../../../../../openspec/changes/archive/2026-09-06-ra-01-verified-session/tasks.md)
contains eight completed tasks; the [promoted specification](../../../../../openspec/specs/ra-01-verified-session/spec.md)
passed strict OpenSpec validation with zero issues. Post-archive refiner validation
again passed 96 checks, resolving the original design path to its archive while
retaining the original hash. Historical evidence paths describe execution-time
locations; the completion receipt supplies the archive mapping.

[Completion receipt](task-8-completion.json): canonical change status `complete`,
projection `DONE` / implementation `COMPLETE`, revision 133, phase 1/24 changes
complete, publication BLOCKED. An initial read-only assertion incorrectly expected
the projection label `COMPLETE`; checking its schema and canonical state corrected
that verification assumption. No state repair was needed. The next waypoint is
`/kbd-apply ra-02-durable-affirmation`. No commit or external publication occurred.

## Uncomfortable limits

Gate collapses repeated same-name credential headers; duplicate-header refusal
parity is not certified. Distinct mixed credential sources are refused. Sequential
two-identity reuse and a separate transaction-owner cancellation test do not prove
general concurrency or HTTP-disconnect propagation. Native UI/IPC is unverified.

The tested Gate instance mounts the session subset of configuration; complete
production configuration, existing-database migration and production secret
provisioning were not exercised. Restored databases require incarnation rotation.
The coarse revision is not an active-stream revocation deadline. No T2/T3, release,
physical-device or publication claim is made. The runtime phase publication block
remains until the private read path and remaining phase acceptance are delivered.
