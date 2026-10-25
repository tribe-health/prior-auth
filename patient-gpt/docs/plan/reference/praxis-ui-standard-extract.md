# Praxis UI/UX standard — implementation extract

Source: `plexis.md` (scrape of "KnowMe Praxis", Architecture & Functional
Specification 1.2, dated 20 October 2026; line 1–7). All `Lnnn` references are
line numbers in that scrape. The document calls itself "an engineering
specification and proposed integration design ... not a release announcement"
(L15). Most UI material is carried as "source requirement, not release
evidence" under governing clauses WS-, HOME-, UI-, RT-, CT-.

What was read: chapter 01 (L30–910, incl. S00 Agentic Triptych, S28
Conversation UX Strategy, S40 Shell Operating Philosophy, S41 Workspace pane
layout), chapter 02 corrections (L911–1010), chapter 03 home + specimen
(L1012–1808), chapter 04 head (L1810–1836), seven-layer stack (L2495–2640),
Sansaba SSW-ARCH-001 (L3838–4470), AG-UI transport S23 (L4655–4875), chapter
08 RT clauses + TJ-ARCH-MOB-001 (L9748–10470), platform policy (L10722–10760),
UAR integration S29 (L10803–10990), chapter 09 UI-01..12 (L11241–11290), gen_ui
spec S03 ContentBlock/A2UI/AG-UI/HITL (L11594–12480), Flutter UIX-001 S05
(L12478–13420), **KnowMe UI/UX Standard S06 (L13424–14125)** — the single most
load-bearing source — A2UI strategy S18/S19/S22/S29 (L14170–14550), RTC
chapter 11 head (L17319–17345), SEC chapter 12 head (L17421–17437),
acceptance gates chapter 14 (L18208–18240). Later chapters (context fabric,
models, plugins, BossFang, LiveKit detail) were grepped for UI terms; they
contain little shell guidance beyond what is cited.

---

## 1. Shell philosophy and invariants

Short verbatim quotes, each with its line.

| # | Quote | Line |
|---|---|---|
| P1 | "Intent should survive the conversation." | L11 |
| P2 | "Home, a focused conversation, a document, a small application, and a live call are states of one workspace. Their data and authorization contracts remain stable as the layout changes." | L13 |
| P3 | "The navigator identifies the current work container. The conversation expresses intent, records progress and decisions, and exposes the actions taken. The canvas holds durable artifacts and applications. A tool rail provides local operations on the active artifact." | L32 |
| P4 | "Short answers remain in the thread; a canvas opens when there is something worth keeping or operating." | L32 |
| P5 | WS-01 "Container before form." ... "A title can be provisional; identity and provenance cannot." | L34 |
| P6 | WS-02 "A stream of model text is not the evidence that a file was saved or an effect completed." | L36 |
| P7 | WS-03 "Layout as a mode." ... "switching modes does not move records to a different store." | L38 |
| P8 | WS-05 "The agent cannot approve itself, manufacture consent, or treat a generic 'continue' as permission for a different destination or object." | L42 |
| P9 | WS-06 "Visible context." Each removable context item has a provenance link. | L44 |
| P10 | WS-07 "No three-column miniature is permitted." | L48 |
| P11 | Triptych rule 2: "Treat the thread as the record." | L318 |
| P12 | Triptych rule 5: "Approvals live in the thread, and the agent never approves itself." | L327 |
| P13 | Triptych rule 6: "Hidden context is how a confident answer ends up about the wrong customer." | L330 |
| P14 | Shell philosophy: "One agent channel (AG-UI) with two presentation surfaces differing only in trigger and presentation" | L647 |
| P15 | "Single source of truth for shared state (one durable store; no divergent local copies)." | L658 |
| P16 | "Bind the surface to state, not to a single run (runs are episodic writers)." | L659 |
| P17 | "Keep A2UI to declarative composition of catalog primitives + Actions; push imperative logic to the agent/A2A side." | L665 |
| P18 | "Frozen/third-party -> iframe; net-new agentic -> A2UI surface." | L666 |
| P19 | KnowMe UI/UX Standard status: "Binding product-design standard", applies to React 19 web/PWA, Tauri desktop, Flutter iOS/Android | L13426–13427 |
| P20 | "Do not use lines or borders anywhere. Differentiate adjacent screen areas and components only with background-color changes." | L13511 |
| P21 | "Flat does not mean blank" (four-level surface ladder) | L13553 |
| P22 | "React and Flutter must express the same semantic design system, not merely similar colors." | L14027 |
| P23 | "Pixel identity between browser and Skia is not required; semantic token and interaction parity is." | L14035 |
| P24 | AG-UI vs A2UI: "AG-UI is the event transport vocabulary; A2UI is the validated declarative rendering contract." | L4686–4687, L14277–14278 |
| P25 | "The component vocabulary _is_ the sandbox." | L14281 |
| P26 | "React and Flutter are deliberately thin clients in this loop." | L14500 |

Invariants carried into every conversation change (S28 §4, L581–591):
Flat 2.0 + token-sourced styling + both themes (L583); the 11-variant
ContentBlock union stays closed, lifecycle/telemetry travel in the run-event
envelope (L584); `Widget → @riverpod provider → Repository → FFI` and blocks
mutate only via `ChatNotifier.streamBlock` (L586–587); reasoning is displayed,
persisted and excluded from future prompts (L588); mutating tools always
confirm, destructive actions are branch-scoped and disabled while the branch has
an active run (L589–591).

Experience qualities (S06 §2.3, L13485–13499): Personal, Local-first,
Inspectable, Calm, Fast, Honest ("never fake completion"), Continuous.

## 2. Layout / pane model per form factor

### 2.1 The responsibilities (all form factors)

