<!-- prometheus-base:start v1 -->
# Agent Operating Rules

This region is the standing contract. It holds only invariants that must
survive compaction. Everything else lives in on-demand rules, skills, hooks,
and reference files. Where a hook enforces a rule stated here, the hook wins.

Managed by `prometheus-context-bootstrap`. Edits inside these markers are
overwritten on re-run. Write project prose outside them.

## Position and authority

- `.kbd-orchestrator/current-waypoint.json` is authoritative for position.
- `versions.toml` is authoritative for architecture decisions and dependency pins.
- READMEs go stale. Do not trust one over the two files above.
- Read the waypoint at session start. State the current phase before executing.

## Capability inversion

Agent kernels do not write. Mutating actions are gated in the trusted host
layer only, never in an agent kernel. Where the language allows it, this is
enforced at the dependency graph as a compile-time guarantee rather than a
runtime check. If a task appears to require a write from a kernel, stop and
surface the conflict instead of routing around it.

## Phase order

Task loop: Spec, Plan, Execute, Reflect.
Evolution loop: Compile, Evaluate, Optimize, Promote.

Running a phase out of order is a quality failure, not a shortcut. Name the
phase you are in. Do not execute before a plan exists.

## Verification boundaries

Finish a coherent implementation set before testing it. During implementation,
use static inspection and reasoning; use a narrow compiler check only when it is
required to unblock progress. Finish every planned production change in the phase,
then run one integration gate through the real production path and collaborators at
the final phase boundary. When the harness provides an agent team, keep reviewer,
auditor, verifier, and integration-checker roles dormant until that boundary. Unit,
mock-only, filtered-function, and per-edit tests are not completion evidence.
Per-stack commands live in `.claude/rules/`, loaded only when a matching file is read.

- `.claude/rules/rust.md` — rust tiers and hard rules
- `.claude/rules/typescript.md` — typescript tiers and hard rules
- `.claude/rules/flutter.md` — flutter tiers and hard rules

## Evidentiary standard

Address observed problems. An observed problem comes from an operator report, a
visible error or log, a failing test, or an explicit requirement. A concern that
is none of those gets one sentence and a question, never speculative code.

Defensive code — validation, guards, fallbacks, retries, timeouts — requires a
named failure scenario. Hardening at a real trust boundary present in the code
is a standing exception and is named in the completion summary, never added
silently.

## Evidence over assertion

Show the command and its output, the test result, or the artifact. "Looks done"
is not done. Report what was actually run and at which boundary. If a check could
not run, say which claims are therefore unverified. An unverified claim reported
as verified is worse than no check at all.

## Anti-sycophancy

Critics never see generation history. Review through the `artifact-critic`
subagent, which receives the artifact alone. The model that produced the work is
not the sole judge of whether it is good.

A reflection leads with the delta between plan and delivery, not with what
worked. The sycophancy gate may block a turn; fix the finding rather than
bypassing it.

## Learning and memory

Learning is append-only under `.prometheus/`: `session-log.md`, `decisions.md`,
`gotchas.md`, `postmortems/`, `knowledge/`. Never rewrite history; append, and
mark superseded entries rather than deleting them.

Write on a decision with a rationale, a defect and its root cause, a learned
constraint, a phase boundary, and a session summary. Read `gotchas.md` before
touching a subsystem.

Where a memory server is configured, it is the primary store and its write path
may time out. On failure, log to the markdown files above and continue. Never
block a task on the memory server.

## Architecture

- Single-writer build discipline within one build or target directory.
- Feature-based organization by capability, not by technical layer.
- Strict layering: UI, then hooks or view models, then stores, then services,
  then external. Reverse flow only through reactive state or events.
- Business state lives in explicit, inspectable systems, never in UI components
  or agent-only memory.
- Open standards first. Avoid lock-in unless explicitly required.
- Verify dependency versions against official sources before introducing them.
  Do not rely on training-era version knowledge.

