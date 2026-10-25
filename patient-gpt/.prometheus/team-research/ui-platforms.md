# UI platform and team research

Observed 2026-10-04. Phase: Spec (waypoint is bootstrap/ready). Research only; no application edits, builds, tests, Impeccable initialization, deployment or publication. Source ledger: `ui-platforms-sources.json`.

## Recommendation

Keep the PatientGPT prototype as the design authority. Use one React presentation implementation for browser and Tauri, with explicit shell adapters and desktop-only window chrome; use native Flutter presentation over the same domain/contracts, with generated semantic tokens. Assign one owner to the token source and one to native bridge contracts. Creative direction means preserving and translating this existing direction, not generating another brand.

Evidence: /Users/gqadonis/Projects/TribeHealth/kevin/prior-auth/patient-gpt/.prometheus/project-contract.md:29-40,92-117; /Users/gqadonis/Projects/hybrid-mobile-architecture-src/skills/hybrid-mobile-architecture/references/arch-standard.md:9-20,89-104.

## What the reference actually requires

- /Users/gqadonis/Projects/TribeHealth/kevin/prior-auth/patient-gpt/docs/design/README.md:3-7,13-20 identifies web, Tauri and Flutter and synthetic prototype content; preserve published `patient-chat` filenames.
- /Users/gqadonis/Projects/TribeHealth/kevin/prior-auth/patient-gpt/docs/design/patient-chat-storyboard.html:144-180 has seven cases; :202-310 has nine navigation examples. Inventory these and their streaming, interrupted, empty, error, source-viewer and authority states before implementation.
- /Users/gqadonis/Projects/TribeHealth/kevin/prior-auth/patient-gpt/docs/design/patient-chat/tokens.css:71-73 supplies Playfair Display, Mulish and JetBrains Mono; :88-89 supplies 268px sidebar and 48rem thread. Focus uses fill swaps (:191-201), not invisible focus.
- /Users/gqadonis/Projects/TribeHealth/kevin/prior-auth/patient-gpt/docs/design/patient-chat/panel.css:87-101 defines 360px wide Files at 1100px and overlay/sheet behavior below; shell.css:113,198-231 covers safe areas, pointer targets and responsive navigation.
- Three evidence states require words and shapes; clinical actions remain app-owned host controls. The visible prototype control is not production authorization proof (/Users/gqadonis/Projects/TribeHealth/kevin/prior-auth/patient-gpt/.prometheus/project-contract.md:65-82,115-117).

The uncomfortable thing: the prototype is an interaction oracle, not a working clinical runtime. It uses fixed identity, scripted runs and synthetic excerpts; the contract explicitly records reset-on-reload and simulated search (/Users/gqadonis/Projects/TribeHealth/kevin/prior-auth/patient-gpt/.prometheus/project-contract.md:154-165). New-evidence letter revision is absent (/Users/gqadonis/Projects/TribeHealth/kevin/prior-auth/patient-gpt/docs/design/patient-chat/flows.js:271); appeal drafting is absent (:418). These remain specification gaps.

## KnowMe desktop evidence and adaptation limits

| Observed source | What it proves |
|---|---|
| /Users/gqadonis/Projects/know-me/know-me-system/desktop/src-tauri/tauri.conf.json:5-8,19-20 | Loads one frontend dist and disables native decorations. |
| /Users/gqadonis/Projects/know-me/know-me-system/desktop/src/shared/components/Titlebar.tsx:17 | Window resolution is gated with `isTauri()` for the shared browser bundle. |
| Same file:19-65 | macOS controls left in close/minimize/maximize order; Windows controls minimize/maximize/close; real buttons and labels. |
| Same file:87-96 | Left-button handler calls `startDragging()`; header carries drag-region metadata. |
| Same file:103-113 | Settings stops mousedown propagation; controls render by platform. |
| /Users/gqadonis/Projects/know-me/know-me-system/desktop/src-tauri/capabilities/default.json:8-11 | Explicit close, minimize, toggle-maximize and start-dragging permissions. |
| /Users/gqadonis/Projects/know-me/know-me-system/desktop/package.json:7-11; desktop/vite.config.ts:15-25,30-40 | React/Vite build and Tauri commands; development API proxy and recorded production bundler target incompatibility. This is source evidence, not a fresh build result. |

Adapt the pattern rather than copying all details. `toggleMaximize()` provides the maximize/restore action, but the current label/icon stays “Maximize” (:33,52); implement a state-aware restore affordance for the requested behavior. The header mousedown bubbles from the window controls, while only settings explicitly stops propagation; control activation must remain outside drag handling. The KnowMe component renders a branded header even in a browser (:92-115). PatientGPT must separately render its existing web navigation header and mount custom window chrome only in desktop.

