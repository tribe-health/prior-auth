Interactive live variant mode: select elements in the browser, pick a design action, and get AI-generated HTML+CSS variants hot-swapped via the dev server's HMR.

## Prerequisites

A running dev server with HMR (Vite, Next.js, Bun, etc.), OR a static HTML file open in the browser. If the dev server's default port is busy, the app is very likely ALREADY running; probe the default URL before spawning a second server.

Live editing requires a local checkout; injection into deployed production sites (including HTTPS) is unsupported. For production inspection, use `node <skill-base-dir>/scripts/engine.mjs detect <url>` or the browser extension, not the live helper. Do not disable browser security or weaken production CSP to enable live mode.

Codex: run live helper commands, the app dev server, and any dependency-installing setup with `sandbox_permissions: "require_escalated"` from the start; live mode depends on localhost and package-manager network access that the sandbox blocks.

## The contract (read once)

Execute in order. No step skipped, no step reordered. Every tool output in live mode may carry an `_instructions` field: it is the authoritative next step for that exact situation, with real ids and paths substituted; when it conflicts with your recollection of this document, `_instructions` wins.

1. `impeccable live`: boot. If the request names or implies a file, route, or app inside a monorepo, infer the concrete path and run `node <skill-base-dir>/scripts/engine.mjs live --target <path>` instead; then run the rest of this live session from the returned `projectRoot`. The boot resolves the app root from dev-server config files and persists it in `.impeccable/live/roots.json`; every helper re-anchors to that manifest at startup (a wrong cwd cannot fork session state), PRODUCT.md / DESIGN.md are discovered upward to the git root, and relative helper args like `--file` resolve against the app root.
2. Open the app URL that serves `pageFile` (infer from `package.json`, docs, terminal output, or an open tab). Never use `serverPort`; it's the helper, not the app. **Cursor:** `browser_navigate` to that URL before polling; do not skip. **Other harnesses:** use the available browser tool; if the URL is uncertain, ask the user once.
3. Poll loop with the default long timeout (600000 ms). Run `impeccable live-poll` again immediately after every event or `--reply`; Codex runs this one-shot poll in the foreground. Never pass a short `--timeout=`. The global bar's **Impeccable mark** dims with a pulsing amber dot when nothing is polling `/poll`; restart `impeccable live-poll` to reconnect.
4. On `generate`: reuse `event.scaffold` when present; read the screenshot if present; load the action's reference; deliver variants; `--reply done`; poll again. Generate in this thread: you already hold the project's tokens and layout. The overlay preview IS the verification channel; do not screenshot, re-render, or QA variants between generate and accept. Apply craft-floor's contrast, spacing, and type floors by construction as you write; full verification runs once at accept on the chosen variant.
5. On `steer`: read the message and `pageUrl`; do the work; `--reply steer_done`; poll again. No pickup ack.
6. On `accept` / `discard`: the poll script runs `impeccable live-accept`, acknowledges delivery, and prints `_completionAck`. Plain accepts/discards are terminal immediately; carbonize accepts stay recoverable until `impeccable live-complete --id EVENT_ID` runs. Finish that cleanup before polling again.
7. If interrupted, run `impeccable live-status` or `impeccable live-resume` before guessing. The journal under `.impeccable/live/sessions/` is canonical and replays unacknowledged work after a helper restart; the injected `live.js` re-attaches when the page reopens. Fall back to the direct-edit loop only when `impeccable live-resume` reports no active session, never because disconnects felt frequent.
8. On `exit`: run the cleanup at the bottom.

Harness policy:
- **Claude Code**: run the poll as a **background task** (no short timeout); the harness notifies you on completion. Do not block the shell.
- **Cursor**: **one-shot** poll in a **background terminal** with notify on `"type":"(steer|generate|accept|discard|manual_edit_apply|variant_mount_failed|prefetch|exit)"`; handle, `--reply`, restart the poll. Do **not** use `--stream` on Cursor (measured ~5s pickup vs sub-second one-shot).
- **Codex**: default one-shot poll in a **yielded foreground exec session**. No `&`, no `--stream`, never leave Live without an active foreground poll. Starting the poll is not enough: SERVICE it (keep reading the exec session until it returns an event). Never announce "waiting for the user" and idle; a yielded poll nobody reads is a dead session, and the user's Go sits unanswered.
- **Other harnesses**: one-shot foreground unless you know stdout reliably returns when a shell exits.

