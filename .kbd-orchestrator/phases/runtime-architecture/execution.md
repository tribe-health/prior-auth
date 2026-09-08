# Execution: runtime-architecture

Project: Prior Authorization Workbench
Date: 2026-09-06
Selected backend: openspec
Dispatched to: active Codex session
Backend entrypoint: /kbd-apply <change-id>
Source plan: [plan.md](plan.md)

## Dispatch contract

Root OpenSpec exists and provides inspectable per-task artifacts. KBD remains authoritative for ordering and progress; use its typed CLI and the kbd-apply driver, never edit generated state or run bare opsx:apply. All 24 existing changes are reused.

Every change is frontier class because it crosses authorization, persistence, lifecycle or platform boundaries. The project registry resolves frontier.local to claude-sonnet-4-6. That model is not a callable native agent in this Codex session; actual execution uses gpt-6-astra, the active frontier Codex backend recommended by the reviewed plan. This explicit routing substitution does not change project.json. Independent review must use a distinct judge.

| Order | Change / scope | Entry | Model class / actual model |
|---|---|---|---|
| 1 | ra-01-verified-session: Return an authoritative ASO session and practice scope | `/kbd-apply ra-01-verified-session` | frontier / gpt-6-astra |
| 2 | ra-02-durable-affirmation: Persist authenticated gate affirmation with independent controls | `/kbd-apply ra-02-durable-affirmation` | frontier / gpt-6-astra |
| 3 | ra-03-clinical-command-parity: Use verified context for signing and evidence reassessment | `/kbd-apply ra-03-clinical-command-parity` | frontier / gpt-6-astra |
| 4 | ra-04-projection-grants: Derive replica grants and FRF identity on the server | `/kbd-apply ra-04-projection-grants` | frontier / gpt-6-astra |
| 5 | ra-05-authorized-shape-facade: Serve Electric snapshots and continuations through the authorized facade | `/kbd-apply ra-05-authorized-shape-facade` | frontier / gpt-6-astra |
| 6 | ra-06-bounded-revocation: Expire and revoke active replica delivery within a measured bound | `/kbd-apply ra-06-bounded-revocation` | frontier / gpt-6-astra |
| 7 | ra-07-scoped-pem-runtime: Own hydration, status, listeners and persistence per runtime | `/kbd-apply ra-07-scoped-pem-runtime` | frontier / gpt-6-astra |
| 8 | ra-08-committed-graph-projection: Publish committed replica batches atomically into PEM | `/kbd-apply ra-08-committed-graph-projection` | frontier / gpt-6-astra |
| 9 | ra-09-pem-delivery-gate: Prove and adopt the actual PEM package artifact | `/kbd-apply ra-09-pem-delivery-gate` | frontier / gpt-6-astra |
| 10 | ra-10-remove-transitive-query-cache: Remove the unused bridge that brings SWR into the application | `/kbd-apply ra-10-remove-transitive-query-cache` | frontier / gpt-6-astra |
| 11 | ra-11a-sync-conformance: Prove the selected SQL materializer and commit contract | `/kbd-apply ra-11a-sync-conformance` | frontier / gpt-6-astra |
| 12 | ra-11b-worker-ownership: Own database opening, migrations and leader handover | `/kbd-apply ra-11b-worker-ownership` | frontier / gpt-6-astra |
| 13 | ra-11c-sql-materialization: Apply authorized streams and publish committed graph batches | `/kbd-apply ra-11c-sql-materialization` | frontier / gpt-6-astra |
| 14 | ra-12-public-auth-startup: Mount real public authentication and explicit startup states | `/kbd-apply ra-12-public-auth-startup` | frontier / gpt-6-astra |
| 15 | ra-13-epoch-logout-and-drafts: Fence scope changes and failed logout across tabs and reloads | `/kbd-apply ra-13-epoch-logout-and-drafts` | frontier / gpt-6-astra |
| 16 | ra-14-live-evidence-timeline: Render the first authorized persisted row through graph selectors | `/kbd-apply ra-14-live-evidence-timeline` | frontier / gpt-6-astra |
| 17 | ra-15-attributed-annotations: Persist attributed annotations with scoped draft recovery | `/kbd-apply ra-15-attributed-annotations` | frontier / gpt-6-astra |
| 18 | ra-16-authorized-source-preview: Open cited sources through an authorized adaptive preview | `/kbd-apply ra-16-authorized-source-preview` | frontier / gpt-6-astra |
| 19 | ra-17-native-session-transport: Own native credentials and verified commands in the Tauri host | `/kbd-apply ra-17-native-session-transport` | frontier / gpt-6-astra |
| 20 | ra-18-tauri-pglite-baseline: Run the shared evidence runtime in Tauri with PGlite | `/kbd-apply ra-18-tauri-pglite-baseline` | frontier / gpt-6-astra |
| 21 | ra-19-native-sqlite-parity: Evaluate a native SQLite materializer against the PGlite baseline | `/kbd-apply ra-19-native-sqlite-parity` | frontier / gpt-6-astra |
| 22 | ra-20-safe-browser-updates: Coordinate compatible web code, schema and draft updates | `/kbd-apply ra-20-safe-browser-updates` | frontier / gpt-6-astra |
| 23 | ra-21-safe-native-updates: Update paired native host/frontend bundles safely | `/kbd-apply ra-21-safe-native-updates` | frontier / gpt-6-astra |
| 24 | ra-22-runtime-certification: Certify the assembled runtime against the full acceptance matrix | `/kbd-apply ra-22-runtime-certification` | frontier / gpt-6-astra |

