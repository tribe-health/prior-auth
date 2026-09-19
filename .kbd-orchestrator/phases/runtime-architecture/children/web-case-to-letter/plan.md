PLAN: runtime-architecture › web-case-to-letter
Project: Prior Authorization Workbench
Date: 2026-09-16
OpenSpec available: YES
Changes to implement: 18
Phase progress at entry: 0/0

## Outcome

Deliver and locally certify the browser workflow before native runtime or mobile work resumes: authenticate, create and manage a case, resolve the administering entity, upload and process synthetic documents, select effective payer criteria, assemble cited met/gap/void evidence, generate/review/sign a prior-authorization request, record a local submission acknowledgement, ingest and classify a denial, and generate/review/sign either a corrected-resubmission letter or a clinical appeal.

This child supersedes the parent instruction that kept product routes as placeholders. RA19 and RA21 remain pending. New operations live in shell-neutral `AppServices` and mount through typed browser HTTP routes. Browser behavior is the only acceptance surface here. Tauri wrappers, Tauri window/runtime, SQLite, native updates, Flutter, and device work remain deferred until web-17 has certified the complete browser workflow.

## Plan revision 10 — browser completion before native parity

The operator's 2026-09-16 course correction makes the ordering strict: complete and certify the browser case-to-letter workflow before any further Tauri or mobile implementation. Earlier HTTP/Tauri parity requirements are deferred to RA19 and RA21. The frozen web-00 domain, authority, tenant, citation, idempotency, and error contracts remain binding; only the shell delivery order changes.

Full-stack testing waits until changes web-00 through web-16 are implemented. Each implementation change runs only applicable Tier 0 and focused Tier 1 checks. Web-17 runs the child Tier 2 local stack and actual-browser campaign. Tier 3 remains reserved for the parent milestone or release. CI test results are never acceptance evidence.

## Frozen data decisions

1. `criteria` is the canonical criterion relation. Existing `policy_criteria` rows migrate into `criteria` as `published`, with payer, policy, section, content hash, and policy effective range. New writes to `policy_criteria` are refused after migration; a read-only compatibility view preserves legacy readers until they migrate.
2. Every generated external letter assertion requires a source document, page, and effective/service date. An annotation or criterion may guide wording or add attribution only when the claim also points to its backing document/page/date. Annotation-only, verbal-only, derived-only, peer-only, or otherwise documentless assertions are excluded with the required copy.
3. The letter purposes are `prior_authorization_request`, `corrected_resubmission`, and `clinical_appeal`. Response letters link to the challenged determination and original request.
4. A local submission acknowledgement records that the signed request was delivered to a synthetic/manual channel. It makes denial intake eligible without claiming real payer transport.
5. Before any relation joins a replica, its lane, privacy class, exact columns, tenant predicate, authority/revocation behavior, and migration/rollback behavior are recorded and checked. Unknown remains local and is structurally refused.

## Ordered changes

### web-00-workflow-contract — Freeze lifecycle, citation, criteria, privacy, and command contracts

- Scope: OpenSpec/ADR/schema design only; no application behavior.
- Depends on: NONE.
- Complexity: M / High / frontier.
- Recommended agent: Codex.

Record the canonical criteria migration, case/letter/submission/determination lifecycle, browser HTTP command matrix, relation lane/privacy/publication matrix, deterministic fixture inputs, error-to-UI mapping, role/action matrix, and invalidation dependency keys consumed by later changes.

Acceptance: all eighteen changes have locally testable prerequisites and expected outputs; document/page/date citation is mandatory for every generated assertion; no implementation-time architecture decision remains in the listed contracts.

### web-01-case-command-core — Persist verified case creation and management commands

- Scope: additive migration/functions, case aggregate, `AppServices`, PostgreSQL adapter, and typed browser HTTP routes.
- Depends on: web-00.
- Complexity: M / High / frontier.

Add idempotent create, detail, update, and valid status-transition operations under verified actor/practice context. Stable command IDs reconcile lost responses and reject payload conflicts.

Acceptance: focused service/Postgres/HTTP checks prove one durable case, permitted transitions, equivalent refusal semantics, and independent denial of anonymous, forged, foreign-practice, and invalid-transition requests. No replica or UI claim is made.

### web-02-case-publication-ui — Publish case summaries and replace queue/intake placeholders

