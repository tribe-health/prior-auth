# Revision 12 implementation addendum — responsive web and document generation

Date: 2026-09-19. Status: **approved target; implementation and certification pending**.
Parent/child: `runtime-architecture › web-case-to-letter`.

This addendum records the operator-approved expansion of the document-generation
work. It does not advance the KBD ledger, change its current revision, mark tasks
complete, or replace recorded evidence. Revision 12 was registered through `prometheus kbd revise` on 2026-09-19 at
source revision 1717 after UI repair acceptance; task registrations follow through
the typed runtime. Preserve
completed tasks and register the additional work through supported KBD commands.

The uncomfortable thing: the existing template endpoint can emit an SSE sequence
without performing live inference, and the existing signed demo can bind a
placeholder body. Neither proves the requested agent workflow or clinical truth.

## 1. Entry condition and precedence

Finish the responsive ASO web interface first. Acceptance includes full viewport
use, reachable bottom actions, independently scrollable workflow navigation,
320–1440 pixel adaptation, preserved form state, accessible motion/reduced motion,
and visual comparison with `docs/design/prototype/` and the brand guide. Fix the
observed synchronization and stale-revision defects without bypassing authority.
Only after this acceptance is recorded does agent implementation become active.
Documentation preparation can run alongside that UI work.

This revision supersedes the following older scope decisions:

- The child plan's deferral of all external inference becomes a synthetic-demo
  Liter-LLM route plus a separately disabled production route.
- `da-01` D-2's templates-only/no-model-prose restriction is replaced by bounded
  model candidate generation followed by cited, package-controlled assembly.
- The handoff's optional live AG-UI channel and fixed precomputed event sequence
  become required live task progress, reconnect, cancellation, and final results.
- The older prompt's revision-11 instruction, restart at `web-07`, workspace-wide
  test prerequisite, and suggestion to import Axum contract types into `aso-host`
  do not govern this revision. Use shell-neutral DTOs and browser-scoped checks.
- References to one transaction cover final persistence only. Model calls,
  retrieval, and remote tool execution occur before that transaction.

Tauri, Flutter, PDF export, procedure-module migration, schema kind references,
and full template governance remain later work. The September 10 template ZIP
remains source material: do not load its reversed evidence-state interpretation.
Real payer transport and production deployment remain outside this child.

## 2. Work packages and dependency order

These are additional implementation tasks, not assertions about existing task
completion. Append their designs and acceptance to the named OpenSpec changes;
do not rewrite proposals or checked historical evidence. The two follow-on names
below are proposed new changes to register, not claims that directories exist.

| Package | Changes / dependencies | Concrete work and exit evidence |
|---|---|---|
| A. Boundary and version inventory | Extend `da-01-document-assembly-agent`; after UI acceptance | Verify existing `clinical-docs` and assembly contracts, Liter-LLM source/provider configuration, and protocol implementations; record exact dependency/protocol pins in `versions.toml`. Classify task/event/artifact data before schema or publication. |
| B. Authorized assembly and persistence | `da-01`, `web-10-prior-letter-command`; after A | Host ports for assembly, inference, bounded tools, and durable tasks; source collection and revision capture; additive persistence migration; canonical Markdown/digest/claims/seven-QA transaction; retain idempotency and all clinical checks. |
| C. Denial purposes | `web-14-response-letter-command`; after B and `web-13` | Separate administrative correction and clinical appeal; confirmed class, challenged determination and original signed request linkage; clinical appeal requires fresh four-part affirmation. |
| D. Live task and inference adapters | Extend `da-01`; after B | Internal authenticated Liter-LLM, actual `/agent/run` progress, cancellation and durable reconnect, provider/tool budgets, restart reconciliation, no production-to-demo fallback. |
| E. Shared document surfaces | `web-11-prior-letter-workspace`, `web-15-response-letter-workspace`; after B/C/D | Shared four-block presentation, typed task hooks, channel-owner subscription lifetime, provisional stream handling, committed artifact readback, mobile/reduced-motion behavior. |
| F. External protocol adapters | Proposed `da-02-a2a-mcp-task-adapters`; after D | Pinned A2A discovery/task lifecycle; MCP Streamable HTTP server and allowlisted authenticated MCP client; all adapters share task service and authorization. |
| G. MCP Apps renderer | Proposed `da-03-mcp-app-document-surfaces`; after E/F | Sandboxed `ui://` resources, explicit CSP, host-mediated actions; share components/view models with A2UI while preserving distinct wire protocols. |
| H. Repeatable deployment/fixtures | `web-16-web-flow-fixture`; after B–G | Internal Compose services and readiness, pinned template manifest, isolated synthetic cases, deterministic recorded model responses, live Qwen smoke fixture, initialization preserves identity and clinical revisions. |
| I. Local certification | `web-17-browser-scenario-certification`; after H | One unchanged local candidate; complete three browser workflows, negative controls, protocol/task/persistence evidence, independent artifact review, then runtime-ledger reconciliation. |

