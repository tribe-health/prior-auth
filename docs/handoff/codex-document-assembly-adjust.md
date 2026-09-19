# Codex adjustment prompt — document assembly agent

> **2026-09-19 supersession notice:** This is historical source material. The
> approved [revision-12 implementation addendum](web-case-to-letter-revision-12-agent-integration.md) controls current
> scope and order: finish web UI acceptance first, then implement Liter-LLM
> candidate prose, live AG-UI, A2A, MCP and shared MCP App surfaces. It supersedes
> older revision/waypoint instructions and inference/channel deferrals below.
> Historical test claims are not local certification. No long-lived database
> transaction spans remote inference or tool calls.

Paste the fenced block into Codex running `gpt-6-astra` at the repository root
`/Users/gqadonis/Projects/TribeHealth/kevin/prior-auth`. Set reasoning effort
**high** through the API.

This is not a new phase. It is a course correction to the running child
`runtime-architecture › web-case-to-letter` (waypoint next: `web-07`). Work
landed on 2026-09-19 that the child plan does not know about:
`openspec/changes/da-01-document-assembly-agent/`, two new crates, and the
decision record in `.prometheus/decisions.md`. The prompt tells the workflow
how to absorb it without moving the waypoint or reopening frozen contracts.

---

```
GOAL
Absorb the document-assembly agent into the running web-case-to-letter child
so that web-10 and web-14 generate letters through the agent instead of the
PL/pgSQL placeholder body, without changing the child's browser-first order,
without moving the waypoint, and without touching the deferred RA19/RA21
Tauri work. Then continue the child from /kbd-apply web-07 as planned.

Restate this goal in one sentence before doing anything. Name the phase:
this is a PLAN revision inside runtime-architecture › web-case-to-letter,
not a new phase and not execution.

CONTEXT — read in this order

  1. CLAUDE.md (the managed region) and AGENTS.md, final section.
  2. .kbd-orchestrator/current-waypoint.json — state the current phase.
  3. .prometheus/decisions.md — the last entry, dated 2026-09-19, closes D-1:
     document assembly is a self-contained Axum AG-UI/A2UI agent in this
     monorepo, engine in crates/clinical-docs. Treat it as decided.
  4. docs/handoff/document-assembly/FINDINGS-2026-09-19.md — six findings and
     the four adjustments this prompt asks for. Section 4 is your work list.
  5. openspec/changes/da-01-document-assembly-agent/{proposal,design,tasks}.md
     and specs/document-assembly-agent/spec.md — the change that landed.
  6. crates/clinical-docs/src/{lib,claim,engine,qa,kind}.rs and
     crates/aso-document-assembly/src/{contract,service,routes,a2ui,agui}.rs
     — read the code, not only the README; the README is a summary.
  7. docs/handoff/document-assembly/ASO-DA-SPEC-001.html — specification of
     record. Its §1 defect table explains why the 2026-09-10 template package
     must NOT be loaded; its annotation model is superseded by web-00
     decision 2 (see finding F-4).
  8. .kbd-orchestrator/phases/runtime-architecture/children/web-case-to-letter/
     plan.md — especially the frozen data decisions and the entries for
     web-10, web-11, web-14, web-15, web-16, web-17.
  9. .prometheus/gotchas.md before touching aso-web-server/src/adapters/gate.rs
     or the migrations.

WHAT IS TRUE NOW (verify each before relying on it)

  - crates/clinical-docs: 24 tests. crates/aso-document-assembly: 16 tests and
    a live SSE smoke. Both ran in a cloud harness mirroring Cargo.toml's pins,
    NOT on this machine. Your first command is therefore:
        cargo test -p clinical-docs -p aso-document-assembly
    then `cargo build --workspace` and `bash scripts/audit.sh`. If the
    workspace does not build with the two new members, fix the build before
    anything else and record the cause in .prometheus/gotchas.md.
  - Cargo.toml has two new exact pins (minijinja =2.24.0, tokio-stream
    =0.1.19). versions.toml does NOT yet carry them. Add them there under
    G-PIN with the rationale from design.md. Do not add any other pin.
  - The agent has no dependency on aso-host, sqlx, tauri or
    flutter_rust_bridge. Keep it that way; if a task seems to require one,
    stop and surface the conflict.
  - aso.generate_prior_letter still writes the 'deterministic-template' body.
    That is the thing being replaced.

THE FOUR ADJUSTMENTS (FINDINGS §4) — record them as plan revision 11 of the
child, then reflect them in the affected OpenSpec changes' design.md and
tasks.md. Do not rewrite proposal.md files; append a dated "Revision" section.

  A. web-10-prior-letter-command and web-14-response-letter-command
     - Add a DocumentAssembler port to aso-host (ports/mod.rs), shell-neutral:
         assemble(&ClinicalContext, AssembleRequest) -> Result<AssembleResponse, LetterWorkflowError>
       with the request/response types re-exported from clinical-docs /
       aso-document-assembly contract types, or mirrored in aso-host if that
       import would name a shell (it does not today; check).
     - The Postgres adapter's generate_letter collects claims from the case's
       cited sources and attributed annotations, reads case_evidence states,
       calls the port with expectedPackageDigest from config, and writes
       letters, letter_claims, letter_qa_results and the audit event inside
       the transaction it already opens. Change aso.generate_prior_letter (new
       migration, additive; do not edit a shipped migration) to accept body,
       content hash, model name/version and claim rows as arguments while
       keeping every existing revision guard, gate check and idempotency rule.
     - Purpose → kind mapping: prior_authorization_request → pa.initial_request;
       corrected_resubmission and clinical_appeal → pa.denial_response with
       context.response_mode set accordingly. The determination and original
       request linkage web-14 requires goes into context.determination and the
       claims; nothing clinical goes into context.
     - Provenance mapping is exact: a claim with an annotation must also carry
       its document page (attributed_document). An annotation-only claim is
       refused by the engine in these kinds; the adapter must not try to
       "guide wording" around that — the web-00 exclusion copy applies.
     - Acceptance for both changes gains: the persisted body equals
       assembly.canonicalMarkdown byte for byte; letters.content_sha256 equals
       assembly.contentSha256; one letter_claims row per renderedClaims entry;
       seven letter_qa_results rows; a blocking QA failure leaves status draft.

  B. QA
     - Remove any plan language that implies a second QA implementation. The
       seven findings are the QA. If a check needs inputs the adapter does not
       have (policy version in force, affirmed pathway codes), pass what
       exists and accept not_applicable for the rest; record which are
       not_applicable in the change's evidence.

  C. web-16-web-flow-fixture / web-17-browser-scenario-certification
     - docker-compose.yaml and docker/demo-init.sh start aso-document-assembly
       on the internal network (loopback is the default bind; give it the
       compose network address explicitly), with ASO_DA_PACKAGES_DIR pointing
       at crates/aso-document-assembly/templates.
     - aso-web-server config gains ASO_DOCUMENT_ASSEMBLY_URL and
       ASO_DOCUMENT_ASSEMBLY_PACKAGE_DIGEST; startup fails without them, the
       same way it fails without Kratos. The digest is read from
       GET /v1/packages at fixture-build time and frozen into the fixture
       manifest, so a template edit breaks the fixture loudly.
     - Add the agent's readiness to the web-17 stack checks.

  D. web-11-prior-letter-workspace / web-15-response-letter-workspace
     - The letter workspace renders DraftPreviewBlock, QaFindingsBlock,
       ClaimsManifestBlock and HaltMemoBlock from the persisted letter, QA and
       claim rows through the existing typed HTTP routes. The live AG-UI
       channel (POST /agent/run) is optional in this child; if you wire it,
       it is opened by the channel owner (aso.ui.channel), never by a
       component, and it renders only the four allowlisted surfaces.
     - No affirmation, signing or submission surface is derived from agent
       output. audit.sh check 3 still applies.

OUT OF SCOPE — do not do these, list them as deferred in the plan revision
  - Tauri commands for any new route (RA19).
  - In-process clinical-docs adapter for the desktop local lane (RA19/RA21).
  - Flutter ContentBlock variants.
  - PDF export (DA-5), the DA-1 port of the 2026-09-10 procedure modules,
    schema kind reference (DA-3), template governance (DA-7).
  - Loading docs/handoff/document-assembly/spine-pa-templates-2026-09-10.zip
    into the agent. It reverses ADR-003. Source material only.

STOP CONDITIONS
  - The workspace does not build with the new members and the cause is not a
    one-line pin or feature fix: stop, record, ask.
  - A frozen web-00 command shape cannot carry expectedPackageDigest or the
    claims manifest: record the needed contract revision in the plan revision
    and ask before changing the frozen contract.
  - Any path would require aso-host, clinical-docs or aso-document-assembly
    to name a shell or a store: stop and surface it.

DONE MEANS
  - Plan revision 11 recorded; web-10/11/14/15/16/17 design.md and tasks.md
    carry dated revision sections; versions.toml pinned; workspace builds and
    the two new crates' tests pass ON THIS MACHINE with commands and output
    in the evidence directory; audit.sh passes; waypoint still says
    exactNextCommand /kbd-apply web-07-criteria-selection-ui.
  - Reflection leads with the delta between this prompt and what you did,
    including anything you could not verify.

STYLE
  Short declarative sentences. Statement, mechanism, stakes. No marketing
  words. Every document you write names the uncomfortable thing.
```