Navigator (container list) / Thread (control plane and record) / Canvas
(payload: document, table, preview, embedded app) / optional Tool rail
(L32, S00-003 L201–215). The container noun should be "the noun your users
already use for 'the file'" (L316).

### 2.2 Desktop and wide web

Two arrangements, chosen by active work (WS-03, L38):

- **Conversation-forward:** navigator | thread | canvas (original triptych).
- **Application-forward:** navigator | application (center) | assistant (right)
  — the San Saba shell (L38; Sansaba "three planes" L3940–3953).

Sansaba three-plane definition (L3944–3946): Navigation (left) selects a Mini
App; Content (center) hosts it; Conversation (right) is the agent chat sidebar.
Implemented as "an edge-to-edge shadcn shell: a fixed left navigation plane, a
fluid center plane, and a fixed right assistant plane" (L3895–3897).

Canvas states: closed, docked, expanded, full-width. "Resizing is keyboard
accessible and persisted per device, with safe minimum widths." (L38)

Canvas widths from the workspace-pane brief (S41 §2, L721–728):

| Mode | Width | When |
|---|---|---|
| Docked (default) | 560px; 500px on screens up to 1280px; never under 480px | Beside the conversation (L723) |
| Expanded | about 760–980px | User widens canvas (L724) |
| Full width ("focus") | Workspace width minus navigator and rail | User, or app via `layout.intent` (L725) |
| Phone sheet | Full screen between workspace top bar and bottom bar | Phones and tablets up to 820px; 44px touch targets (L726) |

The workspace draws a one-line strip above an embedded iframe ("Following
D-0149 · same sign-in"); the embedded app must not draw its own outer border or
background gradient (L728).

S06 §5.1 desktop rules (L13645–13655): branded custom titlebar in Tauri with
platform-correct window controls; left rail/sidebar for top-level
destinations; main work area within sensible reading widths, data views may
expand; active destination = ember-tinted background + label/icon emphasis, not
an outline; persistent system status (active model, local/remote lane, sync,
readiness) available without opening settings.

Specimen dimensions (illustration only, synthetic, L1029–1030): top bar 44px
with macOS traffic lights, logo, flex spacer, status pill (L1105–1120); left
rail 208px on `chrome` (L1124); chat library column 260px on `surface` (L1196);
conversation header 58px (L1222); home content `padding:32px 40px`,
`max-width:1000px`, `gap:26px` (L1142). These are specimen values, not stated
normative widths.

### 2.3 Tablet

S06 §5.3 (L13668–13675): "Prefer an adaptive rail plus flexible content."
Conversation history may become a collapsible pane; "it must not permanently
consume the reading area." WS-07: "Tablet split views are an enhancement over
the same navigation state." (L48) Pane brief treats tablets up to 820px as phone
sheet (L726).

### 2.4 Phone and narrow web

- Navigator becomes a drawer or route; canvas becomes a full-screen
  destination; Back returns to exact thread position and composer draft; a
  persistent call strip survives internal navigation (WS-07, L48).
- "On a small screen, the navigator becomes a drawer and the canvas a
  full-screen sheet with a back button. The thread stays home." (L331–332)
- S06 §5.2 (L13657–13666): replace rail with bottom navigation "based on width,
  not OS sniffing"; keep composer above safe areas and keyboard; two-column
  capability grid only when labels stay readable; "Never squeeze the desktop
  sidebar into a narrow rail of unexplained icons."
- Specimen phone frame 390×844, bottom nav 64px on `chrome`, rail and library
  hidden (L1776–1779, L1488).

### 2.5 Breakpoints

The document does **not** fix global shell breakpoints. HOME-05: "Text scale and
content fit, not device names, decide breakpoints. The document's 860 px
reading-layout breakpoint is not an application platform mandate." (L1024)
Container-level values exist only in the embedded-pane brief (S41):

| Container width | Behaviour | Line |
|---|---|---|
| < 440px | Drop record-type word, icon-only Save; label-above fields | L793, L813 |
| ≥ 440px card | 132px label column beside field | L814 |
| ≥ 300px card | Paired fields side by side, labels above | L815 |
| < 640px | One-column section grid; dialogs become bottom sheets | L809, L835 |
| ≥ 640px | Two columns max ("do not use" three narrow columns) | L809 |
| < 720px | Table rows render as cards | L822 |
| ≥ 900px pane | Hide section-chip row | L811 |

Review widths: 320, 768, 1024, 1440 CSS px in both themes (L14096). Flutter
goldens at 320 and 768 px, text scale 1.0 and 2.0 (L13357–13358).

### 2.6 Chat screen regions (S06 §7.1, L13754–13765)

1. Conversation library (multiple conversations, search, new, rename, pin,
   archive, delete, grouping).
2. Conversation header (title, model/lane identity, readiness,
   sync/provenance, contextual actions).
3. Thread viewport (virtualized, stable scroll).
4. Composer (multiline, attachments, voice where supported, model/lane access,
   stop/regenerate, send).

Wide: library is a Shadcn sidebar. Narrow: Shadcn sheet/drawer from the header
(L13763).

## 3. Navigation model and home screen

### 3.1 Destinations

- Resolved 2026-07-19: shell keeps **five** destinations (Home, Chat, Hands,
  Memory, Settings); Models folds into Settings → Model & Inference; "There is
  no sixth bottom-bar destination." (L497–501). This supersedes the 6-tab state
  recorded in UIX-001 (L12594, L12629–12638), which flagged the
  `mobile-navigation` 5-destination cap.
- Selecting another container "changes the visible context, thread list,
  dashboard query, artifact scope, and suggested actions together" (L34).
- App-shell plugins mount as "a navigation peer of Chat/Settings/Memory"
  (L14224).
- Sansaba nav grouping is a manifest field `navSection`, independent of what
  renders (`surface.kind`) and of `protected` (L3875, L4145–4150, L4192).
- UI-11: persist "selected IDs and semantic navigation state, not fragile pixel
  widths"; "Back navigates; cancellation is an explicit operation." (L11275)
- Selecting another conversation "must cancel only view subscriptions; it must
  not cancel an unrelated background run" (L13915–13916).

Chat sub-surfaces (UIX-001 §4.3, L12649–12657): conversation library sheet,
documents panel, run/context inspector, model detail, settings sections. Sheets
use `shadcn_flutter` overlay primitives restyled Flat 2.0 (scrim, no shadow, no
border), reachable by screen reader and keyboard.

### 3.2 Home (chapter 03)

- HOME-01 (L1016): four regions under one context — prompt composer,
  dashboard cards, prompt suggestions, A2UI mini applications. Empty home
  centers the composer with a short invitation and 3–6 suggestions; an
  established workspace docks the composer at the bottom of the primary
  region. "Avoid duplicate composers competing for focus."
- HOME-02 (L1018): initial cards — Continue working, Needs your decision,
  Recent artifacts, Scheduled Hands, Active calls, optional Private Dot. Each
  shows freshness, owner/actor, container, explicit action. Loading, empty,
  offline, stale, denied, error are distinct. "A card never reports zero when
  a request failed." Permission-filter before aggregation (no leaking badge
  counts).
