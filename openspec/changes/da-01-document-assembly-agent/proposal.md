## Why

The Workbench has no document generation. `aso.generate_prior_letter` writes a `deterministic-template` placeholder body — a heading, a case number and a bullet list of rationales — and every downstream step (review, approval, the Affirmation Gate, signing) binds a hash of that placeholder. ra-15 defers annotation rendering to "the separate generation/QA contract" and no specification defines it. The template package produced on 2026-09-10 (`spine-pa-templates`, 53 templates, 12 fixtures) reverses ADR-003's `gap`/`void` meanings, assigns evidence states in its enrichment step, renders a signature from caller data, and accepts uncited clinical text; it is not integration-ready (ASO-DA-SPEC-001, defects 1–6).

D-1 is now decided: document assembly runs as a self-contained Axum agent service in this monorepo, speaking AG-UI and emitting A2UI surface descriptors, matching the agent roster in ASO-MVP-001 (08 Document Assembler; 09 LMN Composer and 14 Appeal Composer are its callers). It proposes; the host writes.

## What Changes

- Add `crates/clinical-docs`: a pure, domain-agnostic engine. Typed kinds in six classes; clinical text only through `claim()`/`claims_for()`; the seven schema `qa_check_types` as findings; canonical Markdown; content hash over kind, package digest and bytes; signature only from a receipt bound to that hash. No I/O, no clock, no evidence-state assignment.
- Add `crates/aso-document-assembly`: the agent. `POST /agent/run` (AG-UI SSE) and `POST /v1/assemble` (JSON) over one function; `GET /v1/kinds`, `/v1/packages`, `/healthz`, `/readyz`. Actor-free bodies. Surface allowlist with privileged blocks refused by name. Template packages loaded from disk once at start. Seed package `aso-prior-auth` with `pa.initial_request`, `pa.denial_response`, `pa.halt_memo` and one synthetic fixture per kind.
- Stage the 2026-09-10 deliverables under `docs/handoff/document-assembly/` as the specification of record and the DA-1 source package.
- Preserve: three evidence states read from the committed record, independently enforced clinical authority, citation provenance on every clinical sentence, no query cache, shell-neutral `aso-host`.

## Capabilities

### New Capabilities

- `document-assembly-agent`: render any typed medical document from cited claims, over AG-UI and JSON, without writing.

### Modified Capabilities

None in this change. `letters` gains a kind reference in DA-3 (additive, after G-DATA). `aso-host` gains a documents port and `draft_document` command in DA-4.

## Impact

Workspace: two new members and two new exact pins (`minijinja =2.24.0`, `tokio-stream =0.1.19`) in `[workspace.dependencies]`; `versions.toml` needs the corresponding hand edit under G-PIN (task 0.2). No existing crate, migration, route, or React surface is touched. The active waypoint (`runtime-architecture › web-case-to-letter`, next `web-07`) is not moved; DA-2 runs beside it because it shares no module. DA-3 and DA-4 are sequenced after web-10/web-14 land their generation commands, which `draft_document` replaces.

Specification of record: `ASO-DA-SPEC-001`. Decisions D-2 to D-8 remain open and block DA-3 onward; D-1 is closed by this proposal.