Existing file ownership for implementation:

- `crates/aso-host/src/ports/mod.rs` and `letter_workflow.rs`: shell-neutral
  orchestration ports and DTOs. `crates/clinical-docs/src/` remains the stateless
  claim/render/QA kernel, without database, Axum, or credential dependencies.
- `crates/aso-web-server/src/adapters/`, `main.rs`, `migrations.rs`,
  `crates/aso-server-axum/src/routes/letters.rs`, and new additive files under
  `migrations/server/`: trusted persistence, authorization, task/event storage,
  assembly/inference adapters, configuration, and typed HTTP composition.
- `crates/aso-document-assembly/src/{routes,agui,a2ui,contract,service}.rs`:
  protocol adapters and live event delivery. Add adapter modules here as needed;
  do not add direct clinical SQL or authority-bearing writes to the kernel.
- `web/src/features/letter-workflow/`, `features/denial-response/`, and the app's
  runtime/channel composition: shared blocks, typed view models and services.
  Add shared presentation under `web/src/shared/ui/` only when both transports
  consume it. Components do not own sockets, HTTP clients, or database sessions.
- `docker-compose.yaml`, `docker/demo-init.sh`, assembly template packages, and
  `docs/architecture/fixtures/web-case-to-letter/`: deployed services, synthetic
  provenance, package digests, expected artifacts, and local-run evidence.
- Liter-LLM source is available at `/Users/gqadonis/Projects/references/liter-llm`;
  its `crates/liter-llm-proxy` and `crates/liter-llm-cli` are the inspected service
  candidates. Verify exact source revision and executable configuration before
  adopting them; a README capability claim is not an integration result.

## 3. Data, inference, and trust contracts

Use Flint Forge Postgres for authoritative case, document, letter, claim, QA,
task, event, and audit state. Persistence belongs to trusted host adapters.
The assembly service may access a host-owned task port; the rendering kernel
never receives SQL handles or authority credentials. Model output is a candidate,
not a write capability. An authenticated integration cannot acquire clinical
privileges merely by calling a different protocol.

All entry points authorize the same case/practice and resolve an actor through
trusted request context. Preserve actor-free browser commands. Package selection,
claims and credentials are host-owned; external callers cannot inject an assembly
claim manifest to bypass source retrieval. Keep `/v1/assemble` as an authenticated
internal render contract, not an alternative public clinical mutation route.

Capture case, resolution, policy/criteria, evidence, determination, and gate
revisions. Fetch bounded sources and annotations, ask Liter-LLM for structured
candidate claims, resolve cited document/page/date references, and refuse invented
or unrelated citations. Annotation attribution must retain its backing document;
annotation-only external claims remain excluded. The engine renders through the
pinned package and returns seven QA findings; it never assigns evidence states.

After remote work completes, begin the final transaction, reauthorize and
revalidate revisions, then write canonical Markdown, decoded 32-byte assembly
digest, one row per rendered claim, seven QA results, versioned assembly metadata,
audit event and durable task result atomically. Preserve historical hash semantics
and signed documents. The engine digest binds kind, version, package digest and
canonical bytes; do not substitute a Markdown-only hash. Blocking QA leaves a
draft. Preserve `not_applicable` results; review cannot turn failures into passes.
A retry with an uncertain outcome checks the existing command identity first.

Classify durable task metadata and events before publication. Only approved
status projections flow via Flint Realtime Fabric to the entity graph. Source
text, prompts, claims and letter artifacts remain protected, fetched under current
authority. Do not place unrestricted payloads in a task event stream, diagnostic
log, or PGlite replica. Scope transient Zustand buffers to session/practice/task;
logout, revocation, and account change close channels and discard those buffers.

### Provider configuration

Use an authenticated internal Liter-LLM service, with isolated routes:

- Synthetic demo: `QWEN_TOKEN_PLAN_OPENAI_URL` set to the operator-supplied
  OpenAI-compatible endpoint, `QWEN_TOKEN_PLAN_MODEL=qwen3.8-max`, and the
  `QWEN_TOKEN_PLAN_API_KEY` secret injected server-side. The secret value must
  never appear in tracked files, fixture data, prompts, logs, or browser bundles.
- Production PHI: separately configured US provider, disabled until documented
  US processing, BAA and retention qualification passes. No fallback to the
  synthetic route. Disable payload logging and prompt/response caching for PHI.

The supplied account's actual model access, streaming and tool-calling support
are unverified until a synthetic live smoke test passes. Record observed provider
identity/version metadata separately from the template package digest. Provider
qualification is pending work and does not block synthetic UI demonstration.

### Shared task interfaces

