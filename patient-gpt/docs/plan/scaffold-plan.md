# PatientGPT scaffold plan

Status: executing, 2026-10-25. Phase: Plan → Execute for the application
scaffold. This satisfies activation prerequisite 2 of
`docs/plan/patientgpt-delivery-cadence.md` (app manifests, pinned dependencies,
executable entrypoints). It does not start the delivery clock, implement a
storyboard workflow, or certify any surface.

## Authority, in order

1. `docs/design/` — tokens, shell, thread, surfaces, panel, brand marks. Visual
   and interaction authority. Followed exactly; where any other source disagrees
   on branding, colour, type, layout or copy, `docs/design` wins.
   (The operator referred to `docs/branding`; no such directory exists. Brand
   assets live in `docs/design/brand/`.)
2. `.prometheus/project-contract.md` and `versions.toml` decisions.
3. KnowMe Praxis standard (IPFS `bafybeidsh26…/index.html`) — shell operating
   philosophy, pane model and runtime boundaries. Applied only where it does not
   conflict with 1–2. KnowMe-specific product concepts do not transfer.
4. hybrid-mobile-architecture skill (source checkout) — layering, FFI, state
   rules. The checkout's example pins are not adopted.

## Layout

Paths and crate names follow the write roots reserved in `TEAM.md`.

| Path | Owner role | What it is |
|---|---|---|
| `assets/templates/design-tokens/tokens.toml` | design-expert | The one token source, seeded verbatim from `docs/design/patient-chat/tokens.css`. |
| `scripts/design-tokens/gen-design-tokens.mjs` | design-expert | Writes `web/src/styles/tokens.css` and `mobile/lib/core/theme/tokens.dart`, both DO-NOT-EDIT. |
| `Cargo.toml` (workspace) | team-lead | Workspace members and exact pins. |
| `crates/patient-gpt-domain` | rust-domain-engineer | Shell-independent DTOs: ids, evidence state (`met`/`gap`/`void`), citation, ContentBlock, AG-UI event, conversation scope. |
| `crates/patient-gpt-host` | rust-domain-engineer | `AppServices`, clinical/conversation/runtime ports, synthetic fixture adapter. No shell dependency. |
| `crates/patient-gpt-uar` | uar-agent-expert | `UarRuntimeFacade` port impl: deterministic adapter only in the scaffold. |
| `crates/patient-gpt-storage` | storage-engineer | In-memory and embedded SurrealDB 3.3.0 adapters behind the conversation port. |
| `crates/patient-gpt-server` | flint-data-engineer | Axum router (readiness, scoped reads, run SSE) and the thin web-server binary. |
| `crates/patient-gpt-ffi` | flutter-engineer | flutter_rust_bridge surface mirroring the HTTP routes. |
| `web/` | react-engineer | The one shared React application (web + Tauri). Kebab-case TS. PGlite in browser. |
| `desktop/src-tauri` | tauri-engineer | Tauri shell over `web/` build; commands mirror HTTP routes 1:1. |
| `mobile/` | flutter-engineer | Flutter app, Riverpod, GoRouter, FFI to `patientgpt-ffi`. |

## Pins (verified against registries 2026-10-25)

Agents cannot edit `versions.toml`. These are recorded in the manifests and are
proposed for the operator to add to `versions.toml [pins]` by hand.

| Package | Pin | Note |
|---|---|---|
| react / react-dom | 19.3.1 | |
| vite | 8.3.5 | |
| @vitejs/plugin-react | 6.1.2 | |
| typescript | 7.0.2 | operator target 7.0 |
| @tanstack/react-router / router-plugin | 1.170.46 / 1.168.48 | |
| zustand | 5.0.16 | transient UI state only |
| @electric-sql/pglite | 0.5.11 | browser store |
| @assistant-ui/react | 0.15.31 | chat behaviour |
| @prometheus-ags/entity-graph-react | 4.2.0 | durable entities, no query cache |
| @tauri-apps/api / cli | 2.12.4 | |
| @fontsource playfair-display / mulish / jetbrains-mono | 5.3.0 | self-hosted fonts |
| vitest | 5.0.5 | local only |
| tauri / tauri-build (crates) | 2.12.5 / 2.7.4 | |
| axum / tower-http | 0.8.9 / 0.7.1 | matches parent workspace |
| tokio | 1.54.1 | |
| surrealdb | 3.3.0 | operator target; 3.3.4 is latest |
| flutter_rust_bridge (crate + pub) | 2.12.0 | must equal installed codegen 2.12.0; 2.13.0 is latest |
| flutter_riverpod / riverpod_annotation / riverpod_generator | 3.4.3 / 4.0.7 / 4.0.9 | |
| build_runner | 2.16.2 | 2.17.1 needs build 5.x; riverpod_generator 4.0.9 caps build <5.0 |
| flutter_launcher_icons (dev) | 0.14.4 | app icon generation; see "Application icons" |
| go_router | 18.1.1 | |
| flutter_svg | 2.3.0 | brand marks |