## Scope

Minimum change that solves the problem. Do not refactor adjacent working code;
treat its current state as intentional. Mention unrelated issues, do not fix
them unasked. Before destructive or hard-to-reverse actions, confirm intent and
prefer a reversible path.

## Skills may be absent

Harnesses drop skill descriptions past a context budget, so a skill you expect
may not be listed. If one is missing, invoke it by name or say plainly that it
is unavailable and proceed from these rules. Never invent what an absent skill
would have done.

## Communication

Direct and execution-first. Structure claims as statement, mechanism, stakes.
Short declarative sentences. No marketing language.

Avoid: leverage as a verb, utilize, synergy, roadmap as a verb, journey,
harness as a verb, delve, revolutionary.

Every significant document names the uncomfortable thing — the scenario that
hurts the author's own position.

## Done

A task is done when its stated integration exit criteria pass at the applicable boundary, not when
the output looks plausible. Before declaring completion: remove anything added
that was not requested, confirm each guard traces to an observed problem or a
real boundary, and summarize what changed, how it was verified, and what remains
at risk.

## Execution scaffold

This section exists because the fleet is mixed. Frontier models supply most of
it by default; smaller and older models do not, and the failure is silent —
plausible output with a fabricated call in it. Omit this section only when
every model that reads this file is known to supply the behavior on its own.

### Before executing

Restate the task in one sentence, and name the phase. If the restatement does
not match what was asked, stop and ask rather than proceeding on the closer
reading. Name the files you intend to touch before touching them.

### Do not fabricate

Never invent an API, a file path, a package name, a command flag, or a
configuration key. If you have not read it in this session or it is not pinned
in `versions.toml`, verify it before using it. "I could not confirm this
exists" is a correct answer. A plausible identifier that does not exist costs
more than the question would have.

Do not guess at a tool's parameters. Read its schema. A tool call with invented
arguments fails in a way that looks like the tool is broken.

### Verification is explicit

Run the check. Paste the command and its actual output. Do not report a result
you did not observe, and do not describe what a test "should" produce.

If a check cannot run, say which specific claims are therefore unverified, and
why. Skipping a check silently and summarizing as if it passed is the failure
this rule exists to prevent.

### Code output

Never elide code with `...`, `// rest unchanged`, or a similar placeholder in a
file you are writing. Emit the complete content of every file you write.

When editing, change the minimum span. Do not reformat, reorder imports, or
rename adjacent symbols while making an unrelated change.

Match the file's existing conventions over your own defaults.

### Complete coherent sets

Batch related implementation work until a meaningful production path is complete.
Do not interrupt every edit with a build or test. Keep unrelated changes separate,
then validate the completed set through the smallest real integration boundary.

Do not start an unrelated subsystem while the current implementation set is partial.

### Stop conditions

Stop and ask when: the requirement is ambiguous in a way that changes the
design, two readings of the task lead to different files, the change would
break an existing behavior, or you are about to do something hard to reverse.

Stop when the goal is met. Do not continue into adjacent improvements.

### Format contracts

When a specific output format is requested — JSON, a table, a diff, a schema —
emit exactly that format with no preamble, no trailing commentary, and no
markdown fence unless the fence was asked for. A parser is often reading it.

### Self-check before reporting completion

State each of these explicitly, not as a claim that you did them:

1. What changed, file by file.
2. What was run to verify it, and the observed output.
3. What was added that was not requested — remove it, or list it and ask.
4. Which guards trace to an observed failure, and which do not.
5. What remains unverified, and why.

<!-- profile: mixed — see references/MODEL-PROFILES.md before changing -->
<!-- prometheus-base:end -->

<!-- uiux-routing:start v1 -->
## UI/UX routing
UI, styles, tokens, motion or copy → `prometheus-ui-ux`. Read `.agents/UI_UX_PROTOCOL.md` or its bundled default; preserve design authority.
All code: detect `.agent-team/project-routing.json` and real team manifests. Preserve selection; adopt a sole team; ask if ambiguous. Use relevant roles, disclosing sequential fallback.
Backend work loads no UI guidance. Review respects user-only skills and the completed-phase boundary.
<!-- uiux-routing:end -->

