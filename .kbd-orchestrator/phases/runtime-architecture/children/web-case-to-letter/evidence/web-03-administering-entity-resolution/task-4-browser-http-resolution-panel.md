# Web-03 task 1.4 — browser HTTP and resolution panel

Result: **Passed** at focused Tier 0 and Tier 1.

## Delivered boundary

- The mounted Axum API exposes authoritative resolution read, resolve, and exact command lookup routes with `no-store` and verified-practice selection.
- The independent gate authorization callback recognizes all three routes. It checks `case:read` or `resolve_administering_entity` and authorizes the case target before forwarding.
- The web feature slice contains typed API/model boundaries, a session/practice/authorization/case/view scoped Zustand hook, and a responsive shadcn card mounted in the case dashboard.
- The card renders entity, criteria set, submission channel, appeal path, effective dates, every named parked state, permission state, uncertain-command reconciliation, and committed reload.
- Evidence navigation is absent and replaced with an explicit lock until the durable state is exactly `resolved`.
- Compact layouts use one-column fields and full-width controls; wider layouts use two columns. Motion uses short `motion-safe` entry and progress patterns.

## Observed verification

- `pnpm --dir web exec vitest run` for session parsing, resolution API, scoped hook, panel, and case-detail gate — **19 passed** across five files.
- `cargo test -p aso-server-axum administering_entity_http -- --nocapture` — **2 passed**.
- `cargo test -p aso-server-axum gate_policy_requires_case_capabilities_and_never_mutates -- --nocapture` — **1 passed**.
- Fresh mounted Axum → AppServices → restricted PostgreSQL run — **Passed** with four retained assertion groups, including HTTP reload, exact lookup, and foreign-practice refusal.
- Populated-upgrade mounted run — **Passed** with the same four assertion groups and preservation of preexisting case and gate data.
- `pnpm --dir web typecheck` — exited 0.
- `pnpm --dir web lint` — exited 0.
- `cargo check -p aso-server-axum -p aso-web-server` — exited 0.
- `openspec validate web-03-administering-entity-resolution --strict` — valid.
- Scoped `git diff --check` — exited 0.

Receipts:

- `task-4-fresh-http-ui.json`
- `task-4-upgrade-http-ui.json`

## Failed run retained as evidence

The first UI command accidentally forwarded an extra `--` through the package script and ran the full web suite. The three new feature files produced two failures because this repository does not install jest-dom matchers; four unrelated storage/PGlite tests also failed or timed out under the concurrent broad run. The panel assertions were rewritten with standard DOM properties and the exact five-file focused command then passed 19 tests. No unrelated test source changed.

## Scope boundary

This is focused route/component proof, not complete actual-browser certification. Web-17 owns the full browser scenario. Tauri and mobile were not changed and remain deferred until Web-17 passes.