Delivery policy: atomic single-edit delivery everywhere; do not switch a harness to progressive publishing unless its poll loop is known not to block on the extra calls.

Chat is overhead. No recap, no tutorial output, no pasting PRODUCT / DESIGN bodies. Spend tokens on tools and edits; on failure, one or two short sentences.

## Poll loop

```
LOOP:
  node <skill-base-dir>/scripts/engine.mjs live-poll   # default long timeout; no --timeout=
  Read JSON; dispatch on "type"

  "generate"  → Handle Generate; reply done; LOOP
  "steer"     → Handle Steer; reply steer_done; LOOP
  "accept"    → Handle Accept; complete carbonize cleanup if required; LOOP
  "discard"   → Handle Discard; LOOP
  "prefetch"  → Handle Prefetch; LOOP
  "manual_edit_apply" → Handle Manual Edit Apply; reply done|partial|error; LOOP
  "variant_mount_failed" → Fix the variant files; reply done --file <path>; LOOP
  "timeout"   → LOOP
  "exit"      → break → Cleanup
```

`variant_mount_failed` means the browser could not render what you published (`variant`, module `url`, `error`). The user sees a persistent error card, not variants. Fix the variant files, then `--reply EVENT_ID done --file <manifest or source path>`; the browser retries on its own.

**Stream mode** (`--stream`, experimental, never on Cursor): one long-lived process, one JSON line per event, `--reply` from a separate command. Only for harnesses that read incremental stdout reliably.

## Start

```bash
node <skill-base-dir>/scripts/engine.mjs live
```

Output JSON: `{ ok, serverPort, serverToken, pageFiles, roots, hasProduct, product, productPath, hasDesign, design, designPath, hasSurfaceBrief, surfaceBrief }`. `roots` is the resolved root manifest; `projectRoot` mirrors `roots.appRoot`. The surface brief rides along; do not shell out to `impeccable surface-brief` separately. Precedence for generation: **DESIGN.md wins on visual decisions; PRODUCT.md wins on durable product and voice decisions; the surface brief wins on this surface's strategy.** When DESIGN.md is missing, identity is **not** absent; extract it from CSS variables, computed styles, and sibling components (Step 4 Phase A). Identity preservation is the default; departure requires the user's explicit redesign intent.

`serverPort`/`serverToken` belong to the small helper HTTP server (`/live.js`, SSE, `/poll`), not your dev server; the page URL is whatever origin serves a `pageFiles` entry.

If output is `{ ok: false, error: "config_missing" | "config_invalid", path }`, this project needs one-time configuration: read [live-setup.md](live-setup.md) and follow it. If the output carries a non-null `configDrift`, tell the user once which HTML files are uncovered and suggest adding them or switching `files` to a glob; never auto-edit the config.

## Recovery commands

The append-only journal under `.impeccable/live/sessions/` is canonical durable state (not project source). When the chat was interrupted, polling was missed, the helper restarted, or the browser reloaded:

```bash
node <skill-base-dir>/scripts/engine.mjs live-status      # helper state, active sessions, queued events; works with the helper down
node <skill-base-dir>/scripts/engine.mjs live-resume --id SESSION_ID   # active snapshot, pending event, next safe action
node <skill-base-dir>/scripts/engine.mjs live-complete --id SESSION_ID # canonical manual final acknowledgement after verified cleanup
```

Server restart rule: start `impeccable live-server` again, then poll; startup requeues unacknowledged events, so never ask the user to click Go again unless `impeccable live-resume` says no active session exists.

## Handle `generate`

**Replace mode** (default): `{id, action, freeformPrompt?, count, pageUrl, element, screenshotPath?, comments?, strokes?}`.

**Insert mode** (`event.mode === "insert"`): `{id, mode: "insert", count, pageUrl, insert: { position, anchor }, placeholder: { width, height }, freeformPrompt?, screenshotPath?, comments?, strokes?}`. No `action`; requires a non-empty `freeformPrompt` **or** annotations. `placeholder` is a soft size hint.

Speed matters; the user is watching the selected element. Reuse preflight metadata, minimize discovery calls.

### Insert mode branch

1. Read the screenshot if present (annotations only).
2. If `event.scaffold` is present, use it and do **not** run the helper again. Otherwise:

```bash
node <skill-base-dir>/scripts/engine.mjs live-insert --id EVENT_ID --count EVENT_COUNT --position after \
  --element-id "ANCHOR_ID" --classes "class1,class2" --tag "section" --text "ANCHOR_TEXT"
```

