# PatientGPT delivery cadence

Status: proposed implementation plan, 2026-10-04. Current waypoint remains `spec` / `bootstrap`; this document does not start implementation, initialize KBD, publish documentation, deploy the application or start a scheduled automation. The [product brief](../product/team-product-brief.md) owns workflow acceptance. The [project contract](../../.prometheus/project-contract.md) and `docs/design` remain the application/design authority.

## Clock, phases and evidence

Work in 120-minute delivery increments once prerequisites and actual build/run commands are recorded. Every increment produces a local web build and a human demo of an integrated usable flow. Every even-numbered increment additionally produces full web and Tauri builds. Increment numbering is global and never resets at a phase boundary. Flutter work begins in increment 1 and joins the first shared workflow by increment 2; it is not postponed until web completion.

An increment is a delivery cut within a full phase. **Tests, integration verification and adversarial review run only at the end of the full phase, after every planned production change in that phase is complete.** They do not run at each two-hour cut unless that cut is also the completed phase boundary. Keep reviewer, auditor, verifier and integration-checker roles dormant during implementation. Regular builds and human demos provide progress evidence; they do not satisfy the final integration exit criteria.

This boundary supersedes the preliminary two-hour-as-phase suggestion in `.prometheus/team-research/uar.md`. Do not split a partial implementation into a nominally complete phase to start tests early. All testing is local against real production entrypoints and collaborators with synthetic data. CI may build, lint, typecheck, format and package; CI never tests, certifies acceptance or supplies evidence used to close a product gate.

Each interval is a target for a concrete demonstrable addition, not a promise that absent infrastructure is available or all work will finish in 24 hours. Extend a phase with additional numbered 120-minute increments when its required work is incomplete. Preserve every-even build obligations and keep the phase's remaining acceptance backlog visible.

## Activation prerequisites

The lead resolves these before activating the delivery clock:

1. Adopt the actual installed project team and assigned disjoint write roots. Product manager, team lead and dedicated UAR agent-building expert are required. Name one owner for shared contracts, generated bridges, build directories and repository-wide manifests.
2. Establish app manifests, pinned compatible dependencies, executable entrypoints and explicit local service prerequisites. At planning time, file discovery found `versions.toml` but no PatientGPT `package.json`, `Cargo.toml` or `pubspec.yaml`; do not invent build flags or claim existing launch commands.
3. Record the authoritative record ownership, sync lane and privacy class; reuse the ASO clinical record/command boundary. Reconcile browser PGlite limitations, requested desktop SurrealDB 3.3.0, Forge/Fabric roles and Flutter API-only proposal. Do not silently replace an operator-selected store with a generic template default.
4. Freeze session/principal, tenant/case, citation, command, run/event and component contracts. Settle the Kratos native credential/header seam and the distinct delegated-agent principal. Assign unresolved clinical-authority decisions to the PM and host owner before their dependent phase starts.
5. Identify actual UAR installed runtime/version, model connection and permitted synthetic inference path; determine required supported semantics and product-agent package/binding admission. A valid schema or registered package alone is insufficient.
6. Identify local web/Tauri/Flutter hosts and devices available for demos. If a human cannot attend, prepare the running flow and record demo pending; do not invent user approval or call a recording a completed human demo.

The command ledger must contain executable commands copied from the actual manifests/tool help, working directory, required environment names (no secret values), expected artifact location and startup/shutdown owner. Until the ledger is populated, cadence activation is **Blocked**. Avoid substitute guessed commands.

| Ledger entry | Required content | Initial state |
|---|---|---|
| Local dependencies | Real startup, readiness and stop instructions for host, persistence, identity and UAR collaborators. | Pending source/configuration discovery |
| Web | Actual production build, local run and usable demo URL. | Pending app manifest |
| Tauri | Actual complete desktop build, produced artifact and local launch. No component-only build qualifies. | Pending app manifest |
| Flutter | Actual generation/build/launch path and identified simulator/device; physical-device claim requires named hardware. | Pending app manifest |
| Full-phase integration | Actual local scenario runner/commands exercising real shell, host, storage, identity and UAR path. | Defined after executable path exists; run only at final full-phase boundary |
| Documentation | Actual site build and separate publication workflow/target URL discovery. | Pending site implementation |

## A 120-minute increment

| Time budget | Work | Accountable owner |
|---|---|---|
| 0–10 minutes | Select the increment's flow, confirm previous handoffs, freeze narrow interfaces and name the changed files/owners. | Lead + PM |
| 10–90 minutes | Complete the related production implementation across collaborators. Parallel work follows already agreed interfaces; static inspection and build-required compiler feedback are permitted. No test or review-team activation. | Assigned implementers |
| 90–105 minutes | Cut the coherent integrated revision. Build web locally; on every even increment build full web and Tauri. Capture revision, command, exit output and artifact. | Single build owner |
| 105–120 minutes | Human exercises the actual running flow; PM records observed behavior, persistence/surface limitations, defects and the next increment. | PM + lead + operator |

