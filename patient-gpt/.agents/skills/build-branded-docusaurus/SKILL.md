---
name: build-branded-docusaurus
description: Scaffold, brand, sanitize, and verify a Docusaurus documentation portal for a Prometheus project. Use when creating project docs, a public documentation site, GitHub Pages, local search, Mermaid diagrams, or a docs container.
---

# Build Branded Docusaurus

Read the project's brand and UI standard before choosing tokens. Inventory existing
documentation, then classify every source as public, public-normalize,
private-synthesis-only, or excluded. Raw wikis, session events, conversation logs,
credentials, personal data, and machine-local paths never enter public output.

## Procedure

1. Detect an existing site and brand assets; update the source rather than generated HTML.
2. Ask only unanswered questions about public audience, publication URL, search, and container delivery.
3. Pin Docusaurus and runtime dependencies. Use separate docs plugin instances when content ownership differs.
4. Apply the brand tokens in supported CSS variables and stable theme classes. Swizzle only when CSS cannot satisfy the structural contract.
5. Enforce Flat 2.0: no visible borders, separator lines, gradients, or decorative shadows. Regions differ by filled backgrounds and spacing. Preserve visible keyboard focus.
6. Add Mermaid with coordinated themes and deterministic local search by default.
7. Add `SITE_URL` and `BASE_URL`, GitHub Pages publishing, and a non-root immutable container.
8. Add a sanitizer that rejects private paths, secrets, and raw wiki content.
9. Run frozen install, production build, link checks, representative route checks, responsive light/dark screenshots, and accessibility checks.

Use `scripts/scaffold.mjs <site-dir> <site-name> <site-url> <base-url>` for a new
site, then replace the starter copy with reviewed project documentation and brand
assets. Use `scripts/verify.mjs <site-dir>` as the minimum repeatable gate. A site
is not complete merely because the development server opens.