- Scope: replica grant/registry, PGlite schema/materializer, PEM selectors, scoped Zustand interaction state, queue/detail/intake React views.
- Depends on: web-01.
- Complexity: M / High / frontier.

Publish only the contract-approved case summary and lifecycle columns, then mount responsive queue, create, detail, edit, and status views.

Acceptance: lane/privacy/column/tenant/revocation checks pass before publication; create/update appears without reload; reload preserves committed state; desktop-to-mobile resize preserves route and case selection; two views do not share transient filters; foreign-practice summaries never materialize.

### web-03-administering-entity-resolution — Resolve the controlling UM entity and paths

- Scope: plan/delegation schema and fixture, resolver port/service/adapter, browser command/read route, case blocking state and focused React panel.
- Depends on: web-02.
- Complexity: M / High / frontier.

Resolve member, plan, procedure, date, and delegation rules into entity, criteria-set identity, submission channel, appeal path, source/version, and validity interval. Unknown or ambiguous results park the case.

Acceptance: the deterministic fixture resolves the exact expected entity and paths; missing/ambiguous/expired inputs produce named blocking states; controlling-input changes emit the frozen invalidation key; mounted HTTP refusals and tenant isolation pass.

### web-04-document-upload-core — Stage and commit bounded case documents

- Scope: document/process migration, writable document store, ingestion service, and multipart browser HTTP command.
- Depends on: web-01.
- Complexity: M / High / frontier.

Accept synthetic supported documents with category, effective date, SHA-256, media type, byte/page limits, case scope, and idempotent command identity. Commit metadata and bytes atomically or remove failed staging.

Acceptance: one durable document survives restart; duplicate retry reconciles; conflict, oversize, unsupported, tampered, anonymous, and wrong-tenant inputs map to the exact frozen errors; no PHI enters logs; mounted HTTP refusal contracts match.

### web-05-document-processing-ui — Extract page provenance and show processing state

- Scope: extractor/processor port and adapter, queued/processing/ready/failed transitions, page/chunk provenance, approved projection, intake upload/status UI.
- Depends on: web-04.
- Complexity: M / High / frontier.

Process uploaded synthetic files into page-addressable text through a replaceable port and publish only approved document metadata/status. Source text and embeddings remain local.

Acceptance: deterministic fixtures produce expected page counts/text hashes and explicit state transitions; retry yields one committed result; lane/privacy/column/tenant/revocation checks precede publication; browser upload shows frozen status/error copy and survives reload.

### web-06-criteria-catalog-core — Migrate and load provenance-aware criteria

- Scope: canonical criteria migration/compatibility view, policy-document ingestion reuse, production `CriteriaRepository`, and browser HTTP catalog commands/reads.
- Depends on: web-03 and web-05.
- Complexity: M / High / frontier.

Migrate legacy published criteria and load official/obtained synthetic policy documents into the canonical relation with immutable text/hash, grade, effective range, procedure/plan scope, and complete provenance.

Acceptance: migration preserves stable lineage and refuses new legacy writes; published and obtained rows satisfy their source rules; verbal/derived/peer rows cannot be promoted; overlapping versions and conflicting retry are refused; mounted HTTP refusal contracts match.

### web-07-criteria-selection-ui — Bind the effective snapshot and mount policy/pathway views

- Scope: case criteria-selection command, invalidation token, approved projection, PEM/Zustand hooks, policy and pathway React views.
- Depends on: web-06.
- Complexity: M / High / frontier.

Select one immutable criteria snapshot only from the resolved administering entity, plan, procedure, and planned date. Show source, version, effective range, provenance, pathway comparison, and the blocking reason when unresolved.

Acceptance: deterministic inputs select the expected version; unknown/unverified criteria block progress; controlling-input or catalog-version change emits a new selection token; lane/privacy/column/tenant/revocation checks precede publication; selection survives reload and adapts across widths; mounted HTTP command refusals match.

### web-08-evidence-assembly-core — Create sourced met/gap/void evidence atomically

- Scope: assembly service/ports, least-privilege SQL commands, case evidence/citation writes, surgeon gap-argument and coordinator void-work commands, invalidation consumption, and browser HTTP commands.
- Depends on: web-05 and web-07.
- Complexity: M / High / frontier.