Build duration can exceed the budget. Start sufficiently early once the coherent set is ready or report a late cut; never shorten a full build into a partial check to meet the clock. If the complete phase ends at this increment, allocate an explicit completion window after implementation for local full integration and independent adversarial review. That window may extend the phase beyond 120 minutes; do not run the gate against a partial phase to preserve an artificial deadline.

## Full Phase A — durable scoped reading and early native parity

Outcome: a signed-in synthetic user can navigate the chart/case, run a real governed catch-up, inspect source-backed records and restore conversation scope across supported shells. This phase establishes record and session boundaries before later clinical writes.

| Increment | Usable vertical addition and human demo | Main ownership and exit handoff | Required build cut |
|---|---|---|---|
| 1 | Open a patient and case in the real web shell, ask catch-up through the actual UAR adapter, see the five-section report and open its source. Start Flutter shell/tokens/navigation and generated bridge consumption concurrently after contract freeze. Admitted primitives plus typed host ContentBlocks are allowed as a temporary first slice. | PM supplies PG-06/read-flow script; host supplies scoped records; UAR expert supplies admitted agent/events; React renders; Flutter consumes the same DTOs. If live prerequisites are absent, the increment is Blocked rather than replaced by scripted inference. | Local web build + human demo |
| 2 | Restore conversation/case after reload; open the same source and case in Tauri and Flutter. Demonstrate the distinct browser/native identity path with shared authorization semantics. | Storage owns persistence/cursor; identity owns session; bridge owner supplies desktop/native adapters. Record native device/simulator identity and any still-unverified hardware claim. | Full local web + Tauri builds + human demo; Flutter build/run for the touched flow |
| 3 | Global/patient/case history, context selection preserving the original request, and search-to-conversation/source navigation. | PM supplies scope expectations; host/search and UAR experts provide scoped retrieval; all shell owners adopt the contract without component networking. | Local web build + human demo |
| 4 | Complete closed-case Files/viewers for PG-06; patient Files grouping, case Files grouping, streaming interruption/recovery UI, light/dark and phone layout parity. Finish all Phase A production changes before verification. | Lead collects shell/host/storage/UAR handoffs and confirms no Phase A production items remain partial. | Full local web + Tauri builds + human demo; full-phase boundary follows |

Final Phase A gate: local real-path signed-in read/catch-up/source/reload/history flows, PG-06 records, cross-case/tenant denial, stream reconnect and duplicate handling, and equivalent scoped state on web/Tauri/Flutter. Artifact critic receives the completed artifacts and acceptance contract without generation history. Build-only native work remains a visible qualification gap; physical-device claims require real hardware. Failed findings return to implementation repair and keep Phase A open.

## Full Phase B — registered catalog and evidence-to-submission

Outcome: the full required PatientGPT component vocabulary is registered through UAR, and document-backed evidence plus trusted host controls complete Kaminski, Delgado and Vasquez flows.

| Increment | Usable vertical addition and human demo | Main ownership and exit handoff | Required build cut |
|---|---|---|---|
| 5 | Register the versioned PatientGPT catalog extension in the actual runtime; render a case report with CriteriaList, ConflictList, BlockerList, NextMove and source navigation using admitted component schemas across web and Flutter. Complete the remaining prototype vocabulary within this phase. | UAR expert owns catalog/schema/runtime admission and any separately authorized upstream change; shared-contract owner generates mirrors; shell owners register implementations. Generic primitives or host blocks alone cannot close the catalog goal. | Local web build + human demo |
| 6 | Kaminski question → attributed answer → scoped staff request → filed fax, and Vasquez MRI attachment → documented criterion update. A prior-care answer leaves the unsupported gap unchanged. | Host/evidence owner persists documents and provenance; agent expert requests permitted operations; shells present a single ordered workflow. | Full local web + Tauri builds + human demo; Flutter same-flow run |
| 7 | Delgado and Kaminski host-owned four-gate affirmation → cited draft → document review → authorized signature. Unsupported assertions are excluded explicitly. | PM confirms wording; host owner enforces actor authority at all three boundaries; UAR expert supplies evidence-backed draft generation with no agent clinical controls. | Local web build + human demo |
| 8 | Host submission → packet → persisted receipt in chat and Files; complete PG-01, PG-02 and PG-04, all required catalog components/actions, renderer parity and cancellation/denial behavior. Finish all Phase B production changes. | Lead reconciles registered vocabulary matrix, host command results, persistence and all shell flows. Coordinator submission remains unavailable unless explicitly authorized by resolved product policy. | Full local web + Tauri builds + human demo; full-phase boundary follows |

