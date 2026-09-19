# Design system

## Direction

The interface extends the practice identity into a calm clinical operations workspace. Its signature is the ASO sweep: it appears as the actual application mark, as a restrained structural curve on the public landing page, and as a brief progress gesture during meaningful transitions. It never becomes decorative wallpaper.

## Typography

Playfair Display is reserved for decisive display statements and document titles. Mulish carries interface and reading text. JetBrains Mono carries dates, codes, citations, step numbers, and compact status labels. The generated token source in `assets/templates/design-tokens/tokens.toml` is authoritative.

## Color and surfaces

Use the generated semantic tokens. Canvas, surface, raised, chrome, and zebra form the hierarchy. Ember Deep is the text-safe accent; vivid ember is limited to fills and large display use. Navy/slate is the only cool family. Clinical `met`, `gap`, and `void` retain separate text labels, shapes, and surfaces.

## Shape and depth

The system is Flat 2.0: nearby regions separate primarily through surface value, spacing, and typography. Radius is five pixels, with eight pixels for larger compositions. Shadows are limited to overlays and the paper letter surface.

## Application structure

Desktop uses a 64-pixel global icon rail, an optional 236-pixel case context rail, and a fluid workbench. Compact screens use a 56-pixel branded top bar, an off-canvas workflow sheet, and a safe-area-aware bottom tab bar. The information architecture stays the same at every width.

The public surface uses a branded landing page and a split authentication frame. The operating surface uses shadcn primitives, shared product parts, connected feature sections, and route views. Components read data through hooks and stores; they do not fetch or open databases.

## Motion

Routine state changes enter in 200ms and exit in 140ms with `cubic-bezier(0.23, 1, 0.32, 1)`. The focal public-page motion traces the two sweep forms once. Operating views use short continuity and feedback transitions. Nothing bounces, clinical gates do not animate, and reduced motion removes spatial movement.

## Content

Labels use short concrete nouns. Criteria copy states what the chart shows. Warnings state the consequence. Product copy does not promise approval, fabricate practice results, or obscure whether a statement came from a document, a surgeon, or the system.