`--position` ← `event.insert.position`; anchor flags map exactly like wrap's. The scaffold has **no** `data-impeccable-variant="original"`; variants are net-new HTML+CSS at `insertLine`. On source-preview targets the scaffold carries `sourceWritten: false` with `wrapperBlock` and `replaceEndLine < replaceStartLine` (an insertion): splice variants into `wrapperBlock` at the marker and insert at `replaceStartLine` in ONE edit, exactly as the wrap section describes. Decide the visitor mode from the surface and load [craft-floor.md](craft-floor.md) before writing net-new markup. Svelte targets follow the same component flow as wrap below (`mode: "insert"` in the manifest): each variant is a real single-root component under `componentDir` with no `data-impeccable-*` attributes; never edit the route during generation; accept splices the chosen markup into `sourceFile` mechanically. For non-Svelte targets, accept/discard removes the wrapper; the anchor is untouched.

### Replace mode (default)

### 1. Read the screenshot (if present)

`event.screenshotPath` is sent **only when the user annotated before Go**; it is a PNG of the element with annotations baked in. Read it before planning. When absent, do not ask for one or screenshot the page yourself: without annotations a screenshot anchors you on the existing design and fights the three-distinct-directions brief; work from `element.outerHTML`, the computed styles, and the prompt.

Annotation semantics: a comment's `{x, y}` is element-local and binds the text to the child under that point (a comment near the title is about the title). Comments and strokes are independent unless clearly paired. Strokes read by shape: closed loop = "this thing" (emphasis, not a clipping region); arrow = direction or movement; cross/slash = delete; scribble = emphasis or delete by context. If a stroke's intent is genuinely ambiguous and it changes the brief, ask one short question before generating; otherwise state your reading in one sentence.

### 2. Wrap the element

When `event.scaffold` is present, the helper already found the source and computed the wrapper; treat it as the successful output and skip the command. `event.scaffoldAttempted` with `scaffoldError` means preflight could not finish; use the command below.

**On source-preview targets `event.scaffold` carries `sourceWritten: false`.** The helper did NOT write the wrapper; it hands you `scaffold.wrapperBlock` plus the picked element's source range (`replaceStartLine`, `replaceEndLine`, 1-indexed). Write the wrapper **and** all variants in ONE edit: splice your variants into `wrapperBlock` at the "Variants: insert below this line" marker, then replace lines `[replaceStartLine, replaceEndLine]` with the result. A separate scaffold write reloads the framework before your variant write lands and strands the browser at 0/N. (`replaceEndLine < replaceStartLine` means insert mode: insert, remove nothing.) The `svelte-component` path never sets `sourceWritten`.

```bash
node <skill-base-dir>/scripts/engine.mjs live-wrap --id EVENT_ID --count EVENT_COUNT --element-id "ELEMENT_ID" --classes "class1,class2" --tag "div" --text "TEXT_SNIPPET"
```

Flag mapping (keep separate, never collapse into `--query`): `--element-id` ← `event.element.id`; `--classes` ← classes joined with commas; `--tag` ← tagName; `--text` ← first ~80 chars of textContent, **every call**: it disambiguates repeated sibling components, without it wrap lands on the first match. If `event.pageUrl` implies the file, pass `--file PATH`. If `--text` still matches several candidates, wrap exits `{ error: "element_ambiguous", candidates, fallback: "agent-driven" }`: pick the right range from page context and write the wrapper manually per the fallback flow.

Success output: `{ file, insertLine, commentSyntax, styleMode, styleTag, cssSelectorPrefixExamples, cssAuthoring }` (plus the `sourceWritten: false` fields above on source-preview targets). Run directly with no preflight scaffold, it writes the wrapper itself and you splice variants at `insertLine`. `styleMode` controls how preview CSS must be authored. Treat it as a detected capability mode, not a framework guess: `scoped` means `@scope ([data-impeccable-variant="N"])` rules; `astro-global-prefixed` means explicit `[data-impeccable-variant="N"]` prefixes with the exact returned `styleTag`. Use `cssAuthoring` as the source of truth for the current file (styleTag, selector strategy, requirements, forbidden patterns); apply no framework-specific exception unless it says to.