- HOME-03 (L1020): suggestions are editable drafts, never executable commands;
  show why each appears and which data scopes it uses; dismiss/pin/refresh/
  disable personalization.
- HOME-04 (L1022): home surfaces persist by `surface_id` + `container_id`;
  pin, resize within spans, reorder, full-screen, close, restore. Layout
  persistence is separate from business state.
- HOME-05 (L1024): compact order = context/title, critical decision card,
  suggestions, dashboard, mini apps, safe-area-aware composer. Above a measured
  breakpoint cards form a two-column grid.
- HOME-06 (L1026): restore container, scroll, draft, card order, surfaces after
  process death; revalidate grants before enabling controls.
- HOME-07 (L1028): "expose a single decision inbox with counts by urgency and
  source"; "Cards are not a place for simulated activity."
- HOME-08 (L1032–1036): Activity states: draft, queued, running, waiting for
  input, waiting for approval, waiting for dependency, waiting for host, pause
  requested, paused, cancellation requested, cancelled, failed, completed,
  unknown/reconciling. "Do not invent progress percentages from token
  generation."
- HOME-09 (L1038–1042): "One composer owns the active draft." Drafts per
  container/thread; failed sends keep draft and attachments; IME composition
  does not trigger send; double submit uses an idempotency key.
- HOME-10 (L1044): 22-state screen inventory required for acceptance (empty,
  returning, calm, partial failure, offline, docked/expanded canvas, phone
  routes, dirty form with conflict, unsupported catalog, blocked plugin,
  approval expired, 200% text, keyboard, etc.).
- S06 §9 Home: "an instrument panel, not a marketing page. It immediately
  answers 'Is the AI ready?' and 'What can I do?'" (L13979)
- Acceptance G02 Home continuity (L18213).

## 4. Conversation / chat UX rules

### 4.1 Streaming (S06 §7.4, L13803–13811)

Echo user message immediately; one assistant message updated incrementally
("do not append one message per token"); preserve Rust pipeline event order;
auto-scroll only while near bottom, otherwise show "jump to latest"; provide
stop, retry, copy, branch, feedback; no generic spinner when events exist;
persist incrementally so a crash does not erase a long response.

### 4.2 Turn anatomy (UIX-001 §6.1, L12700–12726)

Ordered regions: (1) thinking outside the answer bubble; (2) lifecycle strip
while active, collapsing to a summary line; (3) activity panels
(tool/skill/memory) in stream order; (4) answer bubble — maximal contiguous
text/code/artifact/image/divider runs, "capped at 80% of viewport width (max 720
px), left-aligned"; (5) citations adjacent to supported content; (6) terminal
error/cancelled bubble; (7) right-aligned action row. Region backgrounds from
the surface ladder; "No region may introduce a border, divider, or shadow."

