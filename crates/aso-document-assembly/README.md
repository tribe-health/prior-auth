# aso-document-assembly

Document Assembler agent for the Prior Authorization Workbench. Agent roster
position 08, serving 09 (LMN Composer) and 14 (Appeal Composer). Autonomy:
**Gated**.

It renders a typed medical document from cited claims and describes the
surfaces that show it. It does not persist anything, does not read a clock,
does not assign an evidence state, and does not render a signature from
caller data. Its one caller is the host's `draft_document` command.

Specification of record: `ASO-DA-SPEC-001` (`docs/handoff/document-assembly/`).
OpenSpec change: `openspec/changes/da-01-document-assembly-agent/`.

## Shape

```
crates/clinical-docs            pure engine: kinds, claim(), 7 QA checks, hash. No I/O, no domain names.
crates/aso-document-assembly    this crate: Axum 0.8 service + template packages + fixtures
  src/agui.rs                   AG-UI events and RunAgentInput
  src/a2ui.rs                   A2UI surface descriptors; privileged blocks refused by name
  src/contract.rs               AssembleRequest / AssembleResponse (actor-free, deny_unknown_fields)
  src/packages.rs               template package + kind loading (the only file I/O; runs once at start)
  src/service.rs                the one operation
  src/routes.rs                 HTTP surface
  templates/aso-prior-auth/     seed package: pa.initial_request, pa.denial_response, pa.halt_memo
  fixtures/                     synthetic requests, one per kind
```

Dependency direction is the architecture: `aso-document-assembly → clinical-docs`.
Neither crate depends on `aso-host`, a database driver, or a store. Agent
kernels do not write; the graph enforces it.

## Routes

| Route | Purpose |
| --- | --- |
| `POST /agent/run` | AG-UI. Body is `RunAgentInput`; the assembly request rides in `forwardedProps.assembly`. Streams `RUN_STARTED`, `STEP_STARTED`, `STATE_SNAPSHOT` (hash, QA, claims manifest), the canonical Markdown as one assistant text message, one `CUSTOM` (`a2ui.surface`) per surface descriptor, `STEP_FINISHED`, `RUN_FINISHED`; or `RUN_ERROR`. |
| `POST /v1/assemble` | Same operation, plain JSON, for the host command. 404 unknown kind · 409 package digest mismatch · 422 refused or template error. |
| `GET /v1/kinds` | Registered kinds with class, citation policy, package digest. |
| `GET /v1/packages` | Loaded packages with digest and file count. |
| `GET /healthz` · `GET /readyz` | Liveness; readiness is "at least one kind loaded". |

Surfaces this agent may describe: `DraftPreviewBlock`, `QaFindingsBlock`,
`ClaimsManifestBlock`, `HaltMemoBlock`. `AffirmationBlock`, `SigningBlock` and
`SubmissionBlock` are refused by name (`a2ui::PRIVILEGED_SURFACES`).

## Configuration

| Variable | Default |
| --- | --- |
| `ASO_DA_BIND` | `127.0.0.1:8091` |
| `ASO_DA_PACKAGES_DIR` | this crate's `templates/` |
| `RUST_LOG` | `info` |

Loopback by default. Reached through Flint Gate or from the host process; never
from a browser directly.

## Run

```
cargo run -p aso-document-assembly
curl -s localhost:8091/readyz
curl -s localhost:8091/v1/assemble -H 'content-type: application/json' \
  -d @crates/aso-document-assembly/fixtures/initial_request_lumbar_fusion.json | jq .assembly.contentSha256
```

## Contract in one paragraph

A rendered document contains only template prose, document claims and
annotation claims. Clinical text enters a template only through
`claim(ordinal)` or `claims_for(tag)`; a template that asks for a claim that
does not exist fails to render, an annotation with no backing document is
refused in any kind that leaves the practice (it may only add attribution to a
cited document, as `letter_claims` requires), and context keys that would carry clinical
prose (`symptom_summary`, `necessity_rationale`, …) are refused at the door.
Evidence states are read from the request and are visible only to
`internal_work_product` kinds; `gap` routes to the clinician, `void` to the
coordinator. The seven QA checks are the schema's `qa_check_types`. The content
hash covers kind key, kind version, package digest and the canonical bytes, and
a signature block is produced only by `Assembly::render_signed` from a receipt
naming that hash.

## What this is not yet

- Not wired: `aso-host` has no documents port and no `draft_document` command
  (DA-4). The existing `generate_letter` path still renders the
  `deterministic-template` placeholder in `aso.generate_prior_letter`.
- The seed package is the conformed successor of the Sept 10
  `spine-pa-templates` package (53 templates, 12 fixtures). Its procedure-
  specific evidence modules, code catalog and payer void rules are not ported
  yet (DA-1); the old package reverses ADR-003's `gap`/`void` and must not be
  loaded as-is.
- No PDF (DA-5). The engine emits canonical Markdown only.
- Regulatory boilerplate in `routing/` cites CMS-0057-F, 42 C.F.R. § 422 and
  29 C.F.R. § 2560.503-1 and has not had counsel review.