[Official Tauri documentation](https://v2.tauri.app/learn/window-customization/) confirms decoration removal, window APIs and capability permissions, and notes macOS custom chrome loses some native window features. Its current page still contains a `tauri.windows` snippet; the inspected v2 application uses `app.windows`. Do not blindly transplant that stale snippet. The local titlebar skill's assertion that every API *import* throws is too broad: avoid unguarded bridge-dependent calls, as the reference does, rather than treating module imports as universally unsafe.

KnowMe mobile is useful structural precedent, not proof of generated parity: /Users/gqadonis/Projects/know-me/know-me-system/mobile/lib/core/theme/tokens.dart:1-3 calls itself a projection of desktop CSS, and :54 onward contains palette constants. The referenced scaffold's `desktop/src/theme.css` and `scripts/gen-design-tokens.*` do not exist at those paths in this checkout; actual CSS is `desktop/src/index.css`. PatientGPT should establish and verify its own generator instead of claiming KnowMe already proves one.

## Flutter parity

Use the same roles, hierarchy, content state and domain intents; preserve mobile drawer, Files sheet, fullscreen documents, docked composer, safe-area/keyboard behavior and platform target units. `LayoutBuilder` chooses composition from available constraints, `MediaQuery` supplies window/accessibility information, and `SafeArea` accounts for system obstructions. Do not use device names or orientation alone as the layout contract. [Flutter adaptive documentation](https://docs.flutter.dev/ui/adaptive-responsive/safearea-mediaquery)

At the full phase boundary, compare meaningful workflow states in light/dark on the real application entrypoints, including accessible text scaling, reading order and touch interaction. A screenshot/golden is supporting visual evidence; actual clinical state and authority transitions require local integration. A simulator is not physical-device proof.

## Skills inspected and bounded use

All paths below were opened; their installation is not comparative quality certification.

| Role/use | Installed skill and provenance | Boundaries |
|---|---|---|
| Shared routing | /Users/gqadonis/Projects/TribeHealth/kevin/prior-auth/patient-gpt/.agents/skills/prometheus-ui-ux/SKILL.md:1-17; project .agents/UI_UX_PROTOCOL.md:5-25 | PatientGPT preservation authority; load only for UI work; no taste package on refinement/review. |
| Creative director | /Users/gqadonis/Projects/TribeHealth/kevin/prior-auth/patient-gpt/.agents/skills/prometheus-impeccable-core/SKILL.md:11-19 | Portable context/modes; upstream pbakaus/impeccable revision 9d715cc4f5564a990ca8345abfdd5df6dc9b41c8, Apache-2.0. Not the native engine. |
| Full Impeccable option | /Users/gqadonis/.codex/skills/impeccable/SKILL.md:6,28-39 | Installed 4.4.0; context launcher needs preinstalled IMPECCABLE_BIN. No engine download implied. Root owns any requested initialization. |
| Design expert | /Users/gqadonis/Projects/TribeHealth/kevin/prior-auth/patient-gpt/.agents/skills/ui-ux-pro-max/SKILL.md:13-31; provenance.json:2-7 | Focused UX/stack lookup; MIT upstream nextlevelbuilder/ui-ux-pro-max-skill at dcc40ff5133ef78276117db0cc34e7b83cc8aeba. No replacement design-system generation. |
| Bounded craft | /Users/gqadonis/Projects/TribeHealth/kevin/prior-auth/patient-gpt/.agents/skills/better-interface/SKILL.md:25-35 | Broad craft routing only when needed; prefer one focused better-* skill for a narrow issue. Evidence over taste. |
| React implementer | /Users/gqadonis/Projects/TribeHealth/kevin/prior-auth/patient-gpt/.agents/skills/vercel-react-best-practices/SKILL.md:8,13-17,83 | Vercel 1.0.0, MIT. Relevant render/bundle/effect rules only. Exclude SWR, Next-specific APIs and request caches. |
| Flutter implementer | /Users/gqadonis/Projects/TribeHealth/kevin/prior-auth/patient-gpt/.agents/skills/flutter-build-responsive-layout/SKILL.md:10-19,35-39 | BSD-3-Clause packaged 1.0.0-prometheus.1; constraints-based layouts. Metadata model is provenance, not a routing mandate. |
| Tokens owner | /Users/gqadonis/Projects/hybrid-mobile-architecture-src/skills/hybrid-design-tokens/SKILL.md:13-27,66-67 | One source/generator, both themes/shells. Override two-font ceiling with PatientGPT's explicit three-family reference. Do not presume template paths exist. |
| Desktop implementer | /Users/gqadonis/Projects/hybrid-mobile-architecture-src/skills/tauri-custom-titlebar/SKILL.md | Desktop-only chrome, platform controls, bridge call gating, explicit capabilities and real-window acceptance at phase end. |
| Parity planning/review | /Users/gqadonis/Projects/hybrid-mobile-architecture-src/skills/reference-ui-fidelity/SKILL.md; skills/flutter-golden-ui/SKILL.md | Use inventory and final parity evidence; reject generic persistence/version defaults conflicting with PatientGPT and defer every test until full phase end. |
| Documentation publisher | /Users/gqadonis/Projects/hybrid-mobile-architecture-src/skills/build-branded-docusaurus/SKILL.md:8-27 | Public-content classification, branded source, deploy artifact and links. No publication authorization implied by the skill. |

No standalone creative-director or design-expert SKILL.md was found in the inspected installed roots. Define those as team responsibilities composed from these bounded skills; do not invent a skill identifier. The local protocol explicitly distinguishes director, implementer and reviewer routing (:25). Backend roles should load none of this UI guidance.

Conflict resolutions to encode: PatientGPT three typefaces beats token skill's two-family ceiling; no-query-cache beats Vercel SWR; PatientGPT data/storage decisions beat generic PEM 3.x/PGlite defaults; local full-phase integration beats architecture reference's CI deterministic testing and Flutter per-widget golden workflow; prototype identity beats Impeccable's broad creative rhetoric.

## Suggested disjoint ownership

These are proposed ownership boundaries, not claims that application directories exist. Final paths must follow the root architecture decision and use kebab-case for authored filenames.

| Team responsibility | Exclusive writes | Read/coordinate only |
|---|---|---|
| Creative director | Product/design context and per-surface briefs | Prototype, brand and implementation; no application writes |
| Design expert / token engineer | Shared token source/generator, component specification and parity inventory | Generated CSS/Dart outputs are generator-owned, not hand-owned |
| React web implementer | Shared React feature presentation, hooks and browser shell adapter | Desktop shell APIs; core contracts |
| Desktop shell implementer | Tauri config/capabilities, desktop-only chrome and shell adapter | Shared React feature presentation and core contracts |
| Flutter implementer | Flutter feature presentation/providers and native shell | Shared tokens/contracts; bridge owner controls generated bindings |
| Docs engineer | Separate docs-site source and pages build configuration | Public allowlisted content; no raw session/research logs |
| Phase-boundary reviewer | Evidence and read-only findings only | Dormant until full implementation phase is complete |

One build coordinator serializes writers to shared build/target directories. Bridge/contracts and release orchestration remain explicitly owned elsewhere in the full team.

## Cadence and documentation deployment

Carry the operator's requirements unchanged: TypeScript 7.0, kebab-case authored filenames, local web build every two hours and full web plus Tauri build every other interval (four-hour cadence). Record timestamps, source revision, exact command, exit and artifact paths. Build-only evidence cannot close a workflow. No test, reviewer, auditor or integration-checker run before the full phase boundary. Do not invent PatientGPT commands from KnowMe's package scripts; application manifests must establish them. Standard tool-mandated filenames need a documented exception if renaming would break discovery.

Place Docusaurus in an isolated monorepo package selected by the root, with its own build output. Set production `url`, trailing-slash `baseUrl` (normally `/<repository>/` for a project site), and explicit `trailingSlash`; run the docs build from its package and upload only that output. Internal repository location does not itself determine public URL. [Docusaurus deployment](https://docusaurus.io/docs/deployment), [monorepo installation](https://docusaurus.io/docs/installation)

For a future authorized Pages publication, use a build job followed by an artifact deployment job with `needs`, `pages: write`, `id-token: write`, and the `github-pages` environment. Official documentation currently shows configure-pages v5, upload-pages-artifact v4 and deploy-pages v4; pin reviewed action revisions at implementation time. CI builds/packages only; all tests and representative route verification remain local. [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

Context7 was resolved before querying: /tauri-apps/tauri-docs, /flutter/website and /websites/docusaurus_io. Official pages were opened separately to check deployment and API details. TypeScript package availability/selection is outside this dossier; a skill's claim of TS 7.0.2 runtime is not dependency verification for PatientGPT.

## Verification and limits

Only source/documentation inspection and dossier JSON parsing were performed. No application build, runtime, test, screenshot comparison, native capability execution, physical-device run or publication was performed. All platform runtime claims remain unverified. No guards or production code were added; the only new files are this dossier and its source ledger. Existing prototype limits and upstream guidance conflicts are reported rather than silently fixed.