- Lifecycle strip (L12783–12809): phase icon + human label ("Retrieving
  memories", "Reading document", "Selecting tools", "Generating") + elapsed +
  Stop (44px, accessible name "Stop generating"); polite live region announcing
  phase changes only; completion summary e.g. "Generated in 8.2 s · on-device ·
  CPU"; pre-phase state "Preparing response". Named phases replace spinners
  (L12538–12544).
- Thinking (L12728–12757): expanded while streaming, auto-collapses when answer
  content begins unless user overrode; "Thought for 42 s" duration; plain text,
  no Markdown; cyan-tinted surface. **Conflict:** S06 §7.5 says thinking is
  "Collapsed by default" (L13824). The later UIX-001 behaviour is more specific;
  consumer must choose.
- Citations (L12759–12781): compact source chips at end of the answer run they
  cite; tap opens card with title, excerpt, provenance; presentation re-flow
  only, recorded order unchanged (decision L508–511).
- Error bubble (L12811–12834): safe message, phase chip, stable code in mono,
  retry when retryable; non-retryable states recovery path; crash-restored
  variant "Interrupted when the app closed".
- Tool/skill/memory panels (L12836–12857): status not raw JSON; AlwaysConfirm
  card with tool name, mutation description, parameters, consequence, Confirm /
  Deny (44px, safe default = Deny, announced as alert).
- Backend chip (L12859–12871): mono metadata "model · backend · lane"; lane
  wording "On-device / My server / Cloud provider".
- Actions (L12879–12903): copy block/answer/message, stop, resubmit (new
  branch), regenerate, delete; disable rule is branch-scoped; delete copy states
  blast radius. Branch navigator `‹ 2/3 ›` (L12905–12924).
- Composer/attachments (L13018–13077): per-chip extraction states (pending →
  extracting → OCR → ready → failed); conversation-scoped documents panel with
  "Promote to Knowledge".
- Conversation library (S06 §7.8, L13901–13917; UIX-001 §11, L13177–13196):
  backed by persisted entities; search titles + text; pinned/recent/archived/
  local-only/synced/branched views; running/failed/unread badges; recency groups
  Today / Previous 7 Days / Older; per-conversation model, lane, draft,
  attachments, last-read position.
- Visual treatment (S06 §7.7, L13888–13899): assistant responses read as
  authored content, "not as an endless stack of outlined bubbles"; user
  messages may use ember-tinted fill aligned trailing; composer anchored by a
  filled surface, "do not draw a box around it"; errors never raw
  `invoke`/JS/Rust strings.
- Specimen: user bubble radius `16px 16px 4px 16px`, `max-width:70%`, emberTint
  fill (L1249); assistant column `max-width:78%` (L1253); composer textarea on
  `muted`, radius 12px (L1318); round 38px send button that becomes Stop (red)
  while streaming (L1323, L1789); Enter sends, Shift+Enter newline (L1608).

### 4.3 ContentBlock (closed 11-variant union)

Variants (L11594–11700; TS form L10259ff): `text`, `thinking`, `code`,
`citation`, `memory`, `toolUse`, `toolResult`, `skill`, `artifact`, `image`,
`divider`. "Adding a new ContentBlock variant produces compile errors at:
MessageBubble._buildBlock() and A2uiContentDriver._handle()" (L11603–11608).
Switch with no `default` (L12526–12527). New AG-UI families map to envelope /
lifecycle / artifact channels, "never to new block variants" (L4861–4862).
"New protocol variants must cause compile-time exhaustiveness failures until
React and Flutter renderers are implemented." (L13837)

Required presentation per variant (S06 §7.5 table, L13819–13835): Text
streaming Markdown; Thinking cyan flat surface with duration metadata; Code
language label + copy + highlighting; Citation inline markers + expandable
source cards; Memory read/proposed/written/updated/rejected; Tool use named step
with pending/running/completed/failed; Tool result paired with its call; Skill
identity/status/summary; Artifact dedicated preview, preserve source/download;
Image alt text + provenance; Divider "Spacing or surface transition only—never a
visible line"; AG-UI state delta updates visible state "without dumping raw
JSON"; Confirmation request = accessible dialog with consequences and safe
default.

Rich media (S06 §7.6, L13862–13886): CommonMark + GFM tables/tasks/
footnotes; Mermaid lazy with source fallback; sanitized SVG, no script/handlers;
media with controls, no autoplay; no unsafe raw HTML; each format a typed React
renderer registered with the Assistant UI thread, lazy, with error boundary;
rich content opens in sheet/dialog or side-by-side artifact workspace.

### 4.4 AG-UI transport (S23, L4655–4870)

- Wire profile `uar.agui/1` (L4699). Families: `RUN_STARTED/FINISHED/ERROR`,
  `STEP_*`, `TEXT_MESSAGE_START/CONTENT/END`, `REASONING_*`, `TOOL_CALL_START/
  ARGS/END/RESULT`, `STATE_SNAPSHOT`, `STATE_DELTA`, `MESSAGES_SNAPSHOT`, `RAW`,
  `CUSTOM` (L4702–4706).
- Envelope: `type, profile, eventId, sequence, threadId, runId, messageId,
  toolCallId` (L4707–4708). `eventId` dedupes, `sequence` orders (gap =
  protocol error), `threadId` scopes (L4798–4800).
- Normalization chain: `uar.agui/1 → StreamEvent → A2uiEvent → ContentBlock`;
  "No layer is skipped and no layer leaks upward" (L4782–4789).
- Client→runtime intents are commands, not events (L4820–4826).
- Persist raw envelopes (`agui_events`) beside materialized blocks; replay
  rebuilds thread without the model (L4834–4838).
- Unknown payloads → `ArtifactBlock` records; "never silently drops"
  (L4863–4864, L10959–10960).
- Event-to-block mapping table (L10945–10957).
- Activity/event inspector: same ordered stream at progressive depth (L13839–
  13852); UIX-001 unifies it with the context inspector (L13079–13083).

### 4.5 A2UI rendering

- UI-01..05 (L11243–11251): one approved catalog; fail closed with "an inert
  labeled fallback"; send semantic actions, not keystrokes; surfaces have
  explicit revisions and bind to watched graph state; ContentBlock vocabulary
  closed, raw frames belong in an inspector.
- UI-09 (L11259–11265): pin A2UI protocol version separately from renderer and
  catalog versions; catalog IDs are identifiers, not fetchable URLs; dirty
  local values survive server patches; "Closing a surface changes layout only".
- Selection: declare → resolve → negotiate → interact; partial support renders
  supported components plus labeled fallback (L14381–14411).
- Thin-client action envelope: `sourceRunId, surfaceId, sourceComponentId`,
  action name/context, timestamp, client data model; clients do not synthesize
  continuation prompts (L14500–14507).
- Renderers inherit tokens and Flat 2.0 from host theme; "plugins cannot go
  off-brand by construction" (L14463 block, S22 §6).
- A2UI traffic rides the AG-UI stream and the `artifact` ContentBlock — "no
  parallel UI channel" (S22 §6, ~L14467).
- Conversation vs application surface: same AG-UI channel and catalog; center
  surface assembled on `mount`/`navigate`, durable; chat surface episodic
  (L3961–3969).
- Flutter generative slots: `AguiRenderSlot.register(...)` (L12438–12475).

### 4.6 Decision items / human-in-the-loop

- WS-05 (L42): sending, signing, paying, publishing, representing a person
  cross action boundaries; the thread shows prepared object, destination,
  scope, costs, named authority; approval bound to effect digest, invalidated
  when material fields change.
- CT-01 domain type `Decision(id, container_id, effect_digest, authority,
  status, expires_at)` (L1822).
- HITL pattern: agent emits confirmation request, runtime parks a oneshot,
  Flutter `AguiConfirmationOverlay` shows dialog, `AguiClient.confirm()` resumes
  (L11801–11839).
- UI-09: "The host confirms privileged actions using its own labels, candidate
  details and authority checks." (L11263)
- Embedded apps: workspace may fill a form via `entity.apply` but "Never save
  automatically. A person reviews and saves." (L859)
- HOME-07 single decision inbox (L1028). Goal-spec `Decision` struct with
  `cost_of_delay` (L3692–3710) is KnowMe goal-management specific.

## 5. Design system

### 5.1 Flat 2.0 (S06 §3, L13501–13566)

Required treatments (L13519–13536): separation by adjacent background tokens;
hover = hover token; selection = accent-tinted background + stronger text/icon;
**keyboard focus = "a high-contrast focus background plus a visible icon,
label, or state cue so focus does not depend on color alone"** (L13528); inputs =
distinct filled field background; tables = row background changes, no grid
lines; modal priority = dim canvas + distinct modal surface, no drop shadows.

Prohibited (L13538–13551): any decorative `border`/`outline`; 1px rules; card
outlines (even hover); bevels, glassmorphism, gradients, glossy controls;
layout drop shadows; default Material `Divider`, `OutlineInputBorder`, outlined
buttons; unmodified Shadcn border styling; status by color alone.

Surface ladder (L13555–13562): 1 Canvas, 2 Chrome (titlebar, sidebar, bottom
nav, utility areas), 3 Surface (panels, composer, menus), 4 Raised (selected,
expanded, modal, streaming). Empty states must explain value and offer a first
action (L13564).

### 5.2 Color roles (S06 §4.1, L13574–13595; identical to specimen L1508–1520)

| Role | Dark | Light | Use |
|---|---|---|---|
| canvas | #0B0F14 | #F7F7F8 | app background |
| chrome | #111620 | #FFFFFF | navigation, persistent chrome |
| surface | #161D29 | #FAFBFC | panels, grouped regions |
| raised | #1C2535 | #FFFFFF | selected/expanded/modal |
| hover | #202B40 | #F2F4F7 | pointer/keyboard interaction |
| muted | #253044 | #EEF0F3 | inputs, secondary controls, skeletons |
| text | #E8EDF3 | #0B0F14 | titles, body |
| textSecondary | #A7B0BC | #4B5563 | supporting |
| textFaint | #6B7280 | #6B7280 | metadata |
| ember (brand/action) | #FF6A3D | #E04E28 | primary action, active destination |
| cyan (AI annotation) | #00C2DC | #0891B2 | reasoning, citations, streaming, user-owned remote AI |
| success | #22C55E | #16A34A | ready/connected/completed |
| warning | #F59E0B | #D97706 | degraded/attention |
| error | #EF4444 | #DC2626 | failed/destructive |

Specimen-only tints: emberTint `rgba(255,106,61,0.14)` / `rgba(224,78,40,0.10)`,
emberTintHover 0.22 / 0.18, cyanTint `rgba(0,194,220,0.12)` /
`rgba(8,145,178,0.10)` (L1511–1519). "Legacy `border` tokens should resolve to
transparent or be removed." (L13595) Status/role semantics (ember = action,
cyan = AI, green/amber/red = status only) at L13576. The hex values are KnowMe
brand values (see §9).

