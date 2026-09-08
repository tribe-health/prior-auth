# RA-03 task 1.3 — durable clinical command reconciliation

2026-09-06. Runtime-architecture / Execute. Driver task 3 of 8.
Result: **Passed** for this implementation unit. RA-03 remains in progress.

## Delivered behavior

Evidence reassessment is now an authoritative clinical command. Its mutation
accepts a command ID, one of `met` / `gap` / `void`, and the expected
`assessedAt` revision. Identity, practice and authority come from fresh verified
context. `AppServices` and PostgreSQL each require current `annotate` authority,
case/evidence scope and a matching revision before one evidence update, one audit
event and one immutable command receipt commit in the same transaction.

The checksummed `2026090603_durable_reassessment.sql` migration adds the local,
RLS-protected reassessment ledger and least-privilege read, lookup and command
functions. Exact command replay resolves the immutable receipt before mutable
target validation. Reusing a command ID with a changed case, evidence, target
state or expected timestamp returns a command conflict. A stale timestamp returns
a revision conflict, and a no-op state transition is refused.

Axum exposes matching reassessment mutation and receipt lookup routes. Signing
now also exposes an explicit receipt lookup, and its service resolves an exact
stored receipt before reading the already-signed target. Both replay paths still
recheck current clinical authority and compare every payload field, including the
command ID. Gate policy recognizes all three routes and performs its independent
read-only capability and scope check.

Desktop declares the same signing lookup, reassessment mutation and reassessment
lookup operations. They return `NativeAuthenticationUnavailable` until RA-17
provides a native credential owner. Their accepting-port tests prove the wrapper
cannot bypass this boundary.

The evidence timeline hook retains the command ID after an uncertain transport
result, offers explicit receipt lookup, and waits for authoritative projection
before changing the displayed evidence state. It never publishes a clinical
command through PEM. The existing affirmation hook also uses its feature HTTP API
and explicit receipt lookup without PEM replay. There is no web signing caller.

ADR-002, ADR-009, the application runtime architecture and React UI architecture
now describe the same operation, reconciliation, projection and PEM boundaries.

## Verification and observed output

Tier 0 passed for every touched Rust crate using `RUSTUP_TOOLCHAIN=1.97.1`:

- `cargo check -p aso-host` and `cargo clippy -p aso-host --no-deps`: exit 0.
- `cargo check -p aso-server-axum` and
  `cargo clippy -p aso-server-axum --no-deps`: exit 0.
- `cargo check -p aso-desktop` and
  `cargo clippy -p aso-desktop --no-deps`: exit 0.
- `cargo check -p aso-web-server`: exit 0.
  `cargo clippy -p aso-web-server --no-deps` exited 0 with the existing
  `default_constructed_unit_structs` warning for `MemoryCriteriaRepo::default()`
  at `main.rs:99`. Task 1.4 owns removal of production memory composition.
- `pnpm --dir web typecheck` and `pnpm --dir web lint`: exit 0.
- Python source compilation, Gate YAML parsing, four architecture documents'
  local links, clinical PEM exclusion checks and `git diff --check`: exit 0.

Focused Tier 1 results:

| Command | Observed result |
| --- | --- |
| `cargo test -p aso-host signing::tests` | 5 passed, 0 failed |
| `cargo test -p aso-host reassessment::tests` | 4 passed, 0 failed |
| `cargo test -p aso-server-axum routes::evidence::tests` | 4 passed, 0 failed |
| `cargo test -p aso-server-axum routes::letters::tests` | 5 passed, 0 failed |
| `cargo test -p aso-server-axum routes::gate::tests` | 11 passed, 0 failed |
| `cargo test -p aso-desktop session_contract_tests` | 4 passed, 0 failed |
| `pnpm --dir web exec vitest run src/features/evidence-timeline/hooks/use-evidence-timeline.test.tsx` | 2 passed, 0 failed |
| `pnpm --dir web exec vitest run src/features/surgeon-gate/hooks/use-surgeon-gate.test.tsx` | 12 passed, 0 failed |
| Fresh PostgreSQL reassessment campaign | Passed; 4 lifecycle markers; checksum refusal and cleanup passed |
| Upgrade PostgreSQL reassessment campaign | Passed; legacy cases/affirmations preserved; 4 lifecycle markers; checksum refusal and cleanup passed |
| Fresh PostgreSQL signing reconciliation campaign | Passed; 9 lifecycle markers; checksum refusal and cleanup passed |

The authoritative database receipts are
`reassessment-transaction-fresh-final.json`,
`reassessment-transaction-upgrade-final.json`, and
`signing-reconciliation-fresh-final.json`. Their source hashes match the task
inventory in `task-3-files.json`.

An accidentally broad web test invocation also observed the new evidence tests
pass, but the command exited nonzero because the unrelated existing
`GraphSessionManager > waits for an in-flight close rather than racing it` test
timed out at five seconds. The two intended focused web commands above were then
run directly and passed. No claim is based on the failed broad invocation.

## Negative controls and defects found

Two relied-on reconciliation guards were deliberately broken and restored:

- Bypassing reassessment receipt lookup made the host replay test fail because
  the repository write count became one instead of zero. The transcript is
  `task-3-sabotage-reassessment-replay.txt`.
- Omitting the signing receipt's command-ID comparison made the host test fail
  because a receipt for command 99 was accepted for command 23. The transcript
  is `task-3-sabotage-signing-command-id.txt`.

The passing PostgreSQL campaigns independently exercise exact replay, explicit
lookup, changed-payload conflict, stale-revision refusal, one receipt, one audit
and one clinical effect. The web tests prove uncertain response handling retains
correlation without a second mutation call or local evidence-state change.

## Scope and remaining risk

No T2/T3, workspace build/test, release build, Tauri bundle, physical-device
run, live Kratos request or mounted Gate image was run. Source-level Gate policy
does not certify the deployed companion binary. Native clinical commands remain
intentionally unavailable. Task 1.4 still owns removal of production memory
fallbacks and injected transaction rollback proof.

The uncomfortable limitation is visible in the UI contract: receipt lookup can
prove the command committed while the displayed timeline remains unchanged until
the authoritative projection arrives. Live timeline refresh is not yet mounted,
so this task proves safe reconciliation rather than immediate visual convergence.

No dependency pin, production database, deployment, commit, companion repository
or real patient data was changed. Nothing outside the requested task was added.
Every new guard traces to forged authority, cross-scope receipt access, changed
payload, stale revision, duplicate clinical effect, immutable audit/receipt, or
the explicit PEM exclusion requirement.