Toolchain observed: rustc 1.99.1, node 26.5.0, pnpm 11.25.0, Flutter 3.48.0-0.5.pre
beta, tauri-cli 2.10.0, flutter_rust_bridge_codegen 2.12.0. `knowme-builder
2.0.0-alpha.1` `new` generates a 14-file facade stub and `adopt` writes metadata
only, so the scaffold is written by hand against the skill references.

## Application icons

`bash scripts/brand-icons/gen-app-icons.sh .` regenerates every app icon from
`docs/design/brand/icon.svg` and `favicon.svg`, following the brand board's
"Application icons" rules. Masters land in `assets/brand/app-icons/`:

| Master | Rule it implements | Feeds |
|---|---|---|
| `tile-1024.png` | full-bleed navy tile, no alpha; the platform applies its corner | iOS AppIcon set, Linux and Windows Store sizes |
| `android-foreground-1024.png` | mark in the central 66 % so every launcher mask leaves it whole; background `#1F4E79` | Android adaptive icon (inset 0) and legacy mipmaps |
| `macos-1024.png` | macOS does not round icons: 824 px body, 185 px corner, Apple grid margin | `desktop/src-tauri/icons/icon.icns` |
| `favicon-{16,24,32}.png` | Windows taskbar at 24 px uses the favicon cut | `icon.ico` small frames, `32x32.png` |

The script needs `rsvg-convert` and `magick`. It runs `flutter_launcher_icons`
(config in `mobile/pubspec.yaml`) and `cargo tauri icon`, then replaces the
`.icns`, `.ico` and `32x32.png`. `flutter_launcher_icons` 0.14.4 rewrites every
`ASSETCATALOG` line in `project.pbxproj`; the script restores that file.
Android 13 themed (monochrome) icon is deferred until a monochrome cut exists.

## Scaffold exit criteria

Each recorded as Passed / Build-only / Blocked / Failed with command output.

- Token generator runs; outputs match `tokens.css` values for both themes.
- `cargo build --workspace` succeeds.
- `pnpm --dir web build` succeeds; the shell renders the PatientGPT mark,
  sidebar (268px), top bar, empty conversation column (48rem) and navy composer
  in light and dark, with a drawer below 768px.
- `cargo tauri build --debug` (or `cargo build -p patientgpt-desktop`) succeeds.
- `flutter analyze` and `flutter build` for one target succeed.

Not in scope: storyboard workflows, live UAR, Kratos/Gate, Postgres/Forge,
clinical writes, physical devices, tests (they run at full-phase end).

## The uncomfortable thing

A shell that looks exactly like the prototype will read as progress while
holding none of the record, session or authority boundaries the product needs.
The scaffold proves manifests and visual fidelity only. Every clinical control
it draws is inert until the host command path exists.

## Praxis reconciliation

Extract: `docs/plan/reference/praxis-ui-standard-extract.md` (line refs into the
published document). Applied: one composer; single in-thread approvals bound to
the exact effect, Deny as default; streaming updates one assistant message;
closed 11-variant ContentBlock with exhaustive checks and labelled fallbacks for
unknown variants; one approved A2UI catalog, fail closed, no model-supplied
HTML/JS; component → hook → store → transport; no `fetch()` in components;
width-based (never OS-based) navigation; phone shows one pane at a time;
Tauri branded custom titlebar.

Overridden by `docs/design` or the operator contract, deliberately:

| Praxis says | PatientGPT does | Why |
|---|---|---|
| KnowMe palette, Space Grotesk/Inter/Roboto | prototype tokens, Playfair Display/Mulish/JetBrains Mono | operator: follow `docs/design` branding precisely |
| shadcn for general web components | port the prototype CSS; no Tailwind/shadcn | shadcn defaults would restyle the Flat 2.0 prototype |
| canvas pane 560px docked | Files panel 360px at ≥1100px; overlay below; bottom sheet <768px | `panel.css` |
| no global breakpoints | 768px and 1100px | `shell.css`, `panel.css` |
| desktop persistence pglite-oxide | embedded SurrealDB 3.3.0 | operator target in `versions.toml` `storage_target` |
| five-destination rail / bottom bar | ChatGPT-shaped sidebar and drawer | prototype navigation model |

Open for the operator: the Praxis pglite-oxide requirement versus the contract's
SurrealDB 3.3.0 on desktop. The scaffold follows the contract.
