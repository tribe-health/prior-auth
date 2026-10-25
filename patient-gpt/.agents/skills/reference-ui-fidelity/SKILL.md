---
name: reference-ui-fidelity
description: ALWAYS invoke before implementing or materially changing a product UI when a specification, mood board, HTML prototype, screenshot, Figma/OpenDesign artifact, or reference application exists. Converts the reference into a complete screen/state inventory, treats it as a visual acceptance oracle, and requires screenshot evidence before completion. Triggers on reference app, reference UI, standalone HTML, prototype, mood board, screenshot, attached image, match this design, visual fidelity, pixel parity, redesign, product shell, all screens, design spec.
---
<!-- TJ-ARCH-MOB-001 compliant -->

> **Binding:** Treat the supplied reference as the acceptance oracle while
> preserving strict layering and accessibility. Project-local rules supplement,
> but do not replace, the self-contained verification contract below.

# Reference UI Fidelity Gate

A reference design is an acceptance oracle, not loose inspiration. Do not start from a
generic scaffold and hope to style it later. First extract the product system, full screen
inventory, component grammar, responsive behavior, and meaningful states from the
reference; then implement and compare the running app against it.

## 1. Discover the authority set

Before editing UI, locate and inspect all applicable sources:

1. product/functional specification;
2. UI/UX standard and brand guide;
3. mood board and user journeys;
4. executable HTML/Figma/OpenDesign prototype;
5. supplied screenshots in every theme and form factor; and
6. current implementation and existing visual-regression evidence.

Record precedence when they conflict. A direct, newer user instruction wins over an older
mockup mechanic. Preserve the reference's product intent while applying the newer rule.

Locate this project's actual artifacts before starting — do not assume a given file
exists. If a project has none of them, say so and stop: there is no acceptance oracle
to build against, and inventing one produces confident, unreviewable output.

## 2. Build a coverage matrix before code

Create an explicit matrix with one row per destination and meaningful state. At minimum:

| Dimension | Required inventory |
|---|---|
| Destinations | Every route/navigation destination visible in the reference |
| Themes | Light and dark |
| Form factors | Phone, tablet/medium, desktop/wide |
| Data states | Empty, populated, loading/streaming, degraded, error |
| Interaction states | Hover, focus, active, selected, disabled, expanded |
| Runtime states | Ready, model download/load, offline, local, owned remote, cloud |

It is a blocking failure to implement only the easiest routes while presenting the shell as
the reference application. Navigation items may not lead to placeholders or nowhere.

## 3. Extract the visual grammar

Convert the reference into reusable, semantic decisions:

- surface ladder and theme tokens;
- typography roles and density;
- spacing/radius/motion scales;
- responsive shell and navigation transitions;
- component families and repeated compositions;
- status/provenance language; and
- content hierarchy and empty/error behavior.

Use `hybrid-design-tokens` for the shared token source. Use Shadcn UI for React primitives,
Assistant UI for chat/thread behavior, and `shadcn_flutter` or token-driven equivalents on
Flutter. Do not reproduce a reference as one monolithic component or a pile of inline
styles.

This project is strict Flat 2.0: **no visible lines or borders anywhere; adjacent regions are
distinguished only through background-color changes.** Remove border/shadow defaults from
component libraries before judging fidelity.

## 4. Preserve real architecture while matching the design

Visual fidelity does not authorize fake data paths:

- React visual components import feature hooks, not stores/transports.
- Prometheus Entity Management 3.x owns durable/reactive entities and mutations.
- Zustand owns transient interaction state only.
- Web persistence uses PGlite; Tauri persistence uses pglite-oxide through Rust commands;
  Flutter uses the platform repository behind Rust FFI.
- Assistant UI renders the real conversation runtime and shared ContentBlock stream.
- Local inference is the first/default working lane; cloud BYOK is optional.

The executable prototype may contain demo state, but production components must bind the
same states to real entities and runtime events.

## 5. Screenshot-driven convergence loop

For each matrix row:

1. launch the real surface;
2. navigate to the exact state;
3. capture at the reference viewport and theme;
4. compare side-by-side with the approved reference;
5. record mismatches in layout, hierarchy, typography, color, density, content, and state;
6. fix the shared cause (token/component/layout), not one screenshot; and
7. recapture until blocking mismatches are gone.

Use image diff/perceptual metrics where practical, but never let a metric replace visual
inspection. Dynamic text and platform font rasterization require masks/tolerances. The
minimum evidence is a named screenshot for every required route × theme × form-factor row,
plus a report mapping each image to the reference used.

## 6. Completion gate

Do not call the UI complete unless all are true:

- [ ] Every reference destination and meaningful state is implemented.
- [ ] All controls perform the real product action or expose an honest unavailable state.
- [ ] The complete screenshot matrix exists and has been inspected.
- [ ] No stock scaffold/template styling remains.
- [ ] No visible borders/dividers/layout shadows violate the Flat 2.0 standard.
- [ ] Light/dark and phone/desktop maintain the same information architecture.
- [ ] Keyboard, screen-reader, contrast, text-scaling, and reduced-motion checks pass.
- [ ] Refresh/relaunch proves durable state where the reference implies persistence.
- [ ] A clean-checkout launch reproduces the same UI without ignored local artifacts.
- [ ] Responsible templates/scaffolds carry the same repair.

## Related skills

- `hybrid-design-tokens` — shared visual tokens
- `tauri-ui-review` — React/Tauri screenshot and interaction review
- `flutter-golden-ui` — Flutter visual evidence
- `content-block-ui` — exhaustive rich agent output
- `a11y-gate` — WCAG 2.2 AA
- `hybrid-runtime-verification` — real launch, persistence, and public workflow