Compare the selected snapshot to processed documents and commit one evidence revision. `met` and `gap` reference actual chart evidence; `void` represents silence and carries no fabricated source. Persist source-backed surgeon arguments for mandatory gaps and coordinator request/completion records for mandatory voids. An annotation stays distinct from chart evidence.

Acceptance: frozen fixtures yield the exact expected state/action matrix; factual support records document/page/date/quote/hash; void has no citation; mandatory gap/void work has exact capability, command, lookup and revision contracts; stale document/criteria/work tokens refuse assembly; rerun is idempotent; tenant and mounted HTTP refusal checks pass.

### web-09-evidence-workspace — Join evidence, policy, pathway, and timeline views

- Scope: projection registry/materializer/PEM, counts/crosswalk selectors, existing timeline plus intake/policy/pathway UI.
- Depends on: web-08.
- Complexity: M / High / frontier.

Publish an atomic evidence revision so queue counts, criteria crosswalk, pathway comparison, and timeline render the same records without a query cache.

Acceptance: lane/privacy/column/tenant/revocation checks precede publication; all three labels and their exact frozen coordinator/surgeon actions render; no mixed revision appears during refresh; source preview opens the cited page; responsive resize and account/practice change preserve or fence the correct state.

### web-10-prior-letter-command — Generate a cited prior-authorization draft

- Scope: letter-purpose/citation migration, deterministic composer port/service, claim and QA persistence, and browser HTTP generation/read/regeneration commands.
- Depends on: web-09.
- Complexity: M / High / frontier.

Generate a revisioned request only from the current affirmed policy/section/pathway/plan and evidence revision. Every included assertion carries document/page/date; annotation and criterion text without a backing document is excluded.

Acceptance: frozen fixtures produce stable ordered prose and claims; the exact unsupported-assertion copy is returned; stale gate/evidence, unresolved criteria, missing page/date, agent/admin principal, retry conflict, and foreign practice are refused; each enforcement boundary and mounted HTTP contract pass focused checks.

### web-11-prior-letter-workspace — Review, regenerate, QA, approve, sign, and acknowledge submission

- Scope: letter/QA approved projection, composer workspace, correction/regeneration UI, existing signing, and a local submission acknowledgement command through browser HTTP.
- Depends on: web-10.
- Complexity: M / High / frontier.

Mount the generated letter and citation crosswalk, route corrections through whole-letter regeneration, require blocking QA to pass, then use existing approval/signing controls. Record a manual/synthetic submission acknowledgement with channel, timestamp, manifest hash, and actor.

Acceptance: lane/privacy/column/tenant/revocation checks precede publication; current revision can be reviewed and signed only by an authorized surgeon; stale revision and incomplete QA refuse; acknowledgement requires a signed current letter and creates one durable submission eligible for denial intake; mounted HTTP refusals match; no real payer transport is claimed.

### web-12-determination-ingest-core — Persist the payer determination and source

- Scope: determination/source migration, upload/manual-entry command, parser port, repository, and browser HTTP routes.
- Depends on: web-11.
- Complexity: M / High / frontier.

Attach a synthetic determination to the acknowledged submission and original request, preserving outcome, reason, date, reviewer/reference, deadline fields, and source document/page hashes.

Acceptance: one determination links to the exact submission/request; a case without acknowledgement is ineligible; low-quality parsing retains unknown fields rather than guessing; correction records reviewer input without rewriting source; retry, tenant, and mounted HTTP refusal checks pass.

### web-13-denial-classification-ui — Confirm corrected-resubmission or appeal path

- Scope: deterministic classifier port/rules, confirmation command/wrappers, approved determination projection, responsive denial review UI.
- Depends on: web-12.
- Complexity: M / High / frontier.

Propose `administrative_corrected_resubmission` or `clinical_appeal` from frozen inputs and confidence rules. The frozen threshold and conflicting signals yield `needs_review`; generation remains blocked until an authorized human confirms or corrects the class.

Acceptance: fixture inputs produce exact expected class/confidence/error mapping; low confidence never auto-confirms; lane/privacy/column/tenant/revocation checks precede publication; human confirmation is audited, idempotent, tenant-scoped, and enforced through the mounted HTTP contract.

### web-14-response-letter-command — Generate cited corrected-resubmission and appeal drafts

- Scope: response-purpose/determination linkage migration, deterministic response composer, claim/QA persistence, and browser HTTP generation/read/regeneration commands.
- Depends on: web-10 and web-13.
- Complexity: M / High / frontier.