Final Phase B gate: run PG-01, PG-02 and PG-04 against actual host/UAR/storage entrypoints; prove the complete approved catalog reaches both renderer families; exercise malformed/unknown catalog payload, forbidden clinical action from agent/admin, source-less assertion exclusion, document-versus-answer distinction, duplicate command and interrupted action continuation. Keep human authority and agent identities distinct. Independent adversarial review begins only after the whole phase's production set is finished.

## Full Phase C — remaining workflows and delivery closure

Outcome: the seven-scenario acceptance inventory and navigation/parity requirements operate through the complete product path, with truthful deployment and documentation status.

| Increment | Usable vertical addition and human demo | Main ownership and exit handoff | Required build cut |
|---|---|---|---|
| 9 | Brennan cited peer-to-peer preparation → attributed therapy statement → generated brief → host-recorded call outcome. | UAR expert supplies cited preparation; host owns statements/outcome; PM owns PG-03 wording and source expectations; shells consume the same records. | Local web build + human demo |
| 10 | Raman payer status/receipt → attached determination → content-supported case outcome. Reuse and complete platform Files/viewer behavior. | Host/integration owner distinguishes actual status source from unavailable payer integration; no synthetic response is labeled a live payer result. | Full local web + Tauri builds + human demo; Flutter same-flow run |
| 11 | New case from existing patient → procedure → confirmed policy → reused chart; finish workflow gaps, accessibility and early-parity carryovers. Prepare documentation locally. | PM resolves policy matching before implementation; host owns case creation and chart references; design owners complete both themes and phone interactions. | Local web build + human demo |
| 12 | Present all seven workflows on the integrated product; complete pending production work and docs/packaging. If Pages publication is authorized and available, publish, verify the exact public URL/content/assets, then add the real About link; otherwise keep that deliverable open without a placeholder. | Lead and PM reconcile acceptance backlog; release/docs owner records publication/deployment state separately from local builds. | Full local web + Tauri builds + human demo; full-phase boundary follows |

Final Phase C gate: all seven product scenarios, nine navigation examples, attachments/search/viewers, durable restart behavior, clinical/tenant boundaries and supported-surface parity through real local collaborators. Run applicable full local integration once the complete production set is ready, then conduct independent artifact/security/UX review. Repair findings before rerunning the affected completed production path. Do not claim live EHR/payer integration, device qualification or deployment without its own observed evidence. Close application scope and any explicitly included appeal/revision work only when the resolved acceptance contract passes.

## Owner handoffs and late-cut repair

Every handoff identifies scenario/phase, owner, exact changed files and revision, interface/schema revision, actual command or event payload, expected durable record change, unresolved dependencies, build/demo evidence and remaining acceptance work. Contracts freeze before dependent parallel coding; breaking changes return to the contract owner and affected implementers together. An agent's claim is evidence to reconcile, not a lead acceptance verdict.

At a late cut, preserve the last usable artifact and report the exact failing command/output and affected flow. The owner completes the smallest coherent repair; do not start unrelated work, drop the failed requirement, reset increment numbering or relabel the demo as a test pass. If repaired production changes land after a cut, rerun the affected build; an even cut still requires full web and Tauri builds on the delivered revision. If a full-phase gate finds a defect, reviewers return to dormancy during the repair set and resume at the repaired complete-phase boundary. Keep external effects and already-written records explicit; no silent destructive reset.

Each cut receipt lists: increment and phase; integrated revision; web build command/output/artifact; even-cut full Tauri build command/output/artifact; Flutter progress/device evidence; demo time/attendee/actions/observed state; open defects; and next owner's task. Preserve the four verification outcomes: **Passed**, **Build-only**, **Blocked**, **Failed**, with the scope of the claim. Builds normally support Build-only for application acceptance; only the completed-phase integration gate can support Passed for its stated product scope.

## Existing infrastructure and publication

The existing Envoy deployment is in Kubernetes context `know-me`. Keep that context explicit for any authorized cluster operation. Kratos, Flint Gate, Forge and Fabric are separate collaborators; current research observes routes and ready resources but does not prove PatientGPT identity/tenant enforcement or a working Gate Envoy ext_authz adapter. Reconcile the actual deployed digest/configuration and ownership before authoring deployment changes. No new gateway or replacement identity stack is assumed.

PatientGPT lives under the parent prior-auth Git repository. A release/docs owner must establish executable repository-root workflows and correct path filters; a nested workflow file is not automatically active. Build/packaging workflows contain no tests. Deployments and Pages publication are separate from local cadence receipts and follow the operator's actual authorization. Add the application About link only after the published Pages URL is observed working with the intended content and assets; verify the link through the local completed application path at its phase boundary.

The uncomfortable thing: the schedule can produce regular builds while the full workflow remains unusable. The PM keeps acceptance backlog visible, and the lead extends an incomplete phase instead of treating a two-hour cutoff, a recording, or a build artifact as completion.