## Ownership, ordering and task protocol

The ownership and dependencies in each design and the source plan govern work across the five authorized roots. Read each companion repository's instructions before editing. Preserve all existing dirty work. Start ra-01-verified-session; ra-10 is independently eligible but no concurrent build shares a target directory.

At each task boundary read the task list, call kbd-apply begin-task, perform and verify that task, then call end-task only for its observed completion. The driver registers tasks in canonical KBD. OpenSpec checklist IDs are positional driver IDs, not the displayed section numbers. All changes remain pending until started; this document is a dispatch contract, not a second mutable completion ledger.

## Decision gates

Carry G-PIN, G-REV, G-DATA, G-SYNC, G-NATIVE and G-MEASURE from the plan unchanged. No immediate operator decision blocks ra-01 eligibility. Verify Kratos transport before choosing header translation; derive ASO membership in the database. Do not activate private replicas or native credentials through this change. G-PIN blocks later main-application PEM adoption until the concrete release/pin decision and artifact exist.

## Verification and completion

Run touched-crate cargo check/clippy at T0; targeted behavioral tests at T1 once the unit is complete. Exercise the mounted Gate/session/Postgres boundary with synthetic identities, non-bypass roles, forged scope and pooled connection reuse. No silent prerequisite skips. Mirror HTTP operations in typed desktop wrappers with inactive native authentication until ra-17.

At change completion run artifact-refiner then isolated adversarial review, verify and archive through kbd-apply only after their required evidence passes. QA/certification failures do not erase completed implementation. No release or external publication is implied. At phase T2 run Rust workspace test/build, web production build, Flutter analyze/test, audit and affected companion gates specified in the plan; do not run those tiers early.

## Fallback and blockers

OpenSpec is already the fallback backend. If the driver or canonical runtime fails, retain the exact failure and repair the supported integration; do not bypass task hooks or fabricate progress. Decision and prerequisite blockers attach to dependent work. The prior publication blocker remains; inherited evidence/certification summaries describe earlier work and do not certify this phase.

## Outputs and reflection handoff

Consume this dispatch contract, [plan handoff](handoffs/plan.handoff.json), OpenSpec task checklists, canonical [progress](progress.json), per-change evidence, review receipts and unresolved gates. Execution setup is ready; implementation completion is determined exclusively by observed criteria and canonical change status.

The uncomfortable limit: a registered change and a checked eligibility task establish no working session, replica or clinical authority. Those require the mounted acceptance evidence.