### 5.3 Typography (S06 §4.2, L13601–13608)

Space Grotesk — display headings and concise titles, tight tracking; Inter —
navigation, controls, labels, normal copy; Roboto — optional long-form and
assistant prose; JetBrains Mono — code, model IDs, timestamps, measurements,
event labels, metadata, "not entire screens". Body 15–17 logical px; "Do not
shrink core UI copy below 12 logical pixels"; respect OS/browser text scaling,
no fixed-height text containers. Specimen loads Space Grotesk 600/700, Inter
500/600/700, Roboto 400, JetBrains Mono 500/600 (L1077). Specimen sizes (not
normative): greeting 32px/700 at −0.02em (L1145), screen title 26px (L1337),
card value 19px (L1151), mono labels 11px with 0.06em tracking (L1144), nav
label 13px/600 (L1133), bottom-nav label 10px (L1497 — below the 12px floor;
specimen inconsistency).

### 5.4 Shape, spacing, motion (S06 §4.4, L13626–13634)

Modest consistent radii; pills reserved for compact status, model/lane
identity, metadata; 4px base with rhythm 4, 8, 12, 16, 24, 32, 48; motion
explains state change with short opacity/background transitions; honor
`prefers-reduced-motion` and Flutter accessibility settings; "Never animate
merely to make an idle screen feel busy." Specimen radii: 12px cards, 10px nav
items and blocks, 8px small controls, 999px pills (L1126, L1149, L1197, L1116);
pulse keyframe `km-pulse` 1.4s for running states (L1084, L1723). No easing
curves or durations are specified anywhere.

Reduced-motion detail (UIX-001 §14, L13338–13341): auto-scroll instant; strip
transitions, panel expansion, sheets opacity-only or instant; no parallax or
physics animations.

### 5.5 Logo and icons (S06 §4.3, L13614–13620)

KnowMe K monogram and wordmark (brand-specific). One coherent line-icon family,
"normally Lucide on React and its closest semantic Flutter equivalent"; icons
support labels and do not replace them for unfamiliar or consequential actions.