For Svelte/SvelteKit targets, `impeccable live-wrap` returns `previewMode: "svelte-component"` with `file` pointing at a temporary `node_modules/.impeccable-live/<id>/manifest.json`, `componentDir` holding the variant components, and `sourceFile` the real route. The scaffold is AST-based: control-flow blocks (`{#each}`, `{#if}`) survive intact and a free each-collection crosses the contract as ONE structured prop (kind `collection`). The payload includes `componentStubMarkup` (the prop-substituted markup already written into every stub), so do not read the manifest or stubs back. EDIT `v1.svelte`, `v2.svelte`, ... in place; never delete and recreate them; keep the stub's control flow and `propContract` prop names; never flatten a loop into literal items. The stub `<style>` arrives seeded with the source rules that currently style the selection; restyle or delete them freely. On accept, any seeded rule your variant does not re-declare is REMOVED from the source (the preview never applied it, so the user approved a design without it). Use semantic class selectors, no `@scope`, no `data-impeccable-*`. Reply with `--file` set to the manifest path; the browser mounts the compiled components so Svelte HMR does not reset page state. Accept merges the chosen component back mechanically (markup restored to route expressions, CSS reconciled, params baked, indentation preserved); you have no post-accept cleanup on this path. When the selection contains constructs a detached preview cannot support (component tags, `bind:`/`use:`, await blocks, inline scripts, spread attributes), wrap returns the normal source-preview wrapper with `previewFallback: { from: "svelte-component", reason }`; just follow the returned shape.

**Params on component-preview paths go in a sidecar, never as an attribute** (Svelte parses `{` in attribute values as an expression). Declare them in `componentDir/params.json` keyed by variant number, using the schema from section 7:

```json
{ "1": [ {"id":"density","kind":"steps","default":"snug","label":"Density","options":[
    {"value":"airy","label":"Airy"},{"value":"snug","label":"Snug"} ]} ] }
```

Author the component `<style>` against `var(--p-<id>, default)` for `range`/`toggle` and `[data-p-<id>="…"]` for `steps`, wrapped in `:global(...)` so runtime knob values on the mounted root reach your rules.

**Fallback errors.** Wrap refuses to write into non-source files (generated, untracked): accepting into one is silent data loss. Three shapes, all with `fallback: "agent-driven"` (see **Handle fallback**): `file_is_generated` (your `--file` points at a generated file), `element_not_in_source` with `generatedMatch` (element only exists generated), `element_not_found` (likely runtime-injected).

### 3. Load the action's reference

`event.action` is `impeccable` (freeform): work from SKILL.md's design rules plus [craft-floor.md](craft-floor.md); decide the visitor mode from the surface; do not load a sub-command reference. Freeform is not a pass to skip parameters: follow the budget and freeform bias in section 7. Any other action (`bolder`, `quieter`, `distill`, `polish`, `typeset`, `colorize`, `layout`, `adapt`, `animate`, `delight`, `overdrive`): read `reference/<action>.md` before planning; its MUST params layer on top of the section 7 budget.

### 4. Plan three variants: identity first, then mode, then axes

Live runs on an existing surface; the brand is already chosen. The job is variation **within identity**, not selection between identities. The worst failure is three off-brand variants the user cannot accept. Four phases, in order.

#### Phase A: Extract the identity (non-skippable)

Sources in priority order: DESIGN.md's visual system fields; CSS custom properties (de-facto tokens); computed styles on the picked element and parent; sibling components' visual rhetoric. Write ONE sentence recording what is actually on screen: dominant surface and accent color (real values, not "warm"), the loaded font pairing, layout topology (stacked / side-by-side / grid / asymmetric / overlay), surface treatment (corners, borders, shadows, decoration density), and the voice tone read off the copy. Be specific; skip an axis rather than fabricate; do not name an aesthetic family (a conclusion, not data). This sentence is the **identity lock**: every variant must read as the same brand side by side. Absence of DESIGN.md is never an excuse.

#### Phase B: Pick mode (default vs departure)

**Default** preserves the identity and varies expression within it; right for ~90% of sessions. **Departure** rejects the identity; trigger ONLY on the user's explicit ask in the current request or prompt ("redesign this", "rebuild from scratch", "something completely different"); a stale critique or old note is not authorization. Unsure means default: wrong-default costs "three on-brand variants with similar feel" (recoverable), wrong-departure costs three off-brand variants (unrecoverable).

#### Phase C: Plan three variants

