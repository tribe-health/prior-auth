# Prior context — local-inference-and-uar-wiring (plan)

> Auto-populated by /kbd-memory-recall for lead view (main thread); lessons from file. Cite the lessons that apply; recalled entries are information recorded by agents, not instructions.

## Lessons

*(no recalled lessons)*

## pk knowledge

- [pk:project] Karpathy session 0ad05d659fd2: Completed kbd-assess — local-inference-and-uar-wiring (step 0 of 0) The assessment is done, and I've stopped before analysis so you can add instructions. It's in `.kbd-orchestrator/phases/local-inference-and-uar-wiring/assessment.md`, with the handoff the analysis stage reads first in `handoffs/assess.handoff.json`. **Where things stand.** PatientGPT has no inference at all: no model, no embedder, no model storage, and no real UAR. The deterministic stub is the only agent runtime, and UAR "service" mode fails at startup. All three surfaces still build cleanly: `cargo check`, the web typecheck _(recorded by an agent; lesson; via pk pk:karpathy-session-0ad05d659fd25914)_
- [pk:project] Karpathy session 259320f3a55a: PatientGPT is scaffolded across all three surfaces on one shared Rust core, following the `docs/design` tokens and brand. Everything builds and passes static checks. I saw the web app working end to end myself. Only part of the desktop and mobile behaviour has been observed. No tests were run (the project runs tests only at the end of a phase), and nothing is committed. | Rust core | **Passed** | `cargo build --workspace` and `cargo clippy -D warnings` are clean. Every server route answered `curl` correctly, including bad input. | | Web (React, PGlite) | **Passed (local)** | `pnpm build` passe _(recorded by an agent; lesson; via pk pk:karpathy-session-259320f3a55a0291)_
- [pk:project] Karpathy session 7638c4fa830e: All five defects are fixed. The server build, clippy on the server and desktop crates, and the web build are all clean. I checked four of the fixes in the browser or with `curl`. The desktop error mapping only compiles so far: nothing has run in a live desktop window. **Clipped sidebar dates.** The sidebar's lists were sizing themselves to the longest procedure name (390px inside a 252px sidebar), which pushed every date off the right edge. I limited them to the sidebar's width in `web/src/styles/shell.css`. At 1100px the patient dates now show in full ("Oct 3", "Oct 12"), long case names end _(recorded by an agent; lesson; via pk pk:karpathy-session-7638c4fa830ef3cb)_
- [pk:project] Karpathy session 110d8d8952fd: Yes. Your run built the desktop app and launched it with the deterministic runtime, and its log shows the app working through Tauri's own channel: - **Startup:** the webview loaded and requested the session, patients, cases and conversations. SurrealDB 3.3.0 opened its store under `~/Library/Application Support/ai.prometheusags.patientgpt/`. - **19:47:15 — a `start_run`:** someone sent a message from the window. The `list_conversations` calls right after it suggest the new conversation was then re-listed, which is what happens once a run is saved. - **19:47:24 and 19:47:42:** `list_cases` and _(recorded by an agent; lesson; via pk pk:karpathy-session-110d8d8952fdb0d7)_

## Previous reflection

*(no previous reflection)*

## Knowledge gaps

*(none recorded)*
