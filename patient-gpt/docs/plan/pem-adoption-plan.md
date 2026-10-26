# Prometheus entity management adoption (web + Flutter)

Status: planned, 2026-10-25. Operator scope: both layers, basic A2UI catalog
restyled to PatientGPT. Web work waits until the in-flight Tailwind edit to
`web/` is finished; Flutter starts first.

## What 4.2.0 adds, and what exists per shell

| Shell | Entity graph | A2UI renderer | Status before this change |
|---|---|---|---|
| Web (React) | `@prometheus-ags/entity-graph-react` 4.2.0 + `entity-graph-core` 4.2.0 | `@prometheus-ags/a2ui-react` 4.2.0 (official `@a2ui/react` 0.12.0, A2UI v0.9.1) | graph adopted; no A2UI renderer |
| Flutter | `entity_graph_flutter` 4.0.0 (latest on pub.dev; there is no Dart 4.2.0) | `genui` 0.10.4 (official GenUI processor; app-local catalog) | hand-written Riverpod providers; no A2UI renderer |

The 4.2.0 addition is in `a2ui-react`: `createPrometheusA2uiCatalog({ components,
implementations })` replaces official components with app ones built by
`createPrometheusA2uiComponent(getPrometheusA2uiOfficialComponent(name), render)`,
which keeps the official schema, property names and bindings.
GenUI's equivalent is `CatalogItem(name, dataSchema, widgetBuilder)` reusing the
`BasicCatalogItems.<item>` name and schema with a PatientGPT widget.

## Catalog (both shells)

Catalog id `urn:patientgpt:a2ui:catalog:basic:v1`, protocol v0.9.1.

| Component | PatientGPT rendering source |
|---|---|
| Text | `thread.css` prose; variants map to Playfair (headings) / Mulish (body) / JetBrains Mono (caption) |
| Row, Column, List | layout only, `--od-gap` rhythm |
| Card | `surfaces.css` surface: `--s1` fill, `--r-lg`, no border or shadow |
| Divider | space only (Flat 2.0 has no rules) |
| Button | `.btn.primary` / `.btn.ghost`; focus is a fill swap |
| TextField, CheckBox, ChoicePicker, DateTimeInput | `--field` fill controls from `tokens.css` |
| Icon | the prototype's inline icon set (`ui.js`) where names match; unknown names render a labelled fallback |
| Tabs, Modal, Slider | official behaviour, restyled with tokens |

Excluded: Image, Video, AudioPlayer (no media in the scaffold), `openUrl`
(navigation is app-owned). Unknown components and actions fail closed with a
labelled fallback. Clinical components (CriteriaList, ConflictList, BlockerList,
NextMove, citations) are not in this change: they belong to the UAR-registered
catalog owned by `uar-agent-expert` (cadence Phase B).

Action policy: default deny. No graph-writing actions are allowlisted yet; a
surface action is surfaced to the app as an intent, never applied to clinical
records.

## Flutter (first)

Owner: flutter-engineer. Write root `mobile/` only.

1. Pins: `entity_graph_flutter: 4.0.0`, `genui: 0.10.4`, and `hooks_riverpod` /
   `flutter_hooks` only if `entity_graph_flutter` requires them at the import
   sites used.
2. Entity graph: one `EntityGraph` for the app; register an `EntityTransport`
   per entity (session, patient, case, conversation) backed by the existing
   `PatientGptGateway` (FFI or HTTP). Replace the hand-written list/detail
   providers with the package's generated families. Lists hold ids; views join.
   Errors map to `TerminalError` / `TransientError` from the gateway codes
   (same terminal set as web: invalid_input, not_found, not_implemented,
   invalid_scope, missing_scope, invalid_run_request).
3. A2UI: `lib/features/a2ui/` with a `SurfaceController` over the PatientGPT
   catalog (items above, built from `BasicCatalogItems.*` schemas with token
   widgets) and a default-deny action handler. Render a surface inside the
   thread when the run stream carries one; the deterministic runtime emits none
   today, so ship a debug-only sample surface to exercise the catalog.
4. Verify: `flutter analyze`, `build_runner`, debug run on the iOS simulator and
   Android emulator showing home data via the graph and the sample surface.

## Web (after the Tailwind edit lands)

Owner: react-engineer. Write root `web/` only.

1. Pin `@prometheus-ags/a2ui-react` 4.2.0 and its peer `@ag-ui/core` (exact,
   verified on npm).
2. `src/features/a2ui/`: catalog with PatientGPT implementations on the ported
   prototype CSS (operator choice; not shadcn), `PrometheusA2uiProvider` with a
   default-deny policy, and a `PrometheusA2uiSurface` slot in the thread.
3. Verify: `pnpm build`; the same sample surface rendered in the browser at
   1100 px and 375 px, light and dark.

## The uncomfortable thing

Neither shell has an agent that emits A2UI yet; the deterministic runtime only
streams text. Until the UAR catalog and a real runtime exist, these renderers
are exercised by a sample surface only, which proves styling and fail-closed
behaviour, not agent integration.

## Parity decisions (2026-10-26)

- Selected state, both shells: the prototype's one rule, `.tab[aria-pressed="true"]`
  in `surfaces.css` (`--fg` fill, `--bg` text, weight 700; unselected `--s3`).
  Applies to Tabs and ChoicePicker chips.
- Icon names, both shells: add, check, close, edit, folder, lock, search, mapped
  onto the prototype set (`ui.js`); anything else renders the labelled fallback.
- Wire format, both shells: official v0.9.1 keys (Tabs `title`/`child`,
  DateTimeInput `enableDate`/`enableTime`, a missing flag is false). The sample
  surface content is identical on web and Flutter.
- Version string: web's `@a2ui/web_core` accepts only `v0.9.1`; Flutter's genui
  (`a2ui_core` 0.1.1) accepts only `v0.9`. Flutter's intake
  (`mobile/lib/features/a2ui/data/a2ui_wire.dart`) maps exactly `v0.9.1` to
  `v0.9` and refuses any other version.