### 5.6 Theming and token source

- "Generate both CSS variables and Flutter `ThemeData`/`ThemeExtension` values
  from one versioned token source." (L14029)
- Flutter: tokens projected into `KnowMeTheme`/`KnowMePalette` in
  `mobile/lib/core/theme/tokens.dart`; "no raw `Color(0xFF…)` or magic
  `EdgeInsets` at call sites" (L12522–12525).
- Do not use stock `ThemeData.dark()`, `ColorScheme.fromSeed`, outlined fields,
  `Divider`, default elevation (L14032).
- UI-07: "Dark mode is a first-class validation target, not a color inversion."
  (L11255) Tints verified "against resolved foreground pairs, not token names"
  (L13343).
- React and Flutter token hashes/parity checks must pass (L14099).

### 5.7 Accessibility and focus

- WCAG 2.2 AA: 4.5:1 body, 3:1 large text and components, both themes;
  accessible names; keyboard/focus order; `liveRegion` for streaming/status;
  "≥24 px targets (44 px primary touch)"; reduced motion; 200% text
  (L12576–12580).
- UI-06 Flutter targets: 44pt iOS / 48dp Android; composer stays above keyboard;
  announce meaningful status without reading every token (L11253).
- S06 §11 (L14041–14054): keyboard-only nav, logical focus order, skip
  navigation, landmarks; icon-only controls need accessible name + tooltip;
  polite live regions; expanded/collapsed state programmatic; destructive
  actions explain scope; privacy/execution labels use text + icon.
- UIX-001 §14 (L13315–13348): confirmations use alert semantics, safe default
  focused first, destructive last, Escape = safe choice; Escape cancels a run
  when focus is in the thread; Stop always keyboard-reachable; text scaling
  verified at 130% and 200%.
- UI-10: modal dialogs trap focus, make background inert, restore focus to the
  invoker (L11271).
- Acceptance G15: keyboard-only, labels, focus return, contrast, reduced
  motion, dynamic type, "no page-level horizontal overflow" (L18226).
- Every evidence/status renders with text, not color alone (L13551, L14054).

## 6. Platform-specific rules

### 6.1 Web (React)