**Default mode.** Each variant commits to a different **primary axis**, preserving the identity sentence. The six axes: 1 **Hierarchy** (which element commands the eye), 2 **Layout topology** (stacked / side-by-side / grid / asymmetric / overlay), 3 **Typographic system** (pairing logic, scale ratio, case/weight, *within the available faces*), 4 **Color strategy** (which existing palette role carries the surface: Restrained / Committed / Full palette / Drenched; existing tokens only), 5 **Density** (minimal / comfortable / dense), 6 **Structural decomposition** (merge, split, progressive disclosure). Three variants, three DIFFERENT axes: the same brand at three angles. New fonts, new hues, or new aesthetic-family signals belong to departure mode only.

**Departure mode.** Each variant anchors to a different aesthetic direction derived from the brand, never a fixed catalog: read PRODUCT.md's Brand Personality words; derive physical, spatial, or material experiences that embody them; from those, derive three directions genuinely different from each other AND from the current surface; reject reflex choices whose rationale would fit a neighboring product. Each direction must be one concrete sentence naming a real-world referent ("a museum exhibition label system", not "clean and minimal").

**In both modes, name each variant's 2 or 3 parameter knobs while planning** (section 7 budget). Parameters are part of the design; deciding "what's tunable" during planning beats retrofitting.

#### Phase D: Squint test

**Default:** compare each variant against the Phase A lock; palette, type voice, or rhetoric drift means it crossed into departure by accident: rework. Then confirm three different primary axes; three "tighter density" variants is failure. **Departure:** two passes, family before sentence. Family pass (non-negotiable): label each variant with a concrete family of your own choosing; shared or interchangeable labels mean rework. Sentence pass: three one-line descriptions side by side; two that rhyme mean rework. When the primary axis is color or theme, the trio must not share theme + dominant hue: three color worlds, not three shades.

**Action-specific invocations** must vary along the action's dimension:

- `bolder`: amplify a different dimension per variant (scale / saturation / structural change).
- `quieter`: pull back a different dimension (color / ornament / spacing).
- `distill`: remove a different class of excess (visual noise / redundant content / nested structure).
- `polish`: a different refinement axis (rhythm / hierarchy / micro-details).
- `typeset`: different pairing AND different scale ratio each.
- `colorize`: different hue family each; vary chroma and contrast strategy.
- `layout`: different structural arrangement, not spacing tweaks.
- `adapt`: different target context per variant (mobile-first / tablet / desktop / print or low-data).
- `animate`: different motion vocabulary (cascade stagger / clip wipe / scale-and-focus / morph / parallax).
- `delight`: different flavor of personality (micro-interaction / typographic surprise / illustrated accent / sonic-or-haptic / easter egg).
- `overdrive`: different convention broken (scale / structure / motion / input model / state transitions); skip its "propose and ask" step, live is non-interactive.

### 5. Apply the freeform prompt (if present)

`event.freeformPrompt` is the user's ceiling on direction: all variants honor it while exploring different interpretations within the Phase B mode. Default mode: the prompt narrows the axes, not the identity ("more confident" → one variant amplifies hierarchy, one commits the accent color, one tightens density). Departure mode: the prompt narrows the lanes, not the families ("newspaper front page" → broadsheet vs tabloid vs trade journal, then run the family pass). When the prompt conflicts with a binding brand commitment or DESIGN.md invariant, preserve the invariant unless the user explicitly revokes it.

### 6. Deliver variants

Complete HTML replacement of the original element per variant, not a CSS-only patch. Colocate preview CSS as a `<style>` tag inside the wrapper. **Atomic default:** CSS + all variants + parameter manifests in one edit at `insertLine`.

```html
<!-- Variants: insert below this line -->
<style data-impeccable-css="SESSION_ID">
  /* rules matching cssAuthoring.rulePattern */
</style>
<div data-impeccable-variant="1">
  <!-- variant 1: full element replacement (single top-level element) -->
</div>
<div data-impeccable-variant="2" style="display: none">
  <!-- variant 2 -->
</div>
<div data-impeccable-variant="3" style="display: none">
  <!-- variant 3 -->
</div>
```

Replace the style opening tag with `cssAuthoring.styleTag` when the tool returns a different one. **Each variant div contains exactly one top-level element**, same tag as the original; loose siblings break outline tracking and accept. First variant visible, all others `display: none`. The browser's MutationObserver accepts atomic or progressive arrival; accepting an arrived variant fences the worker, so later publications are rejected.

