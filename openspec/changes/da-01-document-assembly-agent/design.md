## Context

Letters, claims and QA results persist in Postgres under three-layer clinical authority (ADR-002) and the three evidence states (ADR-003). Generation is a placeholder. The agent roster (ASO-MVP-001) names a Document Assembler and two composer agents; the UI plane addendum (ASO-ARCH-002) fixes the division of labour: A2UI describes, AG-UI carries, the shell materialises, and privileged blocks cannot originate from a plugin.

## Goals / Non-Goals

**Goals.** One contract for every generated document, held in a service that can be deployed, scaled and replaced on its own; the same engine linkable in-process by desktop and mobile hosts on the local lane; one AG-UI channel for the web, desktop and mobile shells; a package digest the host pins so a letter is never rendered against a package the host did not choose.

**Non-Goals.** No persistence in the agent. No evidence-state assignment. No signature from a payload. No model prose (D-2 stays open; the seed package is templates-only). No PDF (DA-5). No change to the active phase.

## Decisions

- **D-1, closed: the engine lives behind a self-contained Axum agent in this monorepo.** Two crates, one direction: `aso-document-assembly → clinical-docs`. The agent depends on neither `aso-host` nor a store, so the capability-inversion rule ("agent kernels do not write") is a property of the dependency graph, not a review finding. `clinical-docs` names no product so the desktop and mobile hosts can link it directly when the local lane forbids a network hop; the server host calls the agent over HTTP. Alternatives rejected: a library inside `aso-host` (couples the shared core to MiniJinja and forecloses independent deployment); routing through DocuMind (keeps generated documents in a second store outside the Postgres checks that guard signing).
- **Two channels, one function.** `POST /agent/run` for the AG-UI channel the shells consume; `POST /v1/assemble` for the host command. Both call `service::run`. The event sequence is fixed: `RUN_STARTED`, `STEP_STARTED`, `STATE_SNAPSHOT`, `TEXT_MESSAGE_*` carrying the canonical Markdown, one `CUSTOM` per surface, `STEP_FINISHED`, `RUN_FINISHED`.
- **Surfaces are an allowlist with a named refusal list.** `DraftPreviewBlock`, `QaFindingsBlock`, `ClaimsManifestBlock`, `HaltMemoBlock` may be described. `AffirmationBlock`, `SigningBlock`, `SubmissionBlock` are refused by name before the allowlist is consulted, so the impersonation attack in ASO-ARCH-002 fails at the composer, not only at the renderer.
- **Bodies are actor-free.** `AssembleRequest` is `deny_unknown_fields`; `actor`, `identity`, `affirmed`, `signature` are rejected at deserialization. Authority stays in Gate, `AppServices` and Postgres.
- **Evidence states are inputs, never outputs.** The host reads `case_evidence` and passes `criterion → state`. Only `internal_work_product` kinds may read `evidence_state()`; a correspondence template that calls it fails to render. `gap` routes to the clinician, `void` to the coordinator, in one match statement a new state cannot skip.
- **Clinical text has one door.** `claim(ordinal)` and `claims_for(tag)`. A missing claim fails the render. Context keys that would carry clinical prose are refused before the environment exists. Provenance mirrors `letter_claims` exactly: `document` (document only), `attributed_document` (document plus annotation — the surgeon's conclusion resting on a cited page), `annotation` (no document — internal work product only, refused in every class that leaves the practice). This is the web-00 frozen citation contract, decision 2, held by construction rather than by the exclusion copy.
- **Hash and signature.** `content_sha256` covers kind key, kind version, package digest and canonical bytes. `Assembly::render_signed(receipt)` is the only way a signature block is produced and it refuses a receipt whose hash differs. No template function can reach a signature.
- **Package pinning.** The host may send `expectedPackageDigest`; a mismatch is 409 and nothing renders.
- **Pins.** `minijinja =2.24.0` (D-7; verified stable on crates.io 2026-09-15; 3.0 is pre-release) with `serde` + `loader`; `tokio-stream =0.1.19` for the SSE stream. Both exact in `[workspace.dependencies]`; `versions.toml` hand edit under G-PIN.

## Integration with the three shells (DA-4, this design; not implemented here)

- `aso-host`: a `DocumentAssembler` port (`assemble(&ClinicalContext, AssembleRequest) -> Result<AssembleResponse, DocumentError>`) and a `draft_document` command that resolves claims from `letter_claims` sources and annotations, reads `case_evidence` states, calls the port, and in one transaction writes `letters`, `letter_claims`, `letter_qa_results` and the audit event. The command is the only writer. The engine never sees a database.
- `aso-web-server`: an HTTP adapter for the port that calls `POST /v1/assemble` on the agent, passing the pinned package digest. The web shell opens `POST /agent/run` for the live draft surface through the AG-UI channel owned by `aso.ui.channel`.
- Desktop (Tauri): the same port, satisfied in-process by linking `clinical-docs` and loading the same package directory, so a draft on the local lane never leaves the device; Tauri commands mirror the HTTP routes 1:1.
- Mobile (Flutter): review-only in v1 per ASO-ARCH-002; consumes `DraftPreviewBlock`, `QaFindingsBlock`, `ClaimsManifestBlock` descriptors over the channel; no affirmation on mobile.

## Risks / Trade-offs

A correctly formatted citation to a mis-extracted page is indistinguishable from a correct one; ra-16 source preview in front of the approving surgeon is the control. Template prose is the one channel construction cannot guard; D-4 governance closes it. The seed package carries regulatory citations that counsel has not reviewed. The Sept 10 package's procedure modules and code catalog are not yet ported, so `pa.initial_request` today covers the shared spine of the letter, not the per-procedure evidence sections.

## Validation and rollback

T0/T1 in the cloud harness mirroring the workspace pins: `cargo check`, `cargo clippy --no-deps --all-targets`, `cargo test` — 22 engine tests, 16 agent tests, all passing; negatives include an invented claim, a stripped citation, a stripped attribution, clinical text in context, a letter reading an evidence state, an unknown criterion, an actor in a body, a wrong package digest, a privileged surface. Live smoke: binary serves `/readyz` and streams the 11-event AG-UI sequence for the initial-request fixture. Not run: `cargo test --workspace` on the Mac (no cargo in the Cowork VM) — T2 for the workspace remains unverified until run there. Rollback: remove the two members and two pins from `Cargo.toml`; nothing else references the crates.

## 2026-09-19 approved revision-12 target — Boundary, inference and live task integration

The [implementation addendum](../../../docs/handoff/web-case-to-letter-revision-12-agent-integration.md) supplies the current
agent scope and dependencies after responsive web UI acceptance. Its synthetic
Liter-LLM inference, live AG-UI and interoperable task interfaces supersede older
no-external-inference/templates-only/optional-stream wording above. Production PHI
inference remains disabled pending qualification; Tauri and Flutter remain deferred.
The rendering kernel stays store-free, and model/tool calls happen before final
transaction locks. Preserve frozen browser intents, clinical authority and cited
claim requirements. This dated extension does not claim implementation or advance
the KBD runtime. Historical checks and completed tasks keep their original meaning.

- Confirm exact library/protocol pins and store-free kernel boundaries; adopt shell-neutral host DTOs and the verified Liter-LLM service source.
- Implement host-authorized source/tool collection, structured model candidates, citation resolution, revision capture, bounded inference, and durable task ports.
- Replace fixed precomputed AG-UI events with actual task progress, reconnect, cancellation and final persisted results; register A2A/MCP and MCP App follow-on changes.
- Keep production PHI inference disabled pending provider qualification and prohibit fallback into the synthetic route; record focused local evidence.