- Component stack (S06 §6.1, L13683–13693): Shadcn UI for general primitives
  ("buttons, inputs, menus, dialogs, sheets, sidebars, tabs, tooltips, scroll
  areas, command palettes"); Assistant UI owns thread, composer, message
  lifecycle, thread list, streaming, actions, attachments;
  `@prometheus-ags/gen-ui-react` owns exhaustive ContentBlock rendering; no raw
  HTML controls where a Shadcn primitive exists. All defaults restyled Flat 2.0.
- State (S06 §6.2–6.3, L13699–13744): "TanStack Query is not part of the
  KnowMe architecture." PEM 3.x = entities/queries/mutations/reactivity; Zustand
  = ephemeral (active thread ID, draft, selected blocks, open panels, temporary
  stream assembly, scroll intent, presentation prefs); PGlite in IndexedDB,
  "preferably through a shared worker for safe multi-tab ownership" (L13705);
  SurrealDB = graph memory/RAG. Chain: `Component → feature hook →
  Zustand/PEM → platform transport → database or Rust command` (L13712).
  "keeping conversations in an in-memory Zustand array, while PGlite is merely
  present as a dependency, does not satisfy persistence" (L13740–13744).
- CT-03: normalize by `(type,id)`; lists hold IDs (L1827); "There is no
  sideways data flow between components" (L3984).
- Sansaba web stack: Axum BFF serving React SPA; REST `/api/v1/entities/:type`,
  `POST /agui/:agent` SSE, `POST /a2ui/v1/surfaces/assemble`, `GET /sync/watch`
  (L4232–4241); definition of done includes "zero `fetch()` in components"
  (L4468). Frontend features under `src/features/<module>/`, entities under
  `src/entities/` (L4403–4406).
- Browser default inference is WebLLM when WebGPU available (L13792) —
  KnowMe-specific; browser clients do not embed UAR (L10874–10876).
- Data model minimum records: conversations, messages, content_blocks,
  agui_events, citations, attachments, drafts (L13939–13946).

### 6.2 Tauri desktop

- Branded custom titlebar with platform-correct window controls (L13647).
  No further titlebar spec (height, drag region, control placement) is given;
  specimen top bar is 44px with traffic lights (L1105–1110).
- Desktop persistence via pglite-oxide owned by Rust and exposed through typed
  commands/events; React "does not open the desktop database directly"
  (L13706).
- Seven-layer discipline: components → hooks → stores → `src/api/` thin typed
  `invoke()` wrappers (only place Tauri IPC appears) → Rust commands
  (L2501, L2600–2612). RT-02: "Tauri components call hooks, stores and typed
  IPC; stores own API calls." (L9754)
- Rust→React streaming via `app.emit("a2ui_event")` + `listen()` into a store
  (L10259ff TS translation).
- Do: consume assistant-ui/shadcn as dependencies; Sandpack for artifact
  previews. Do not: add TanStack Query; implement Rust business logic in TS; use
  `window.webview` for custom panels; "achieve pixel parity with the Flutter
  mobile app" (L10046–10056).
- Sansaba note: desktop Tauri and web consume the same graph + fabric "via the
  KnowMe skill" (L4262).

### 6.3 Flutter mobile

- RT-01: "Flutter widgets call Riverpod providers, repositories, then generated
  Rust FFI." Rust owns networking, persistence, policy, agent coordination;
  Flutter owns rendering, gestures, accessibility (L9752).
- Layering `Widget → @riverpod provider → repository/service → Rust FFI →
  platform database` (L13716).
- Use `.autoDispose` providers for streaming subscriptions; never implement
  business logic in Dart; do not bypass ContentBlock with ad-hoc widget state;
  `spawn_blocking` for inference (L10000–10011).
- RT-03 FFI contract: typed requests/results, schema-validate JSON at Rust
  boundary, cancellation tokens, subscription disposal, no duplicate runtimes
  (L9765). RT-10: pin bridge generation and runtime versions together (L9785).
- Mobile relational persistence: SQLite + sqlite-vec behind Rust repository
  traits "because pglite-oxide does not support iOS or Android" (L13707).
- Use `shadcn_flutter` where it matches; otherwise token-driven components;
  width-based bottom nav vs rail consistent with React (L14031–14033).
- UI-06 native behaviours: native scrolling, keyboard insets, safe areas,
  platform back, focus restoration, large-text reflow (L11253). UI-08: embedded
  desktop/web apps need native or external-browser fallback on mobile, disclosed
  before opening (L11257).
- Goldens: real theme wrapper, deterministic pumps, one golden per state ×
  light/dark, `goldens/<widget>_<light|dark>.png`, Alchemist (L13350–13357).
- A2UI on Flutter: GenUI SDK `A2uiSurfaceView`, actions routed Riverpod →
  Repository → FFI (L14320–14327).
- Healthcare criterion: "Healthcare / regulated industry mobile → Flutter,
  always ... TribeHealth.ai mobile interfaces fall under this criterion"
  (L10395–10397); "Desktop clinical tools (provider-facing) may consider Tauri"
  (L10220).

### 6.4 State-library summary

| Concern | Owner | Line |
|---|---|---|
| Durable entities, queries, mutations | PEM 3.x (not TanStack Query) | L13730 |
| Transient UI state | Zustand | L13731 |
| Browser persistence | PGlite / IndexedDB | L13732 |
| Tauri persistence | pglite-oxide via Rust | L13733 |
| Mobile persistence | SQLite/sqlite-vec via Rust | L13734 |
| Graph memory / RAG | SurrealDB | L13735 |
| Flutter presentation | Riverpod | L13716 |

## 7. Pinned technology versions (exact strings)

The document contains several mutually inconsistent pins. Listed as found.

| String | Line(s) | Context |
|---|---|---|
| `React 19` | L4278, L13427 | frontend |
| `Vite 8` | L2503, L4278 | Sansaba / KnowMe layer figure |
| `Vite 7` | L9886, L10422 | TJ-ARCH-MOB-001 (older, March 2026) |
| `TypeScript 7` / `TS 7` | L4278, L4451 | Sansaba |
| `Tailwind 4` | L750, L4278 | container queries without plugin |
| `Zustand 5` | L4214, L10050 | transient UI |
| `TanStack Router`, `TanStack Table` | L4278 | Sansaba |
| `@prometheus-ags/prometheus-entity-management@3.0.0-alpha.0` (`alpha` dist-tag; latest stable `2.2.0`) | L4279, L4287 | "PEM replaces TanStack Query" |
| `Axum 0.8.8` | L4219, L4277 | BFF |
| A2UI `a2ui.org v0.9.1`; profile `uar.a2ui/1`; catalog `urn:uar:a2ui:catalog:1` | L4281, L14199–14200, L14297 | Flutter GenUI SDK pins v0.9 (L14420) |
| AG-UI profile `uar.agui/1` | L4699 | |
| `Tauri 2.10.3` | L10422 | scaffold phase; `tauri 2.10` L2611 |
| `Rust 1.96+, Node 24+, Flutter beta, Riverpod 3.3, frb 2.12+` | L976 | `versions.toml` is single source of truth |
| `flutter_rust_bridge v2` | L9875 | |
| `Dart: 3.13.0-0 or newer`; `Flutter: 3.47.0-0.1.pre or newer`; Android API 29; arm64-v8a; iOS 15.0 | L10731–10735 | platform support policy |
| `SurrealDB 3.0.5` (RocksDB) | L2526, L2633 | older KnowMe overview |
| `SurrealDB 3.2.1, SurrealKV` | L5055 | private-dot section |
| `SurrealDB 3.2` benchmark gate | L992 | open decision |
| `Wasmtime 41` | L2531, L2895 | older; superseded |
| `Wasmtime 46` | L936, L7740 | current per code observed |
| `cedar 4` | L2622 | |
| Mermaid via `flutter_mermaid` (WebView-class) | L512 | resolved decision |

Not found in the document: `SurrealDB 3.3.0` (the PatientGPT contract's
desktop pin), a Riverpod major other than 3.3, a go_router version, a
shadcn_flutter version, an Assistant UI version, a PGlite version, a
pglite-oxide version. Verify all against official sources before adopting.

## 8. Explicit "do not" rules

Shell and layout
- No three-column miniature on phones (L48).
- No canvas that cannot close (L362–364); panels must resize/collapse (L320).
- No silent canvas changes without a thread line (L365–366).
- No one-click send/pay/sign from an agent suggestion (L367–368).
- Do not squeeze the desktop sidebar into an unexplained icon rail (L13662).
- Do not detect phone by OS sniffing; use width (L13659).
- Embedded guest never resizes itself; "The host decides" (L866).
- Embedded app never saves automatically (L859); do not duplicate menu handlers
  (L797); do not revive the `/embed/*` path-prefix proxy (L11257, L3874).
- No duplicate composers (L1016); suggestions never execute (L1020); cards never
  report zero on failure (L1018); no simulated activity or invented progress
  percentages (L1028, L1036).

Visual (Flat 2.0)
- No borders, outlines, 1px rules, card outlines, bevels, glassmorphism,
  gradients, glossy controls, layout shadows, default Material Divider /
  OutlineInputBorder / outlined buttons, unmodified Shadcn borders, color-only
  status (L13538–13551).
- No `<hr>` for dividers (L13531, L13833).
- No raw `Color(0xFF…)` or magic `EdgeInsets` at call sites (L12524–12525).
- No stock `ThemeData.dark()` / `ColorScheme.fromSeed` (L14032).
- No core UI copy below 12 logical px (L13608).
- No animation to make idle screens look busy (L13633); no parallax/physics
  (L13340).

Chat and protocol
- Do not append one message per token (L13806).
- No generic spinners once events exist (L12538–12544, L13810).
- Never raw transport/runtime errors as assistant content (L13795, L13895,
  L14088).
- Never add a 12th ContentBlock variant for lifecycle/telemetry (L584,
  L4861).
- Never silently drop unknown events (L4863, L10959).
- Never dump raw JSON or envelope fields into the answer bubble (L4813,
  L4868).
- Never offer "send thinking back to the model" (L12561).
- Never execute model- or plugin-provided HTML/JS (L14280); unknown components
  fail closed to labeled fallback (L11245, L14523).
- Clients do not synthesize continuation prompts or guess run ownership
  (L14505–14507).

State and architecture
- No TanStack Query, SWR-style cache substitution (L4279, L10053, L13701).
- No `fetch()` in components (L4468); components do not call stores, DB clients
  or `invoke()` directly (L14075).
- No business logic in Dart or TypeScript (L10008, L10454).
- No Tauri as primary consumer/healthcare mobile (L10392–10397).
- No pixel-parity chasing between Flutter and Tauri (L10056, L14035).
- Durable conversations not held in in-memory Zustand (L13740–13744).
- UI never promises continuous background inference or mic (L11275).

## 9. KnowMe-product-specific content (skip for an unrelated product)

These are brand, product-domain, or KnowMe-runtime specifics. A consumer
building a different product should not import them as requirements.

Branding and identity
- KnowMe name, "AI that understands you" (L13458–13460), K monogram with ember
  node, `Know` + ember `Me` wordmark (L13616–13618), "KnowMe Praxis" name
  (L11).
- Ember/cyan hex palette and the role "cyan = user-owned remote AI" (L13580–
  13593). The *structure* (four-level ladder, one brand accent, one AI
  annotation accent, three reserved status colors) is transferable; the hex
  values are KnowMe brand. A product with its own brand palette and its own
  "do not add a chromatic family" rule should keep its own values.
- Font choices Space Grotesk / Inter / Roboto / JetBrains Mono (L13603–13606)
  are KnowMe brand typography.
- Mood-board screen intents for Home/Chat/Hands/Settings/Models/Memory
  (L13971–14023).

Product destinations and features
- Five destinations Home, Chat, Hands, Memory, Settings and Models-in-Settings
  (L497–501); Hands (scheduled automations), Memory (personal graph),
  capability tiles (L1170, L1692–1698).
- Models library, download/verification, OpenCL ≥15% gate, LiteRT-LM / Gemma
  / Qwen / llama.cpp backends, backend chip wording, benchmark runner (L497–
  546, L12549–12557, §8 of UIX-001).
- Local-first inference defaults: WebLLM on web, local model on Tauri,
  "On-device / My server / Cloud provider" lane trichotomy (L13789–13797).
- Context inspector budget slices, tightening-only budget overrides, 8K/16K
  context, fact extraction opt-in (L499–513, L13079ff).
- Peer sync / OFP gossip, devices list, Home server (L2869ff, L1759).
- Private dots, personal assistant vs project coach, Private Dot home card
  (chapter 06, L4908ff; L1018).
- CRM engagements, objectives, goal management, `Decision.cost_of_delay` and
  its seeded instances (L3342–3830).
- Plugin marketplace, `.pxt` packages, WIT worlds, Wasmtime sandbox, BossFang
  (chapters 07–08, L6619ff, L17899ff).
- LiveKit calls, call strip, dots in rooms (chapter 11, L17319ff). The
  "persistent call strip" in WS-07 (L48) only applies if the product has calls.
- WebMCP browser-site capabilities WEB-01..14 (L52–142), UI-12 (L11285).
- Sansaba / Mineral Rights Manager specifics: letter agreements, deals, D-0149
  strip text, `sansaba.mini-app-bridge` channel, admin/user role ruling, Flint
  Gate + RLS without Cedar, C-29 gate, Hal/Rachel/Chris (L3838–4470,
  L734–870). The pane widths, container-query rules and bridge semantics are
  reusable patterns; the domain, routes and roles are not.
- UAR-specific runtime facts: `UarServiceRuntime`, `/api/uar/runs/{run_id}/
  artifact-response`, embedded kernel AGPL concern (L4728–4736, L10819–10850).
- Pricing tiers (L3127ff, L996).

## 10. Gaps and conflicts a consumer must resolve

- Thinking default: "Collapsed by default" (L13824) vs "Expanded while
  streaming ... auto-collapses" (L12732).
- Destination count: 6 in UIX-001 inventory (L12594) vs 5 resolved (L497).
- Vite 7 (L10422) vs Vite 8 (L4278); Wasmtime 41 vs 46; SurrealDB 3.0.5 / 3.2 /
  3.2.1.
- Desktop persistence: S06 mandates pglite-oxide (L13706); an embedded
  SurrealDB relational store for desktop is not specified.
- No global breakpoint values, no titlebar dimensions, no command-palette
  behaviour beyond "Shadcn ... command palettes" (L13687), no keyboard shortcut
  map beyond ⌘/Ctrl-S (L793), Enter-to-send (L1608) and Escape semantics
  (L13324–13327), no motion durations or easing curves, no z-index or elevation
  scale, no spacing token names (only the 4px rhythm), no radius token values
  (only specimen values).
- The specimen is "a specification illustration, with synthetic data and no
  live agent connection" (L1030); its pixel values are illustrative only.
