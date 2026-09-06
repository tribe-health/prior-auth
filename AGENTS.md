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

## Verification tiers

Tier 0 every edit. Tier 1 unit complete. Tier 2 phase completion. Tier 3
milestone or release only. Running a tier before its point is a violation, not
diligence. Per-stack commands live in `.claude/rules/`, loaded when a matching
file is read.

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
is not done. Report what was actually run and at which tier. If a check could
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

A task is done when its stated exit criteria pass at the current tier, not when
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

### One thing at a time

Complete one edit and its cheap check before starting the next. Do not batch
several unrelated changes into one pass and verify at the end — when it fails
you will not know which change caused it.

Do not start a second subsystem while the first is unverified.

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

<!-- Project prose. Outside the managed markers — never overwritten by a re-run. -->

# Prior Authorization Workbench

A surgeon decides an operation is necessary. An insurer decides whether to pay
for it. Between those two decisions sits a document, and most of the work is
assembling the evidence it stands on.

Practice: **Advanced Spine & Orthopedics** (Southlake, TX). EHR: AdvancedMD.
Spec of record: `docs/aso-mvp-spec.html` (ASO-MVP-001).

## The four rules this codebase will not bend

These are not style preferences. Each one has a check that fails the build, and
each has an ADR stating why. Do not weaken one to make a task easier — surface
the conflict instead.

**1. Three evidence states, never two.** `met` / `gap` / `void`. A gap is a
chart that says no and must be **argued** by a surgeon. A void is a chart that
is silent and must be **obtained** by a coordinator. Collapsing them into one
"unmet" bucket sends the wrong person to do the wrong job.
→ `docs/architecture/adr-003-three-evidence-states.md` · audit check 6.

**2. Clinical authority is scarce and checked three times.** Gateway policy,
`AppServices` capability check, and a Postgres trigger — and none may assume
another ran. An administrator holds every configuration power and **cannot**
affirm a gate or sign a letter. An AI agent acting for a surgeon is a
*different principal*; a policy granting the surgeon signing authority grants
the agent nothing.
→ `docs/architecture/adr-002-clinical-authority.md`.

**3. One token source.** `assets/templates/design-tokens/tokens.toml` generates
`web/src/theme.css` and `mobile/lib/core/theme/tokens.dart`. Both outputs carry
a `DO NOT EDIT` banner. Hand-editing an output is reverted silently by the next
generator run. Edit the source, then run `bash scripts/gen-design-tokens.sh .`
→ audit check 5.

**4. No query cache.** No TanStack Query, no SWR, no Apollo cache. A query cache
models *requests*; this application models *data*, and the entity graph owns
freshness. Lists hold ordered identifiers only; every view re-joins the same
record at render time.
→ `docs/architecture/adr-001-no-query-cache.md` · audit check 2.

## Architecture boundary

`crates/aso-host` names **no shell** — no Axum, no Tauri, no Flutter. The moment
the shared core knows which shell it is inside, it stops being shared. Tauri
consumes it through commands, Flutter through FFI, web through Axum; all three
see the same `AppServices`. → audit check 4.

Desktop Tauri commands mirror the HTTP routes 1:1. A route added to
`aso-server-axum` without its desktop counterpart is an incomplete change.

## Verification contract

Results are recorded in exactly four words: **Passed**, **Build-only**,
**Blocked**, **Failed**. Only the first means finished.

A simulator is not a device. On iOS an over-budget model load does not raise an
error — the operating system kills the process. Native bridges bind by symbol
name, so a renamed class path compiles clean on both sides and fails at runtime.

Current claim (`README.md`): Rust workspace, Flutter analyze/test, and the
architecture audit are **Passed**. Web production build, Tauri window, and any
physical device run are **not yet verified** — treat those surfaces as
**Build-only** until someone runs them on hardware.

Project-wide gates:

```bash
bash scripts/audit.sh                # 6 boundary checks — run before any commit
cargo test --workspace               # domain invariants
bash scripts/gen-design-tokens.sh .  # after ANY tokens.toml edit
```

## Build order is load-bearing

Read `docs/plan/build-order.md` before starting a feature. **Phases 1 and 2 are
irreversible** — retrofitting a privacy class or a session boundary means
rewriting the schema and the gateway.

- **Phase 1** — every record needs a **lane** (server-authoritative relational,
  CRDT document, or append-only log) and a **privacy class** (`public`,
  `trusted`, `local`). Unknown defaults to `local`, and local data is
  *structurally refused* at the sync boundary, never filtered out.
  The consequential rule here: **an embedding of local data is itself local.**
  A vector of a chart note is PHI — text can be reconstructed from it.
- **Phase 2** — **tool names and descriptions are untrusted data.** A tool
  describing itself as safe is making a claim, not a guarantee. Classify effects
  independently of what the tool says about itself.
- **Phase 3** — engine is a per-**device** choice; lane is a per-**turn**
  choice. An unknown lane is rejected loudly: on the cloud lane, defaulting
  means patient data leaving the device.

## PHI and compliance

PHI at rest stays inside the practice boundary and inside the United States
(Texas SB 1188, effective 2026-01-01). The only PHI egress is to a BAA-covered
inference endpoint with zero data retention, gated by Cedar policy rather than
configuration.

