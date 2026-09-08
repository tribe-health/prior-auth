# RA-03 clinical command parity refinement report

Result: **Passed** at the applicable Tier 0 and Tier 1 scope.

RA-03 supplies verified-context signing and evidence reassessment through the mounted HTTP server. Both operations use the durable command ledger, refuse caller-selected clinical identity, repeat authority and revision checks in `AppServices` and PostgreSQL, and retain the three evidence states—`met`, `gap`, and `void`—as separate committed values.

## Delivered behavior

The mounted `aso-web-server` composes `api_router(state)` with restricted PostgreSQL clinical repositories. Signing and evidence routes resolve a fresh verified session and call `AppServices`; their request bodies contain command and clinical data, with no authority-bearing actor field. Gate policy performs its own read-only capability and resource check before the service and database checks run.

Signing requires the current letter, QA, and signature revisions, a committed gate, completed QA, and cited source assertions. Reassessment requires the current evidence revision and clinical authority. Each operation checks the immutable scoped command result before mutable target reads, so an exact repeat or explicit lookup resolves a response lost after commit without creating another clinical effect.

The live PostgreSQL receipts remain bound to current source hashes. Their selected markers cover forged and stale signing refusal, independent administrator/agent/foreign-scope refusal, lost-response reconciliation, `void` to `gap`, and complete `met`/`gap`/`void` transitions with one audit and one command receipt per transition. Every disposable database and role cleanup entry passed.

The final reviews added database controls at both migration and mutation boundaries. Migration preflight and postflight reject all-table, explicit-table, and schema publications containing local command ledgers. Migration `2026090600` installs an OID registry and event triggers before any command ledger migration can commit. Migration `2026090607` is applied in the same pre-ledger pass and serializes `CREATE`/`ALTER TABLE` with publication DDL from DDL-command start. A waiter aborts with SQLSTATE `40001` after the winning transaction commits so its retry reads a fresh catalog snapshot. Relation identity remains protected across rename and schema moves, including moves into an already published schema. Fresh and upgrade fixtures cover both commit orders for schema moves and protected table creation against publication.

Additive migrations make documents referenced by approved or signed letters immutable, including content hash and provenance, and serialize approval with source and QA mutations. Approval cannot return to draft, moving a QA row checks both letters, and a concurrent source edit waits and is refused after approval. Statement triggers also refuse truncation of QA results or source mappings while approved or signed letters depend on them. Migration `2026090608` makes approval take relation locks shared with the QA and claim truncation guards. Under those locks it revalidates all required QA rows, requires document-backed claims, and rechecks each cited document's provenance and page bounds. The fixtures cover both approval-first and truncate-first commit orders for each relation. Corrections require a new document row and letter revision. Fresh and populated-upgrade signing fixtures observed these trigger refusals and preserved the original clinical records.

Signing, affirmation, and reassessment are absent from the shared sync/PEM replay path. The React feature hooks send these commands through feature APIs and the shared HTTP client. Evidence mutation and lookup include the selected practice. Gate and evidence hooks reserve one command slot in a process-scoped registry keyed by feature, verified identity, practice, and case while a request is submitting or its outcome remains uncertain. That owner survives component unmount and navigation until explicit lookup reconciles it. Network exceptions, HTTP 408, and HTTP 5xx responses retain the owner. Gate policy preserves target-reader outages as `503 gate_unavailable`; a verified policy denial remains the hidden `403` response. The actorless evidence-count route is unmounted until it has a verified-context reader.

## Caller truth

The HTTP behavior is mounted in production composition. The evidence timeline route mounts the read component, and its hook contains reassessment and lookup operations, but the component exposes no reassessment control. The surgeon-gate route is still a placeholder, so its hook is not a production browser caller. There is no browser signing caller.

Desktop exposes typed wrappers that fail closed with `NativeAuthenticationUnavailable`. The desktop crate has no Tauri dependency, `#[tauri::command]`, or invoke-handler registration. RA-03 therefore establishes matching operation contracts and refusal behavior for the inactive desktop boundary; it does not establish runnable Tauri parity.

This is the uncomfortable delivery limit: server-side clinical parity is real, while an end user cannot yet invoke the new clinical mutations from either the mounted browser interface or a Tauri window. Later runtime changes own those surfaces.

## Observed verification

Rust Tier 0 used the installed `1.97.1` toolchain because the project-stated `1.94` toolchain is unavailable. `cargo check` and `cargo clippy --no-deps` exited zero without warnings for `aso-host`, `aso-server-axum`, `aso-web-server`, and `aso-desktop`.

Focused Rust Tier 1 results:

- `aso-host` signing: 5 passed; reassessment: 4 passed.
- `aso-server-axum` letters: 5 passed; evidence: 4 passed; gate: 13 passed.
- `aso-web-server` deployment composition: 2 passed.
- `aso-desktop` unavailable-boundary contracts: 4 passed.

The final signing receipts passed 25 fresh and 31 populated-upgrade checks with 24 lifecycle assertions and six cleanup checks each. `bun run typecheck` and `bun run lint` exited zero. Oxlint emitted one warning in `web/src/shared/sync/replica-rebuild.test.ts`. The final correctly scoped hook command passed 2 files and 25 tests, including practice propagation and isolation, command-owned correlation, uncertain HTTP outcomes, synchronous duplicate refusal, and unmount/remount recovery. Eleven negative controls made the focused checks fail when each trust-boundary repair was disabled; every modified source was restored to its exact original hash. The five newest controls cover publication DDL concurrency, approval versus QA truncation, selected-practice propagation, navigation ownership, and policy-outage classification; the eleventh covers approval against concurrent claim truncation. An earlier command included an extra argument separator and ran the broad suite unintentionally; 143 tests passed and one unrelated graph-session-manager test timed out. That timeout is recorded as an out-of-scope observed failure and is not represented as a passing broad-suite result.

Python AST parsing passed for seven affected verification scripts. YAML parsing passed for `docker/flint-gate/config.yaml`. OpenSpec strict validation passed 1 of 1 change. Seventy-six local architecture-document links resolved. `git diff --check` exited zero.

## Verification boundary

No Tier 2 workspace build/test/audit or Tier 3 release, bundle, end-to-end, visual, window, or device check was run. Production Gate deployment, browser rendering, reachable browser mutation controls, Tauri IPC, native credential ownership, Tauri window behavior, and physical-device behavior remain unverified.

The runtime command registry is memory-only. It preserves ownership across React navigation within one renderer process, but a page reload or process restart requires durable server lookup using a command ID retained outside this registry. That restart surface was not exercised in RA-03.

The refiner validates current implementation hashes, recorded live receipts, caller anchors, schema contracts, exact generated-output coverage, and persistent state. It makes no claim beyond those inputs.