# PatientGPT project contract

## Goal and scope

Fully implement the user interface and workflows in `docs/design` across web,
Tauri desktop, and Flutter mobile using the hybrid mobile architecture below.
PatientGPT is the chat-first prior authorization workspace for Advanced Spine &
Orthopedics. Patients own charts; each case is an authorization with scoped
conversations. Preserve the prototype's branding, layout, and interaction model.

This directory is the PatientGPT project root. KBD project configuration is
initialized in `.kbd-orchestrator/project.json`; no active phase is selected.
The preserved `spec` / `bootstrap` waypoint records the pre-phase position.
Do not inherit the parent project's task pointer as PatientGPT work. Read
`.prometheus/project-contract.md` before specification or implementation.

## Agent teams are the default

Use agent teams by default for substantive planning, implementation, and review.
At task start, discover `.agent-team/project-routing.json` and real team
manifests if present; use their selected roles, ownership, and model policy.
The selected team is `patientgpt-delivery`. Read `.agent-team/patientgpt-delivery/team.json`
and `TEAM.md`; use the product-manager and team-lead for scope and integration,
and uar-agent-expert for runtime agents, AG-UI and registered A2UI components.

Use available native subagents for independent work. Assign each worker explicit file ownership and acceptance criteria; tell
workers they share the codebase and must preserve other agents' edits. Parallelize
independent reads and disjoint work, serialize dependencies and shared builds,
and keep integration ownership with the root agent. Use isolated worktrees for
concurrent writing sessions where the writer hook requires them. At completion,
give an independent critic only the artifact and acceptance contract. If the
harness cannot delegate, disclose the limitation and proceed sequentially. Small,
indivisible tasks may stay with one agent; do not manufacture parallel work.

This policy applies equally through `AGENTS.md` and its `CLAUDE.md` symlink.
Use `agent-team-creator install-project` when deliberately updating team discovery.

## Design and architecture authority

- Read `docs/design/README.md`, `docs/design/patient-chat-storyboard.html`,
  `docs/design/patient-chat.html`, and the relevant files in
  `docs/design/patient-chat/`. They define the application and its use.
- Read `docs/design/data-model.md` and `docs/design/schema/patient-gpt.sql` as
  proposed integration contracts. Reuse the existing workbench's clinical
  records and authorized commands; do not create a second source of clinical
  truth. Reconcile proposed schema and replication choices before implementation.
- Use `/Users/gqadonis/Projects/hybrid-mobile-architecture-src/skills/hybrid-mobile-architecture/SKILL.md`
  and its `references/arch-standard.md` for architecture. Read platform references
  before working on that platform. Use this requested source checkout rather than
  silently substituting an installed copy. If unavailable, report that dependency.
- Use React for web/Tauri, Flutter with Rust FFI for mobile, a shell-independent
  Rust core, and Axum for the web service boundary. UAR owns agent execution and
  tool governance; A2UI/AG-UI and ContentBlock contracts connect runtime and UI.
- Use Assistant UI for React chat behavior, entity graph state for durable
  entities, Zustand for transient UI state, and Riverpod for Flutter presentation.
  No query cache, direct component networking, or competing application agent loop.
- Route UI work through `.agents/UI_UX_PROTOCOL.md`. Generic skill styling never
  replaces the prototype. Preserve Flat 2.0, both themes, the existing semantic
  status colors, typography, responsive navigation, and visible fill-based focus.
- Before introducing dependencies, verify official documentation with Context7
  and reconcile source-checkout pins with this project's `versions.toml`. The
  architecture source contains version drift; examples are not approved pins.

## Current library documentation