Generate the confirmed response type. Corrected resubmission addresses the administrative defect. Clinical appeal re-enters the current four-part clinical gate and answers the cited denial rationale using the current criteria/evidence crosswalk. Every assertion requires document/page/date.

Acceptance: two immutable fixture cases generate their distinct expected purposes; each links challenged determination and original request; missing source/page/date, unconfirmed class, stale gate/evidence/resolution, wrong principal, retry conflict, and foreign practice are refused; the mounted HTTP contract and each authority layer pass focused checks.

### web-15-response-letter-workspace — Review, QA, approve, and sign both response types

- Scope: response projection, denial-response workspace, correction/regeneration, QA, existing signing integration.
- Depends on: web-14.
- Complexity: M / High / frontier.

Mount each response with denial source, deadline, criteria/evidence crosswalk, citations, revision status, and role-appropriate controls.

Acceptance: lane/privacy/column/tenant/revocation checks precede publication; separate immutable corrected-resubmission and appeal cases complete review/QA/signing; appeal requires fresh affirmation; stale revisions, missing citations, and account/practice changes refuse or fence the action; responsive resize preserves scoped state.

### web-16-web-flow-fixture — Assemble deterministic local scenario data and runner

- Scope: synthetic fixtures, local stack orchestration, browser runner, expected-output manifest; no broad execution yet.
- Depends on: web-01 through web-15.
- Complexity: M / High / frontier.

Create the exact synthetic documents, policy criteria, delegation rules, initial request case, corrected-resubmission denial case, and clinical-appeal denial case plus expected IDs/hashes/text/states. Build a runner that uses the real local services and actual browser and fails when a prerequisite is skipped.

Acceptance: fixture manifests contain no real PHI; separate denial cases cannot mutate each other; commands and expected UI outputs are deterministic; the runner proves it targets current source/local services but does not yet claim the broad scenario passed.

### web-17-browser-scenario-certification — Run child Tier 2 and certify the web workflow

- Scope: frozen current-source candidate, local full stack, actual browser at wide/mobile widths, negative controls, review and documentation reconciliation.
- Depends on: web-16.
- Complexity: L / High / frontier.

Run login → case create/manage → entity resolution → document upload/process → criteria selection → met/gap/void evidence → gate → request generate/review/sign → submission acknowledgement, then exercise the corrected-resubmission and clinical-appeal cases through denial ingest/classification and response generate/review/sign. Include resize continuity, reload/restart, logout/account switch, the exact `foreign-practice-case`, `missing-citation-claim`, `unrelated-page-claim`, and `low-confidence-denial` controls, plus stale-revision coverage.

Acceptance: child Tier 2 commands and the actual-browser campaign pass against one unchanged candidate; negative controls fail effectively; results use exactly Passed, Build-only, Blocked, or Failed; only Passed closes the child. No CI, Tauri runtime, mobile, or device result is substituted.

## Execution order

Execute web-00 through web-17 serially. The order is dependency-bearing and several changes share migrations, `AppServices`, projection registries, and route composition. Parallel work is limited to independent read-only exploration or explicitly disjoint files within the active change.

## Explicitly deferred

- RA19 native SQLite parity and RA21 native updates, including all typed Tauri wrappers deferred by plan revision 10.
- Tauri window/runtime, Flutter/mobile, and physical-device certification.
- External model inference or PHI egress.
- Real payer transport and production deployment.

## Commands

/opsx:new web-00-workflow-contract
/opsx:new web-01-case-command-core
/opsx:new web-02-case-publication-ui
/opsx:new web-03-administering-entity-resolution
/opsx:new web-04-document-upload-core
/opsx:new web-05-document-processing-ui
/opsx:new web-06-criteria-catalog-core
/opsx:new web-07-criteria-selection-ui
/opsx:new web-08-evidence-assembly-core
/opsx:new web-09-evidence-workspace
/opsx:new web-10-prior-letter-command
/opsx:new web-11-prior-letter-workspace
/opsx:new web-12-determination-ingest-core
/opsx:new web-13-denial-classification-ui
/opsx:new web-14-response-letter-command
/opsx:new web-15-response-letter-workspace
/opsx:new web-16-web-flow-fixture
/opsx:new web-17-browser-scenario-certification

PLAN COMPLETE
