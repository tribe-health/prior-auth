## Why

ra-15 defers annotation rendering to "the separate generation/QA contract", and no specification defines it. The template package produced outside this repository reverses ADR-003's `gap`/`void` meanings, assigns evidence states outside the reassessment command, renders a signature from caller data, and accepts uncited clinical text. Any medical document the Workbench produces needs one contract before the first letter is persisted: a typed kind, clinical text only as cited claims, QA results shaped for `letter_qa_results`, and a content hash the Affirmation Gate can bind.

## What Changes

Specify document assembly as a pure engine called by one host command. Clinical text enters a document only through claims with document/page/date or attributed-annotation provenance. Kinds are typed rows in the existing `*_types` idiom and belong to one of six classes: clinical correspondence, procedural correspondence, internal work product, patient-facing, structured transaction, source-documentation assist. The engine emits canonical Markdown, a rendered-claims manifest, QA findings and a content hash; it has no I/O, no clock and never assigns an evidence state.

## Capabilities

### New Capabilities

- `da-00-document-assembly-contract`: The generation and QA contract for every generated medical document.

### Modified Capabilities

None. `letters` gains a kind reference in a later additive change (DA-3) after G-DATA.

## Impact

ASO: proposed `aso-host` documents port and `draft_document` command with HTTP/desktop parity (DA-4); additive schema for document kinds and template packages (DA-3). Companion: a standalone domain-agnostic engine crate (D-1) and an export backend (D-5).

Dependencies: ra-15-attributed-annotations and ra-16-authorized-source-preview before DA-4. Eight decisions (D-1 to D-8, see design.md) block implementation. Specification of record: `ASO-DA-SPEC-001`. This proposal authorizes no implementation during planning.
