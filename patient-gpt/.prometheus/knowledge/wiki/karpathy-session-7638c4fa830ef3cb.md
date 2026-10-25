---
type: SessionRecord
id: karpathy-session-7638c4fa830ef3cb
title: Karpathy session 7638c4fa830e
tags:
- karpathy
- session-learning
sources:
- resource: session:bb08a33e-9561-4503-a7b8-268d3122f1e8
generated:
  by: pk/1.11.0
  at: 2026-10-25T19:31:46.797924+00:00
created_at: 2026-10-25T19:31:46.797924+00:00
updated_at: 2026-10-25T19:31:46.797924+00:00
revision: 0
---

## Delta

All five defects are fixed. The server build, clippy on the server and desktop crates, and the web build are all clean. I checked four of the fixes in the browser or with `curl`. The desktop error mapping only compiles so far: nothing has run in a live desktop window.

**Clipped sidebar dates.** The sidebar's lists were sizing themselves to the longest procedure name (390px inside a 252px sidebar), which pushed every date off the right edge. I limited them to the sidebar's width in `web/src/styles/shell.css`. At 1100px the patient dates now show in full ("Oct 3", "Oct 12"), long case names end in an ellipsis with their date still visible, and the sidebar no longer scrolls sideways.

**First-due patient.** The sidebar picked which patient to open as soon as patients loaded, before every patient's cases had arrived, so the order was still changing. It now waits until each patient's cases are in. Delgado, the earliest due, now opens on load. The fix is in `use-patient-directory.ts` and `use-sidebar-nav.ts`.

**Tauri error mapping and retries.** Desktop errors now keep the host's `code` and `message`, and the HTTP side reads its error body the same way. Errors about bad input or a missing record now fail at once instead of retrying.
- In the browser: opening an unknown patient showed "The PatientGPT server answered 404: patient `nobody` not found" within two seconds, and the request was not retried three times.
- The desktop path has the same logic but has only been type-checked.

**Host top inset.** The web app now has a `--host-inset-top` variable in `web/src/styles/app.css`. It moves the app, the scrim, the phone drawer, the Files and canvas overlays, and the focused skip link down by that amount. The desktop title bar sets it to 40px and is now `position: fixed`, so it no longer overrides any of the web app's layout classes.
- With 40px applied at 375px wide, the app, scrim and drawer all run from 40px to 760px.
- Fixing this exposed two smaller problems, both fixed:
  - the phone drawer's `height: 100%` ran 40px past the bottom of the screen;
  - the hidden skip link peeked out under the bar, because the browser doesn't update an in-progress animation when the variable changes. Now only its focused position moves; when focused it sits at 48px.
- How it looks in the actual desktop window hasn't been checked; the earlier window screenshots came back blank.

**`/api` fallback.** When the server also serves the built web app, any unknown `/api` path now returns a JSON 404 instead of the HTML page, for example `{"code":"not_found","message":"no API route at /api/nope"}`. App routes such as `/p/kaminski` still load the page. The fix is in `crates/patient-gpt-server/src/lib.rs`.

Nothing is committed.

## Root Cause

No explicit root-cause section was captured; preserve this as a session record, not an inferred diagnosis.

## Corrective Actions

Review and promote only reusable findings.

## Session Metadata

- Harness: claude-code
- Session: bb08a33e-9561-4503-a7b8-268d3122f1e8
- Captured: 2026-10-25T19:31:42.191868Z
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