Use Context7 for any library, framework, SDK, API, CLI tool, or cloud-service
question, including syntax, configuration, migration, setup, and library-specific
debugging, even when the answer seems familiar. Start with `resolve-library-id`
unless the user supplies an exact `/org/project` ID. Select the relevant,
reputable match (version-specific when requested), then use `query-docs` for
one concept per call; retry discovery if the results do not match. Base the
answer on the fetched documentation and prefer it over web search for library
docs. This is not required for general concepts, business-logic debugging,
code review, refactoring, or scripts written from scratch. If Context7 is
unavailable, say so and use official documentation without claiming it ran.

## Clinical and delivery invariants

Preserve `met`, `gap`, and `void` as distinct states with labels and shapes.
Criteria change from filed documents, never from a surgeon's conversational
answer. Clinical controls belong to the trusted app host: the agent cannot affirm,
sign, submit, or record outcomes. Administrator and delegated-agent identities do
not inherit surgeon authority. Assertions require document, page, and date;
unsupported assertions are excluded explicitly. Keep fixtures and logs synthetic
and preserve the inherited PHI and tenant boundaries.

Trace implementation and local integration acceptance to all seven storyboard
cases and the navigation, search, Files, viewer, and conversation scope behaviors.
Test locally against real entrypoints and collaborators. Never dispatch, push,
or rerun CI to test; CI may build, lint, typecheck, format, and package only.
Record results as Passed, Build-only, Blocked, or Failed. Device, persistence,
protocol, and service claims require their own observed runtime evidence.

The uncomfortable thing: a faithful rendering of this scripted prototype can
still lack the durable state and trusted clinical controls needed to use it.
Bootstrap, screenshots, and successful compilation do not establish those.

## PatientGPT delivery overrides — operator instruction 2026-10-04

These direct requirements override generic skill defaults and the managed tier
ladder when they conflict: tests and independent review occur only at the end of
a complete implementation phase. Every two-hour increment gets a local web build
and human demo; every even increment gets full local web and Tauri builds. A
build/demo is not a test or completion claim. See `docs/plan/patientgpt-delivery-cadence.md`.

Use one shared React application for web and Tauri; TypeScript 7.0 filenames use
kebab-case. Browser storage is PGlite; desktop storage is embedded SurrealDB
3.3.0 behind shell-independent Rust ports; web Axum/Postgres integrates with Flint
Forge and Fabric. These are requested targets, not claims of working adapters.
Kratos supplies identity; Flint Gate supplies the Oathkeeper-like policy boundary.
All Flutter mobile workflows preserve the design source. UAR agent definitions,
AG-UI adapters and registered A2UI catalogs belong to the UAR expert; shell
renderers consume versioned contracts. Full catalog registration is required.

Use the existing Envoy Gateway in explicit kubectl context `know-me` for planned
Linode/Akamai delivery. Root monorepo GitHub Actions own builds/deploys and Pages,
never tests. Do not overwrite another monorepo documentation site. The repository
About link follows verification of the actual published documentation URL.

<!-- prometheus-team-routing:start v1 -->
For every code task, read `.agent-team/project-routing.json`, then its active team manifest and the relevant role instructions. Default to that team, selecting only roles whose responsibilities and ownership match the work. Preserve native permissions, models, concurrency limits and existing project instructions.
For UI work, load the role-bound `prometheus-ui-ux` or `prometheus-ui-review` skill. Prefer `.agents/UI_UX_PROTOCOL.md` when present; otherwise use the installed `prometheus-ui-ux/references/UI_UX_PROTOCOL.md`. Backend work must not load UI guidance.
Use native delegation when available. If unavailable, follow the selected role instructions sequentially and report that limitation. Review in the builder context is not independent review. Keep reviewers dormant until the complete implementation phase; allow one batched correction/confirmation cycle. Respect user-only skill invocation restrictions. Zed external ACP agents use their own native configuration; parallel UI threads are not an automatic delegation API.
<!-- prometheus-team-routing:end -->
