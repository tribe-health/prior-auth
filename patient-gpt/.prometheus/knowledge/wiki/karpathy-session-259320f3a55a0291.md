---
type: SessionRecord
id: karpathy-session-259320f3a55a0291
title: Karpathy session 259320f3a55a
tags:
- karpathy
- session-learning
sources:
- resource: session:bb08a33e-9561-4503-a7b8-268d3122f1e8
generated:
  by: pk/1.11.0
  at: 2026-10-25T19:21:11.988829+00:00
created_at: 2026-10-25T19:21:11.988829+00:00
updated_at: 2026-10-25T19:21:11.988829+00:00
revision: 0
---

## Delta

PatientGPT is scaffolded across all three surfaces on one shared Rust core, following the `docs/design` tokens and brand. Everything builds and passes static checks. I saw the web app working end to end myself. Only part of the desktop and mobile behaviour has been observed. No tests were run (the project runs tests only at the end of a phase), and nothing is committed.

| Surface | Result | Evidence |
|---|---|---|
| Rust core | **Passed** | `cargo build --workspace` and `cargo clippy -D warnings` are clean. Every server route answered `curl` correctly, including bad input. |
| Web (React, PGlite) | **Passed (local)** | `pnpm build` passes. I loaded it against the live Rust server: the greeting, sidebar and "Due next" rows rendered, and a chip streamed the reply into History. |
| Flutter | **Passed on simulator only** | `flutter analyze` is clean. In a debug run on the iPhone 17 simulator, the home view showed data from Rust through the bridge, with HTTP pointed at a dead port. |
| Tauri desktop | **Build-only** | It builds, launches, serves all six commands through Tauri, and opens SurrealDB 3.3.0. Every window screenshot came back blank, so the titlebar, a streamed reply and persistence across a restart were not seen. |
| iOS/Android/Tauri release builds | **Blocked** | The project's tier gate blocks these until the KBD phase advances. I left the gate in place. |

All three surfaces use one token source, `assets/templates/design-tokens/tokens.toml`. Its output matches all 60 light and 42 dark values in the prototype. There is no `docs/branding` folder; the brand assets in `docs/design/brand/` were used.

**Where the Praxis standard was overridden:** `docs/design` wins on palette, fonts, layout and navigation, and your contract wins on desktop storage. The full table is in `docs/plan/scaffold-plan.md`.

**Decisions for you:**
- **Desktop storage:** Praxis requires pglite-oxide; your contract says SurrealDB 3.3.0. I followed the contract.
- **Holding SurrealDB at 3.3.0:** `=3.3.0` in `Cargo.toml` doesn't hold its sub-crates. Only `Cargo.lock` keeps them at 3.3.0, and a `cargo update` would quietly move them to 3.3.4. You'd need to commit the lockfile or pin the sub-crates directly.
- **Pins:** the new pins need adding to `versions.toml` by hand. One differs from plan: `build_runner` is 2.16.2, because 2.17.1 conflicts with `riverpod_generator`.
- **Copy:** about 20 new error and loading lines, which the prototype doesn't have, need your review.

**Known defects:**
- Sidebar dates are clipped ("Oct" instead of "Oct 3").
- The wrong patient opens first. The prototype opens the first one due.
- The desktop transport shows errors as `[object Object]` and retries even permanent errors such as "not found".
- When the server serves the built web app, unknown `/api/*` paths return the page instead of a 404.

**Contract gaps:** the stage track, the "Next:" line and the short procedure names need fields the frozen contract doesn't have. The synthetic due dates also read as overdue, because they're counted from today rather than the prototype's fixed date.

The plan and contracts are in `docs/plan/scaffold-plan.md` and `docs/plan/scaffold-contracts.md`. The Praxis extract is in `docs/plan/reference/praxis-ui-standard-extract.md`.

## Root Cause

No explicit root-cause section was captured; preserve this as a session record, not an inferred diagnosis.

## Corrective Actions

Review and promote only reusable findings.

## Session Metadata

- Harness: claude-code
- Session: bb08a33e-9561-4503-a7b8-268d3122f1e8
- Captured: 2026-10-25T19:21:11.066849Z
- Project: /Users/gqadonis/Projects/TribeHealth/kevin/prior-auth/patient-gpt