| Adapter | Required behavior |
|---|---|
| AG-UI `POST /agent/run` | Actual retrieval/generation/validation/persistence progress; task identity, reconnect and cancellation; terminal success only after durable result exists. Replace `run_events` precomputation. |
| A2UI | Versioned allowlist: `DraftPreviewBlock`, `QaFindingsBlock`, `ClaimsManifestBlock`, conditional `HaltMemoBlock`; no model-supplied executable markup or clinical controls. |
| A2A | Pinned protocol version, `/.well-known/agent-card.json`, task creation/read/subscribe/cancel/artifacts, input-required and terminal states; advertise only implemented capabilities. |
| MCP `/mcp` | Streamable HTTP negotiation/session semantics, authorized tools/resources, starting/reading/canceling drafts, retrieving draft/claim/QA artifacts. No signing, affirmation, submission, arbitrary SQL/filesystem, or credential tools. |
| MCP client | Configured server allowlist, server authentication, independent effect classification, bounded schemas/budgets, case-scoped source tools and cancellation. Server descriptions and outputs are untrusted. |
| MCP Apps | Tool-linked sandboxed `ui://` resources and explicit CSP, shared React presentation, host-mediated actions. A2UI descriptors are not MCP App wire messages. |

Task IDs alone never authorize access. Protocol adapters share durable status,
idempotency, cancellation and artifact results through one task service. Model
and tool cancellation must propagate, and a cancellation racing final commit
must return the actual persisted outcome. Restart must reconcile durable work
before retrying writes. Finished generation does not mean approval or signing.

## 4. Verification, rollout, and remaining facts

Run Tier 0 after each edit and focused Tier 1 after each implementation unit.
At H completion, freeze the local candidate and run the full browser/protocol
campaign under web-17. Do not use CI or native results as acceptance evidence.
Verify new library/protocol pins against primary sources before introducing them.

Required local acceptance:

1. Initial request: login, case/source/policy/evidence work, fresh gate, cited
   generation, source review, QA, approval, signing, submission acknowledgement.
2. Two independent denial cases: confirmed administrative correction and clinical
   appeal; the appeal requires a new affirmation cycle and cited denial reasoning.
3. Exact persisted Markdown, assembly digest, rendered claims, seven findings,
   package mismatch refusal, and final-transaction rollback/idempotency.
4. Real streaming, reconnect, cancellation, restart recovery and duplicate
   commands; same task ownership and results across AG-UI, A2A and MCP.
5. Negotiation/discovery, task lifecycle, MCP tools/resources and client tools,
   shared A2UI/MCP App rendering, CSP, and prohibited-control refusal.
6. Effective negative controls for missing/unrelated citations, stale revisions,
   blocking QA, tenant isolation, logout/revocation, tool injection, and refused
   production-to-synthetic inference routing.
7. Final desktop/mobile resize, form continuity, keyboard/source access and
   reduced motion, followed by independent artifact review.

Use recorded synthetic model responses for deterministic content assertions and
a separate live Qwen smoke for provider behavior. Live output need not be
byte-identical across runs. Fixture initialization must preserve existing login,
signatures, source records and revisions; no destructive reset is a repair path.
Roll out additive storage/API support before enabling callers. Roll back callers
without deleting task history or signed artifacts.

Known gaps at this document's creation: the assembly route constructs its full
SSE event vector before responding; the browser generation hook reaches the
existing letter service; Liter-LLM routing, durable agent tasks, A2A, MCP adapters
and shared MCP App surfaces have not been certified here. The two assembly-related
Cargo pins are not yet reflected in `versions.toml`. This document establishes
work and dependencies; it supplies no passing implementation evidence.

### Activation receipt — 2026-09-19

The coordinating executor recorded final independent UI review **Passed**, the
0637 criteria-revision migration/regression **Passed**, and browser recovery through
current policy selection, evidence revision 2 and clinical-appeal generation
HTTP 200. See [the scoped UI evidence](../architecture/fixtures/web-case-to-letter/ui-repair-evidence-2026-09-19.md).
The runtime now carries revision 12 and exact next work
`/kbd-apply da-01-document-assembly-agent`. This activates the planned integration;
it does not certify model inference or the full clinical workflow.

### Task registration receipt

Typed `prometheus kbd change register` and `task register` commands registered
three changes and 46 pending tasks at source revision 1766 under canonical
phase `runtime-architecture::web-case-to-letter`. Numeric checkbox ordinals are
used: da-01 has 15 tasks, da-02 and da-03 have 6 each; web-10/11/14/15/16 now
have 9 each and web-17 has 11. All prior change/task statuses were compared with
the revision-1717 snapshot and remain unchanged. The child has 22 registered
changes, 7 complete; plan revision stays 12 and exact next stays da-01.

The runtime's old pending task titles may still mention a deterministic composer
or native parity. This revision's appended tasks and dependency contract supersede
those scope descriptions; their statuses were deliberately not rewritten. The
new tasks are registered pending even where an older Markdown checkbox records
historical engine implementation; acceptance must be reconciled against local
evidence before transition.
