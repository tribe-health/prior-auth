## 0. Decisions and pins

- [x] 0.1 D-1 resolved: standalone Axum AG-UI/A2UI agent in the monorepo, engine in `clinical-docs` (recorded in `.prometheus/decisions.md`)
- [x] 0.2 Operator-authorized exact `versions.toml` pins for `minijinja =2.24.0`, `tokio-stream =0.1.19` and `rmcp =3.4.0`; scoped local checks passed.

## 1. Engine (DA-2) — this change

- [x] 1.1 `clinical-docs`: six classes, kind registry, `claim()`/`claims_for()`, `evidence_state()` restricted to internal work product, seven schema QA checks as findings, content hash, receipt-bound signature
- [x] 1.2 T1: 22 tests including the sabotage-equivalent negatives listed in design.md

## 2. Agent (DA-2) — this change

- [x] 2.1 `aso-document-assembly`: AG-UI run route, JSON assemble route, catalog routes, health/readiness, surface allowlist, actor-free contract, package loader, binary
- [x] 2.2 Seed package `aso-prior-auth` with three kinds and one fixture each
- [x] 2.3 T1: 16 tests; live smoke over HTTP and SSE
- [x] 2.4 Run local focused engine/assembly checks and applicable web/server Tier 0/1 checks; reserve full integrated certification for web-17. Historical cloud results do not close this task.

## 3. Template package conformance (DA-1)


## 4. Schema (DA-3) — after G-DATA and D-3


## 5. Host integration (DA-4) — after web-10 and web-14 land

- [x] 5.1 Implement shell-neutral host assembly/task ports and authorized generation; one final transaction for letter, claims, QA, audit and task result after remote work; clinical signing authority remains independent.
- [x] 5.2 `aso-web-server` HTTP adapter calling `/v1/assemble` with the pinned digest; replace the `deterministic-template` body in `aso.generate_prior_letter`
- [x] 5.4 Web: AG-UI consumer for `/agent/run`; render `DraftPreviewBlock`, `QaFindingsBlock`, `ClaimsManifestBlock`, `HaltMemoBlock` through the component allowlist

## 6. Export (DA-5), extensibility (DA-6), governance (DA-7)


## 12. Approved agent integration additions — registered in revision 12

These additions follow [revision 12](../../../docs/handoff/web-case-to-letter-revision-12-agent-integration.md) after web UI acceptance.
They supersede incompatible older composer/inference/channel scope; checked
historical tasks do not establish their completion. Register through KBD rather
than editing generated counters.

- [x] 12.1 Confirm exact library/protocol pins and store-free kernel boundaries; adopt shell-neutral host DTOs and the verified Liter-LLM service source.
- [x] 12.2 Implement host-authorized source/tool collection, structured model candidates, citation resolution, revision capture, bounded inference, and durable task ports.
- [x] 12.3 Replace fixed precomputed AG-UI events with actual task progress, reconnect, cancellation and final persisted results; register A2A/MCP and MCP App follow-on changes.
- [x] 12.4 Keep production PHI inference disabled pending provider qualification and prohibit fallback into the synthetic route; record focused local evidence.

## Deferred beyond this browser child — preserved work

These prior task descriptions remain outstanding, outside current-child numeric
task registration. D-2 model-prose scope is resolved by revision 12; the remaining
D-3/D-4/D-8 governance/schema decisions below remain deferred. Historical checked
engine tasks record earlier implementation; local verification remains separate.

- 0.3 Resolve D-2 to D-8 in one sitting (DA-0); D-3/D-4/D-8 block DA-3 and DA-7
- 3.1 Port the Sept 10 procedure modules (facet, cervical fusion, lumbar fusion, lumbar decompression, SCS, arthroplasty) as `claims_for()` sections; no threshold gates, no state assignment
- 3.2 Port the code catalog and payer void rules as host-side `CheckInputs`, not template logic
- 3.3 Counsel review of `routing/` boilerplate (CMS-0057-F, 42 C.F.R. § 422, 29 C.F.R. § 2560.503-1)
- 4.1 Lane and privacy class for kinds, template packages and letter bodies
- 4.2 Additive `document_kinds` and template package tables; `letters` kind reference; backfill existing rows to `pa.initial_request`
- 5.3 Tauri commands mirroring the routes 1:1; in-process `clinical-docs` adapter for the local lane
- 5.5 Flutter: the four descriptors as ContentBlock variants (review only)
- 6.1 PDF backend per D-5 with the two-machine reproducibility measurement
- 6.2 `pa.p2p_briefing` (internal work product) and a patient-task kind (patient-facing)
- 6.3 `publish_template` capability, two-person approval, immutability once an approved letter uses a package
