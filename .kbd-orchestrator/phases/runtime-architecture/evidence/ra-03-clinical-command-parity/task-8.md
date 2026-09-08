# RA-03 task 3.1 — final focused verification and adversarial review

2026-09-08. Runtime-architecture / Execute. Driver task 8 of 8.
Result: **Passed**. The change is ready for KBD verification and archive.

## Requirement and observed result

The current 50-file RA-03 source inventory, focused Tier 0 and Tier 1 results, four live PostgreSQL campaigns, eleven red proofs, caller inventory, refinement bundle, and isolated adversarial verdict agree. Verified-context signing and reassessment are mounted over HTTP. Browser mutation controls and executable Tauri IPC are still inactive and are not claimed as delivered.

The review cycle found and repaired publication/table-DDL write-skew, approval races with QA and claim truncation, missing practice scope, navigation loss of uncertain commands, and policy-outage misclassification. The final isolated `gpt-5.6-sol` judge returned no findings across seven checked failure classes. The findings schema passed and the strict anti-sycophancy gate passed at score 0.0.

## Actual commands and observed results

| Check | Observed result |
| --- | --- |
| `RUSTUP_TOOLCHAIN=1.97.1 cargo check -p <aso-host|aso-server-axum|aso-web-server|aso-desktop>` and matching `cargo clippy --no-deps` | Passed: 8/8, no warnings in the final scoped run |
| Focused Rust tests | Passed: host 5 signing + 4 reassessment; Axum 5 letters + 4 evidence + 13 Gate; web-server 2 deployment; desktop 4 |
| `pnpm --dir web typecheck` | Passed: exit 0 |
| `pnpm --dir web lint` | Passed: exit 0; one unrelated warning in `replica-rebuild.test.ts` |
| Exact two-file hook Vitest run | Passed: 25/25 |
| Signing PostgreSQL fresh / populated upgrade | Passed: 25/31 checks, 24 markers each, 6/6 cleanup each |
| Reassessment PostgreSQL fresh / populated upgrade | Passed: 16/22 checks, 7 markers each, 6/6 cleanup each |
| Eleven deliberate red proofs | Passed: every disabled control failed its focused check and every source restored exactly |
| Python/YAML/OpenSpec/link/diff structural checks | Passed: 7 scripts, Gate YAML, 1/1 strict change, 76/76 links, clean diff whitespace |
| `python3 .../refiner/validate.py` | Passed: 109/109 |
| Findings Draft-07 schema and strict sycophancy gate | Passed: schema valid; score 0.0 |

Rust 1.97.1 was used because the project-stated 1.94 toolchain was unavailable. No Tier 2 or Tier 3 command ran. One earlier argument-separator mistake ran the broader web suite: 143 tests passed and one unrelated `graph-session-manager.test.ts` timed out. That run is retained as observed evidence and is not used for the RA-03 pass result.

## Caller and boundary truth

The mounted Axum server uses verified Kratos context and restricted PostgreSQL clinical adapters. Signing and reassessment preserve identity/practice-scoped immutable receipts and repeat Gate, `AppServices`, and database authority checks. Reassessment retains `met`, `gap`, and `void` distinctly. Clinical commands remain outside PEM and local-sync replay.

React hooks carry practice scope and reserve unresolved operations in a process registry keyed by feature, identity, practice, and case. The registry survives navigation and remount within the renderer. It is memory-only, so reload/process-restart recovery remains unverified. The evidence timeline read is mounted, but no reachable browser mutation control exists. Desktop wrappers fail closed and have no Tauri command registration.

## Scope self-check

Files changed for the final critic remediation were migration 0608, its PostgreSQL integration test, signing fixture inventory, three architecture documents, current receipts, and RA-03 review/evidence artifacts. No unrequested additions remain. Every new guard maps to a critic-observed failure or the existing clinical trust boundary. Production Gate deployment, browser rendering, reachable mutation controls, Tauri IPC/native credentials/window behavior, physical devices, and renderer-restart recovery remain unverified.

Machine-readable evidence: `task-8-acceptance.json`. Current inventory: `task-8-files.json`. Final refinement: `review/ra-03-clinical-command-parity/refiner/validation-output.json`. Final review: `review/ra-03-clinical-command-parity/findings.json`.
