# PatientGPT

PatientGPT is a chat-first front end for the Prior Authorization Workbench.
It gives a surgeon and their staff the interface they already know from
ChatGPT, and points it at one problem: getting a surgical case from chart to
a cited, signed, submitted authorization letter without learning a new tool.

Patients sit where a chat app keeps its projects. Each prior-authorization
case is a conversation inside its patient. The assistant reads the chart,
checks it against the payer's policy, says what is met, what is missing and
what to do next, and asks one question at a time when only the surgeon can
answer. The surgeon's own acts (affirming the four drafting gates, signing the
letter, submitting the packet, recording a peer-to-peer outcome) are drawn by
the app and never by the assistant.

Advanced Spine & Orthopedics is the first practice; a spine surgeon is the
first user. All data in this folder is synthetic.

## Purpose

The Prior Authorization Workbench (the parent repository) already holds the
authority model: cited evidence in exactly three states, gates that only a
surgeon can affirm, letters that cite every claim, submissions with receipts,
and determinations with custody. PatientGPT exists because the workbench's
screen-per-step layout asks a surgeon to learn where things are. A chat asks
nothing: the surgeon types what they want, and the assistant brings the right
record, the right question or the right control into the conversation.

PatientGPT therefore changes the *interface*, not the *rules*:

| Rule | Where it is enforced |
|---|---|
| A criterion is `met`, `gap` or `void`, and moves only when a document is filed | `case_evidence` and its citations in the workbench schema |
| A surgeon's answer is a statement, never chart evidence | `patient_gpt.surgeon_statements` is never a citation source |
| Nobody but the surgeon affirms a gate, signs or submits | `enforce_gate_authority`, `enforce_letter_signing`, `enforce_submission_gate` triggers |
| The assistant gives no approval odds and never predicts an outcome | outcomes come from a filed determination or a surgeon-recorded call result |
| Every report runs CASE, CRITERIA STATUS, CONFLICTS, BLOCKERS, NEXT MOVE | the report surface in the A2UI catalogue |

## How it is used

Open PatientGPT and you are on the home screen: a chat box and the queue of
open cases by deadline. From there:

1. **Ask anything with no patient selected.** The assistant answers across
   every chart. When a request only makes sense inside one case ("draft the
   letter"), it asks which case and carries the request there.
2. **Click a patient.** The chat is in the context of the whole chart; the
   patient expands to show its cases and patient-level history.
3. **Click a case.** The chat is in the context of that case. The strip above
   the chat shows the case's place in the state machine, the criteria tally,
   the deadline and the next move.
4. **Work the case in conversation.** "Catch me up" produces the report.
   Attach a document with `+` and the assistant reads it and moves the
   criterion it supports. Answer the one question it asks. Send a staff request
   to the coordinator. Ask it to draft; it refuses until you affirm the gates.
5. **Act as the surgeon.** Gates, signing, submitting and recording a
   peer-to-peer outcome are app-drawn controls inside the conversation. The
   assistant pauses at each and waits.
6. **Open Files.** A right-hand panel lists what the case has generated
   (statements, requests, gate record, letter, packet, receipt, brief,
   determination) and the evidence behind each criterion. Everything opens in
   a viewer beside the chat.
7. **Search by meaning.** Search runs over embedded chart passages, criteria,
   letter claims and conversations, grouped by case.

The clickable guide at `docs/design/patient-chat-storyboard.html` walks
through all of this with seven cases at seven different states.

## Surfaces

PatientGPT is one product on three shells, sharing one data model:

| Shell | Role | Notes |
|---|---|---|
| Web (React) | the first certified surface | the same `web/` runtime and entity graph as the workbench; PatientGPT is a view over the shared graph |
| Tauri desktop | the surgeon's office machine | the same React application in the desktop shell; native storage parity follows the workbench's runtime plan |
| Flutter mobile | the surgeon between cases | a thin client over the host API: read the queue, answer the one question, affirm from a phone; no local replica |

The conversational protocol is the same everywhere: assistant turns stream as
AG-UI-shaped events (steps, tool calls, text, state deltas, interrupts), and
anything the assistant *draws* is an A2UI surface from an allow-listed
catalogue. A component or action outside the catalogue is refused in place.

## Repository layout

```
patient-gpt/
├── README.md                 this file
├── docs/
│   └── design/
│       ├── README.md               index of the design reference
│       ├── data-model.md           the PatientGPT data model (read this before building)
│       ├── schema/
│       │   └── patient-gpt.sql     PostgreSQL DDL for the PatientGPT tables, over the workbench schema
│       ├── patient-chat.html       the clickable prototype (PatientGPT itself)
│       ├── patient-chat/           its styles and scripts
│       ├── patient-chat-storyboard.html   the guide: seven cases to work, click by click
│       ├── patient-chat-og.png     link-preview image
│       └── publish-ipfs.sh         publishes the prototype under its stable IPNS address
└── openspec/                 change proposals and specs for the build (OpenSpec)
```

The workbench schema that PatientGPT extends lives one level up, in
`../docs/design/schema/schema.sql` and `schema-ai.sql`, with the applied
server migrations in `../migrations/server/`.

## Live prototype

https://ipfs.prometheusags.ai/ipns/k51qzi5uqu5dltw9o2136sbfbw34e1vjvdgl12jvt09n10t9z0dr9gd6q4abf4/

The address is stable; `docs/design/publish-ipfs.sh` re-publishes the
current files under it. The prototype is deterministic and scripted: seven
cases run end to end, nothing persists across reloads, and free text outside
the scripted intents falls back to search or to "I need more to go on".

## Building it

Start from `docs/design/data-model.md`, which maps every prototype behaviour
to a table, a view or a derivation rule, and names which parts are already
owned by the workbench. The intended order:

1. Apply `docs/design/schema/patient-gpt.sql` after the workbench schema.
2. Expose the conversation, run and surface tables through the host API and
   the authorized replica shapes listed in the data model.
3. Build the React conversation view over the shared entity graph, binding the
   A2UI catalogue to the workbench's existing evidence, gate, letter and
   submission components.
4. Add the Tauri shell, then the Flutter client against the same API.

Design tokens and the Flat 2.0 rules (no borders, fills only, focus as a fill
swap, label-plus-shape states) are in `docs/design/patient-chat/tokens.css`
and the design README.

## Status

Prototype only. Nothing here is wired to the workbench runtime yet, no real
patient data may enter this folder, and the data model is a proposal until an
OpenSpec change adopts it.

## Development team and delivery

The configured [17-role team](TEAM.md) includes a product manager, team lead, UAR
agent-building expert, creative director, design expert and platform specialists.
[Product acceptance](docs/product/team-product-brief.md) traces the full reference
workflows; the [delivery plan](docs/plan/patientgpt-delivery-cadence.md) uses
120-minute increments with web builds each time and full web/Tauri builds every
even increment. Tests and independent review occur only at full-phase completion,
locally. This is setup and planning; production application delivery remains open.
