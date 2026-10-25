# PatientGPT · design prototype

The chat-first prior authorization prototype that PatientGPT is being built
from: a ChatGPT-shaped workspace for Advanced Spine & Orthopedics where
patients sit where projects would and each case is a conversation. This folder
is the design reference for the web app, the Tauri desktop app and the Flutter
mobile app. Everything in it is synthetic.

## What is here

| File | What it is |
|---|---|
| `patient-chat-storyboard.html` | The guide: seven cases to work and each navigation click with the screen it produces. Published as the site's index page. |
| `patient-chat.html` | PatientGPT itself. Open it in a browser; it needs no server. File names keep the original `patient-chat` prefix so published links stay valid; the product name shown everywhere is PatientGPT. |
| `patient-chat/` | Its styles and scripts (see below). |
| `patient-chat-og.png` | The prototype's home screen, 1200×630, used as the link-preview image. |
| `publish-ipfs.sh` | Publishes this folder to the IPFS node under the IPNS name `pa-workbench-chat`. |
| `data-model.md` | The proposed PatientGPT data model: what it adds over the workbench schema, what it derives, and what it never stores. Read it before building. |
| `schema/patient-gpt.sql` | PostgreSQL DDL for that model, applied after the workbench `aso` schema; loads cleanly against `docs/design/schema/schema.sql` + `schema-ai.sql`. |
| `brand/` | The PatientGPT mark, "Spine in conversation" (chosen 4 October 2026): `icon.svg`, `mark.svg`, `mark-dark.svg`, `favicon.svg`, `wordmark-light.svg`, `wordmark-dark.svg`, raster `exports/` (1024, 180, 192, 512, favicon 32/16 and `.ico`), and `brand/patientgpt-brand-board.html`, the brand board that shows the mark in every application surface with its rules. The three concepts it was chosen from stay under `brand/concepts/`. |

Live copy (stable link, updated by re-running the script):
https://ipfs.prometheusags.ai/ipns/k51qzi5uqu5dltw9o2136sbfbw34e1vjvdgl12jvt09n10t9z0dr9gd6q4abf4/

## How the prototype is put together

Classic scripts under one global, loaded in order from `patient-chat.html`.
Each file stays under about 500 lines.

| File | Owns |
|---|---|
| `tokens.css` | Design tokens, light and dark, borderless Flat 2.0 primitives, focus as a fill swap. |
| `shell.css`, `thread.css`, `surfaces.css`, `panel.css` | App shell, conversation, agent and surgeon surfaces, Files panel and viewers. |
| `ui.js` | DOM helpers, inline icon set, case state track, menus, dates. |
| `data.js`, `data-docs.js` | Synthetic patients and cases with one working record each; chart and policy documents. State, next move and blockers are derived from the record. |
| `agui-stream.js` | AG-UI-shaped event stream: run, step, tool call, streamed text, state delta (JSON Patch), interrupt, timestamp playback. |
| `a2ui-renderer.js` | Allowlisted A2UI-shaped surface renderer. Unknown components and actions are refused in place. |
| `conversations.js` | Conversations scoped to all patients, one patient or one case; seeded history. |
| `search.js`, `search-ui.js` | Simulated vector search over embedded case content. |
| `runs.js`, `runs-scope.js`, `flows.js` | The scripted agent: case runs, global and patient runs, per-case questions, attached-document handling, peer-to-peer, payer status. |
| `host-controls.js`, `records.js` | Surgeon-only controls drawn by the app (gates, signing, packet, call outcome) and the viewers for every generated record. |
| `files-panel.js`, `thread.js`, `composer.js`, `nav.js`, `shell.js` | Files and evidence panel, conversation drawing, composer, left navigation, routes and chrome. |

## Rules the prototype holds

- A criterion changes only when a document is filed. A surgeon's answer is recorded as a statement, never as chart evidence.
- The agent never affirms a gate, signs, submits or records an outcome; those controls are drawn by the app for the signed-in surgeon.
- No approval odds. Reports run CASE, CRITERIA STATUS, CONFLICTS, BLOCKERS, NEXT MOVE. One question at a time.
- Met, gap and void always carry a label and a shape, never color alone.
