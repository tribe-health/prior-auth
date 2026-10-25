# PatientGPT scaffold contracts

Frozen for the scaffold, 2026-10-25. Owner: root agent. Shell and Rust work
build against these shapes; a change here is a change to every surface.

## Transport mirror rule

Every operation exists three times with the same name and DTOs:

| Operation | Axum route | Tauri command | FFI function (`patient-gpt-ffi`) |
|---|---|---|---|
| health | `GET /api/health` | `health` | `health()` |
| session | `GET /api/session` | `session` | `session()` |
| list patients | `GET /api/patients` | `list_patients` | `list_patients()` |
| list cases | `GET /api/patients/{patient_id}/cases` | `list_cases` | `list_cases(patient_id)` |
| list conversations | `GET /api/conversations?scope=<scope>` | `list_conversations` | `list_conversations(scope)` |
| start run | `POST /api/runs` → `text/event-stream` | `start_run` (events on a `tauri::ipc::Channel`) | `start_run(request, sink: StreamSink<AguiEvent>)` |

All three call the same `patient_gpt_host::AppServices`. No shell implements
behaviour of its own.

## DTOs (JSON, camelCase on the wire; Rust uses `#[serde(rename_all = "camelCase")]`)

```text
Health            { status: "ok", version: string }

Principal         { id: string, displayName: string,
                    role: "surgeon" | "coordinator" | "administrator",
                    kind: "human" | "delegated_agent" }
Session           { principal: Principal, practice: string }

PatientSummary    { id: string, displayName: string, payer: string,
                    caseIds: string[] }

EvidenceState     "met" | "gap" | "void"          -- never collapsed, never boolean
CriteriaTally     { met: number, gap: number, void: number }
CaseSummary       { id: string, patientId: string, procedure: string,
                    payer: string, closed: boolean,
                    due: { kind: string, date: string /* YYYY-MM-DD */ } | null,
                    tally: CriteriaTally }

ConversationScope { kind: "all" } | { kind: "patient", patientId: string }
                  | { kind: "case", patientId: string, caseId: string }
                  query-string form: "all" | "patient:<id>" | "case:<patientId>:<caseId>"
ConversationSummary { id: string, scope: ConversationScope, title: string,
                      updatedAt: string /* RFC 3339 */ }

Citation          { documentId: string, documentTitle: string, page: number,
                    date: string /* YYYY-MM-DD */ }

RunRequest        { conversationId: string | null, scope: ConversationScope,
                    message: string }
```

## AG-UI events (scaffold subset; `type` discriminator, SCREAMING_SNAKE values)

```text
RUN_STARTED          { type, runId, threadId }
TEXT_MESSAGE_START   { type, messageId, role: "assistant" }
TEXT_MESSAGE_CONTENT { type, messageId, delta: string }
TEXT_MESSAGE_END     { type, messageId }
RUN_FINISHED         { type, runId, threadId }
RUN_ERROR            { type, message: string, code: string | null }
```

The deterministic `UarRuntimeFacade` emits RUN_STARTED, one assistant text
message, RUN_FINISHED. Its text is exactly:

> The agent runtime is not connected in this build. No chart content was read.

## ContentBlock (Rust enum; mirrors in TS and Dart are sealed unions)

Variants: `Text`, `Thinking`, `Code`, `Citation`, `Memory`, `ToolUse`,
`ToolResult`, `Skill`, `Artifact`, `Image`, `Divider`. The scaffold renders
`Text` and `Divider`; every other variant renders a labelled placeholder
`Not rendered in this build: <variant>` rather than being dropped. Switches are
exhaustive with no default arm.

## Synthetic fixture

Ported from `docs/design/patient-chat/data.js` (synthetic): patients kaminski,
delgado, brennan, vasquez, raman and cases PA-2026-0431, PA-2026-0212 (closed),
PA-2026-0447, PA-2026-0419, PA-2026-0452, PA-2026-0398, with their payer,
procedure and due fields as written there. Principal: the surgeon shown in the
prototype greeting. Lives in `patient-gpt-host` only; shells never embed it.

## Storage lanes (scaffold)

| Surface | Store | Holds |
|---|---|---|
| Browser | PGlite (IndexedDB `idb://patientgpt`) | local-lane conversation list and drafts; privacy class `local` |
| Tauri | SurrealDB 3.3.0 embedded via `patient-gpt-storage` | same records through the core `ConversationStore` port |
| Flutter | none (API/FFI reads, per `docs/design/data-model.md`) | — |
| Server | in-memory adapter behind the same port; Postgres via Forge is later | — |

Clinical records (patients, cases, criteria) are never written by any shell
store.

## Error codes (as built)

HTTP body `{ code, message }`. Host codes from `HostError::code()`:
`invalid_input`, `not_found`, `not_implemented`, `storage_failed`,
`runtime_failed`. HTTP adds `invalid_scope`, `missing_scope`,
`invalid_run_request`. FFI adds `invalid_scope`, `invalid_uar_mode`,
`uar_unavailable`, `not_initialized`, `already_initialized`, `runtime_failed`,
`runtime_join_failed`. Over FFI, scope crosses in its query-string form and AG-UI
events cross as a flat `FfiAguiEvent { kind, ... }`; both are parsed strictly.