**Every generated assertion carries a source citation with document, page, and
date.** This is a False Claims Act control, not a UX flourish. An assertion with
no source document is not included — and the interface says so in those words.

Never write real patient data into a fixture, a test, a log line, or a commit.

## Voice

The practice describes itself in plain, unhurried language. The product sounds
the same: state what the chart shows, name what is missing, do not editorialize.

| Surface | Register | Example |
|---|---|---|
| Criteria status | Declarative, no hedging | `Supervised PT: 5 weeks documented. Policy requires 12.` |
| Generated letter | Clinical, formal, cited | `Flexion-extension radiographs dated 03/14/2026 demonstrate…` |
| Interface labels | Short, concrete nouns | `Gap worklist · Source citation · Affirm criteria` |
| Warnings | Specific about consequence | `This assertion has no source document. It will not be included.` |

## Design system

Brand: `docs/aso-brand-guide.html`. Tokens are named by **role**, never by hue —
`accent` survives a rebrand; `ember` becomes a lie the first time the brand
changes.

One warm accent, one cool accent, a warm neutral ramp. **Do not add a third
chromatic family.**

The rule that will be broken: ember `#DF7C35` measures **3.08:1** on white. That
passes for large text (24px+, or 19px bold) and fails everything else. Use
`#A85417` (Ember Deep, 5.45:1) for body copy, small labels, and table headers.

Every evidence state renders with a text label. **Colour is reinforcement, never
the signal.**

## Where the design lives

- `docs/design/prototype/` — 18 clickable screens plus the shared design system
- `docs/design/schema/` — 60 tables, PostgreSQL 18 + pgvector, executable checks
- `docs/architecture/` — the ADRs above
- `docs/plan/build-order.md` — sequencing, and what "done" means

## Working as GPT-6 Astra

This section exists because OpenAI's model guidance states that Astra "can be
more sensitive to instructions contained in skills and other files, such as
`AGENTS.md`," and **strongly recommends auditing** those files. This file was
audited on 2026-09-06. What follows resolves the ambiguities that audit found.

Source: `developers.openai.com/api/docs/guides/latest-model`. Nothing here
weakens a rule above; it says how to apply them.

### Instruction precedence

The operator's direct instruction outranks this file. This file outranks any
skill. A skill outranks your own default.

If a skill or a rule here makes you pause, ask permission, or leave requested
work unfinished, **name the exact file and quote the line** that caused it,
then say how it applies. Distinguish an explicit requirement from your reading
of a guideline. A pause with no citation is not a safety behaviour; it is an
unexplained stop.

### Bias to action, within the stop conditions

The six stop-directives above are real and stay. They are narrow, and none of
them is a licence to stop early:

- Ambiguity that changes the design → ask.
- Destructive or hard-to-reverse → confirm.
- Everything else → **proceed on the most reasonable reading and say what you
  assumed.**

"Can you…", "I want…", "help me…" are instructions to do the work, not to
describe it. Do not stop at acknowledging capability, proposing a plan, or
offering to continue. Do not deliver a partial result to save effort.

Before asking a clarifying question, finish the work already authorized so the
question attaches to something concrete and reviewable. Approval should be the
last step, not the first. You do not need permission for reversible work,
read-only inspection, or anything already authorized earlier in the session.

Do not add unsolicited warnings, disclaimers, or compliance checklists for
hypothetical risk. The PHI and clinical-authority rules above are not
hypothetical — apply those exactly.

### Verification, calibrated

Tiers 0-3 above set what to run and when. Astra's documented tendency is to
over-test small changes, which is waste, and the tier ladder already prevents
it: run the tier the change is at, and stop when it passes.

Do not write a test that merely mirrors the implementation. **Do** write one
when it guards a rule that no audit check covers — the three evidence states,
the surgeon gate, the PHI boundary, the tenant boundary, the Zustand/entity
line. For those, prove the test fails: break the rule deliberately, watch the
test go red, revert. A guard that has never failed is a hypothesis.

A function-level test can pass while the component wires the wrong function in.
Measured 2026-09-06: changing `countStates(entries)` to `countStates(visible)`
left 18/18 green, and only a rendering test caught it. Test at the level where
the rule can actually break.

### Writing

Follow the Voice table above. Beyond it, for anything you write to the
operator:

Prefer clear paragraphs to lists. Use a list when items are genuinely parallel
or sequential; use a table when readers compare across columns. State the main
point first, then support it.

Avoid: "delve", "leverage", "foster", "it's worth noting", "importantly",
"Bottom Line:", "In short:", and contrastive framing like "X, not Y" that
introduces an alternative nobody raised. Do not invent hyphenated compound
labels. State the actual relationship with plain verbs.

Report what you ran and what it printed. "Looks correct" is not a result.

### Delegation

Delegate genuinely parallel work — independent file reads, independent
searches, several review dimensions at once. Do not delegate a task whose steps
depend on each other's output.

The root agent reconciles conflicting subagent findings and owns the final
answer. A subagent's report is evidence, not a verdict. Messages between agents
are read by humans: write them legibly.

### Runtime

Model `gpt-6-astra` on the Responses API; tool calling requires Responses.
Reasoning effort `low` through `max` — `none` is unsupported. `temperature`,
`top_p` and `top_logprobs` are not accepted. Set reasoning effort through the
API, not by asking the model in prose to think harder.