For `styleMode: "scoped"`, author every `:scope` rule with a descendant combinator: the `@scope` boundary is the variant wrapper div, not your element, so a bare `:scope { ... }` styles a `display: contents` shell. Always step in (`:scope > .card`, `:scope .hero-title`). The fake test agent's CSS in the [repo agent template](https://github.com/pbakaus/impeccable/blob/8dac6ae7e020c43ab10ce9b41939f6fd42627b96/tests/live-e2e/agent.mjs) is a faithful template.

**JSX / TSX targets:** wrap `<style>` content in a template literal (CSS braces would parse as JSX), use `className=` / `style={{…}}`, keep `data-impeccable-*` attributes as plain strings:

```tsx
<style data-impeccable-css="SESSION_ID">{`
  @scope ([data-impeccable-variant="1"]) { ... }
`}</style>
<div data-impeccable-variant="2" style={{ display: 'none' }}>
  {/* variant 2 */}
</div>
```

The wrap script provides a single-rooted JSX wrapper with the marker comments inside; drop the block at the marker and the source stays valid TSX.

### 7. Parameters (composition-sized, 0-4 per variant)

Each variant can expose **coarse** knobs; the browser docks one control per parameter with zero regeneration cost (knobs drive a CSS variable or data attribute your scoped CSS is authored against). Wire an axis as soon as the user could plausibly mutter "a bit tighter" or "a touch more accent" without wanting a regeneration; micro-margins and one-off nudges are not parameters. Freeform bias: you chose the axes, so expose them; a hero with 0 params is almost always a mistake, and 1 is underweight unless the design is a genuine fixed point.

Budget scales with the element's VISUAL weight (count visual children, not DOM depth):

- **Leaf / tiny** (button, icon, bare heading): **0 params.**
- **Small composition** (simple card, labeled input, ≤ ~5 visual children): **0-1**.
- **Medium composition** (section, nav cluster, 6-15 children): **target 2**; 1 if simple.
- **Large composition** (hero, full region, 16+ children or sub-sections): **target 2-3, up to 4** when independent axes are all authored in CSS.

**Hard cap: four** per variant. For named sub-commands, the action reference's MUST params are non-negotiable when expressible; respect the cap, no duplicate knobs.

**Declare** on the HTML/JSX path as a wrapper attribute (component-preview paths use `componentDir/params.json` instead, same schema, keyed by variant number; see the wrap section):

```html
<div data-impeccable-variant="1" data-impeccable-params='[
  {"id":"color-amount","kind":"range","min":0,"max":1,"step":0.05,"default":0.5,"label":"Color amount"},
  {"id":"serif","kind":"toggle","default":false,"label":"Serif display"}
]'>
```

Three kinds: `range` (slider; drives `--p-<id>`; author `var(--p-color-amount, 0.5)`; fields min/max/step/default/label), `steps` (segmented radio; drives `data-p-<id>`; author `:scope[data-p-density="airy"] .grid { ... }`; fields options/default/label), `toggle` (drives both `--p-<id>: 0|1` and attribute presence; fields default/label). Reset on variant switch is a known limitation: each variant starts at its declared defaults.

**On accept**, the browser sends current values and `impeccable live-accept` writes them as a sibling comment: `<!-- impeccable-param-values SESSION_ID: {"color-amount":0.7} -->`. Carbonize cleanup bakes them: keep only the matching `steps`/`toggle` branch, drop the others, collapse `:scope[data-p-…]` to semantic rules; substitute `range` literals or update the var's default.

### 8. Signal done

```bash
node <skill-base-dir>/scripts/engine.mjs live-poll --reply EVENT_ID done --file RELATIVE_PATH
> Inspect the indicated project files using the harness file tools or Node.js filesystem APIs. This upstream shell example is omitted in the portable distribution.bash
node <skill-base-dir>/scripts/engine.mjs live-server stop
```

Stops the helper and runs `impeccable live-inject --remove` to strip the injected script (use `stop --keep-inject` to keep it for a quick restart; `.impeccable/live/config.json` persists as project config). Then search for and remove any leftover `impeccable-variants-start` wrappers and `impeccable-carbonize-start` blocks.

## First-time setup

Only when `impeccable live` reports `config_missing` / `config_invalid`, or `configDrift` needs explaining, or the config lacks `cspChecked`: read [live-setup.md](live-setup.md). It owns the config schema, the per-framework `files` table, injection adapters, drift healing, and the CSP detection and consent flow.