## Changed Paths

- ../.prometheus/knowledge/.prompt-snapshots/project/current
- ../.prometheus/knowledge/wiki/index.md
- ../.prometheus/knowledge/wiki/log.md
- ../.kbd-orchestrator/phases/runtime-architecture/children/ra06-final-review-cycle-repair/
- ../.kbd-orchestrator/phases/runtime-architecture/children/ra06-revocation-contract-repair/
- ../.kbd-orchestrator/phases/runtime-architecture/evidence/ra-05-authorized-shape-facade/
- ../.kbd-orchestrator/phases/runtime-architecture/evidence/ra-06-bounded-revocation/
- ../.kbd-orchestrator/phases/runtime-architecture/evidence/ra-07-scoped-pem-runtime/
- ../.kbd-orchestrator/phases/runtime-architecture/evidence/ra-08-committed-graph-projection/
- ../.kbd-orchestrator/phases/runtime-architecture/evidence/ra-09-pem-delivery-gate/
- ../.kbd-orchestrator/phases/runtime-architecture/evidence/ra-10-remove-transitive-query-cache/
- ../.kbd-orchestrator/phases/runtime-architecture/evidence/ra-11a-sync-conformance/
- ../.kbd-orchestrator/phases/runtime-architecture/evidence/ra-11b-worker-ownership/
- ../.kbd-orchestrator/phases/runtime-architecture/evidence/ra-11c-sql-materialization/
- ../.kbd-orchestrator/phases/runtime-architecture/evidence/ra-12-public-auth-startup/
- ../.kbd-orchestrator/phases/runtime-architecture/evidence/ra-13-epoch-logout-and-drafts/
- ../.kbd-orchestrator/phases/runtime-architecture/evidence/ra-14-live-evidence-timeline/
- ../.kbd-orchestrator/phases/runtime-architecture/evidence/ra-15-attributed-annotations/
- ../.kbd-orchestrator/phases/runtime-architecture/evidence/ra-16-authorized-source-preview/
- ../.kbd-orchestrator/phases/runtime-architecture/evidence/ra-17-native-session-transport/
- ../.kbd-orchestrator/phases/runtime-architecture/evidence/ra-18-tauri-pglite-baseline/
- ../.kbd-orchestrator/phases/runtime-architecture/review/ra-05-authorized-shape-facade/
- ../.kbd-orchestrator/phases/runtime-architecture/review/ra-06-bounded-revocation/
- ../.kbd-orchestrator/phases/runtime-architecture/review/ra-07-scoped-pem-runtime/
- ../.kbd-orchestrator/phases/runtime-architecture/review/ra-08-committed-graph-projection/
- ../.kbd-orchestrator/phases/runtime-architecture/review/ra-09-pem-delivery-gate/
- ../.kbd-orchestrator/phases/runtime-architecture/review/ra-10-remove-transitive-query-cache/
- ../.kbd-orchestrator/phases/runtime-architecture/review/ra-11a-sync-conformance/
- ../.kbd-orchestrator/phases/runtime-architecture/review/ra-11b-worker-ownership/
- ../.kbd-orchestrator/phases/runtime-architecture/review/ra-11c-sql-materialization/
- ../.kbd-orchestrator/phases/runtime-architecture/review/ra-12-public-auth-startup/
- ../.kbd-orchestrator/phases/runtime-architecture/review/ra-13-epoch-logout-and-drafts/
- ../.kbd-orchestrator/phases/runtime-architecture/review/ra-14-live-evidence-timeline/
- ../.kbd-orchestrator/phases/runtime-architecture/review/ra-15-attributed-annotations/
- ../.kbd-orchestrator/phases/runtime-architecture/review/ra-16-authorized-source-preview/
- ../.kbd-orchestrator/phases/runtime-architecture/review/ra-17-native-session-transport/
- ../.kbd-orchestrator/phases/runtime-architecture/review/ra-18-tauri-pglite-baseline/
- ../.kbd-orchestrator/phases/runtime-architecture/review/ra06c-01-durable-authority-events/
- ../.kbd-orchestrator/phases/runtime-architecture/review/ra06c-02-distributed-gate-fence/
- ../.kbd-orchestrator/phases/runtime-architecture/review/ra06c-03-final-frame-lease/
