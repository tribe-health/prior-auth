# From ideation to running code: a repeatable method

**What this documents.** One unbroken session took a pasted product brief to a
verified, compiling, three-surface application — through a clickable prototype,
a database schema executed against a real server, public architecture
documentation, and a scaffolded codebase that builds and passes its own
boundary audit. This is the reconstruction of that path as a process someone
else can run.

The method is not "use AI to design, then use AI to code." It is a specific
sequence in which **each stage produces an artifact the next stage consumes as
a contract**, and every claim is verified by execution rather than assertion.

---

## The shape of it

```
 0  Frame          brief + brand source                    → locked direction
 1  Prototype      OpenDesign, one screen at a time        → clickable product
 2  Pressure-test  customer feedback loops                 → revised product
 3  Formalize      schema executed against a real database → contracts
 4  Adversarial    a DIFFERENT model attacks the design    → corrected contracts
 5  Research       parallel agents read the actual code    → verified stack facts
 6  Document       public pages for theory + tech + method → shared understanding
 7  Publish        IPFS, links verified live               → reviewable by anyone
 8  Scaffold       skill-governed code generation          → compiling system
 9  Enforce        an audit script that fails the build    → boundaries that hold
```

Stages 0–2 are OpenDesign's territory. Stages 8–9 are the skill packages'.
Stages 3–7 are the **seam**, and the seam is where most design-to-code handoffs
fail. This method's contribution is making that seam explicit and executable.

---

## Stage 0 · Frame the work

**Input:** a product brief in whatever form it arrives — in our case a pasted
11-section specification plus a `docs/` directory containing brand material.

**What actually happened:** the brand was not invented. Real hex values were
read out of an existing brand guide, and the four-step surface ramp, the type
pairing, and the borderless rule came from a source document rather than from
taste.

### The rules that mattered

- **Never guess a color.** If a brand source exists, extract measured values
  from it. If a source type was named but not supplied, stop and ask.
- **Lock the direction before the first screen.** Every subsequent screen
  inherits it; re-deciding at screen nine means rebuilding screens one to eight.
- **Name the domain semantics early.** Ours was *met / gap / void* — three
  clinical evidence states. That decision, made in stage 0, propagated into the
  database as a lookup table, into Rust as an enum, into TypeScript as a union,
  into Dart as a throwing parser, and into an audit check. A vocabulary chosen
  at stage 0 is cheap; discovered at stage 8 it is a migration.

### Reusable checklist

- [ ] Brand source located and values extracted, or explicitly absent
- [ ] Design direction stated in one sentence
- [ ] Domain vocabulary named, especially any distinction the industry
      routinely collapses
- [ ] Output format decided (multi-screen prototype vs single page vs deck)

---

## Stage 1 · Prototype in OpenDesign

**Input:** the locked direction. **Output:** a clickable multi-screen product.

**What actually happened:** eighteen screens, each its own HTML file, sharing
one `assets/aso.css` and one `assets/shell.js`. Not mockups — a working
application with persisted state, role switching, and a navigation shell that
adapts across three breakpoints.

### The decisions that made stages 8–9 possible

**One shared stylesheet and one shared shell, from screen one.** Every screen
imports the same CSS and the same JavaScript. This is what later let a single
`tokens.toml` regenerate both a Tailwind theme and a Dart theme — the prototype
had already proved the token set was complete and coherent.

**State in a real store, not in mock data.** `shell.js` carried a session, a
case state, an annotation store, and a capability model. When the schema was
written in stage 3, it was formalizing something that already worked rather
than inventing something new.

**Generate structure, never paste it.** The workflow rail, the site map, and
the schema map were each generated from one declaration. A pasted list drifts;
a generated one cannot. Two later pages caught their own errors this way — a
self-check compared its rendered node count against the live database and would
have flagged a mismatch.

**Enforce the design rules mechanically where possible.** The borderless rule
and the token-only rule were checked by grep, not by eye. Raw hex appearing in
a screen was a defect found by a script.

### Reusable checklist

- [ ] Shared stylesheet + shared shell established before the second screen
- [ ] Every screen is a real file, reachable, with no placeholder routes
- [ ] Repeated structure is generated from one declaration
- [ ] A grep-level check exists for the design system's hardest rule
- [ ] State model is real enough to formalize later

---

## Stage 2 · Pressure-test with the customer

**Input:** the prototype. **Output:** a prototype that survived contact.

**What actually happened:** the customer asked two questions that changed the
architecture — *can I click a summary tile and be taken to the evidence behind
it?* and *can I tell the AI a clinical point and choose whether it enters the
letter?*

The second question created the **annotation** concept: a mechanism by which a
claim enters a document without a chart record behind it. That is the single
most consequential entity in the final schema, and it came from a customer
sentence, not from a design session.

### The rule

**Treat a feature request as a question about the domain model.** "Can I click
through to the evidence" is not a UI request; it is the customer telling you the
summary and the detail must share an identity. "Can I tell the AI something"
means there is a class of claim your model does not have.

Two PDF addenda arrived in the same round and were read for the same reason:
they described *submission receipt verification* and *reviewer accountability*,
which became two whole screens and six tables.

### Reusable checklist

- [ ] Every feedback item classified: cosmetic, behavioral, or **model-changing**
- [ ] Model-changing feedback traced to the entity it creates or splits
- [ ] Attached documents read for entities, not just requirements

---

## Stage 3 · Formalize into executable contracts

**Input:** the pressure-tested prototype. **Output:** a schema that runs.

**This is the pivot from design to engineering, and the discipline is simple:
nothing is a contract until it executes.**

**What actually happened:** a 60-table PostgreSQL schema was written and then
*applied to a real database*. The first draft did not run — it expressed
payload validation as a `CHECK` constraint containing a subquery, which
PostgreSQL rejects outright. Two further defects surfaced only because the
schema was executed: a missing `updated_at` trigger, and a table with a type
column and no validation at all.

**None of those would have been found by review.** They were found by running
it.

### The parts worth copying

**Behavioral checks, not existence checks.** A companion `schema-checks.sql`
does not assert that tables exist — the schema application already proved that.
It asserts that the safety rules *refuse the wrong actor*:

```
T1  administrator affirms the gate      → expect ERROR
T4  administrator annotates             → expect ERROR
T9  letter signed before the gate       → expect ERROR
```

**Rules live where they cannot be bypassed.** Where a business rule mattered, it
became a database trigger rather than application code, because a service role
can bypass row-level security but not a trigger.

**Metadata-driven typing where types genuinely differ.** A `*_types` parent
holding a JSON Schema, a child validated against it on write. Applied nine
times — and deliberately withheld where a table had one fixed shape, because
burying a `NOT NULL` inside JSON trades an enforced constraint for an
unenforced one.

### Reusable checklist

- [ ] Schema executed against the real target version, not reviewed
- [ ] A behavioral check suite that expects specific refusals
- [ ] Every safety rule placed at the layer that cannot be routed around
- [ ] Typed-metadata applied only where payloads genuinely differ

---

## Stage 4 · Adversarial review by a different model

**Input:** a design decision. **Output:** the decision, corrected.

**What actually happened:** the criteria-provenance design was sent to a
different model (`k3` via a gateway) with a mandate to find problems and no
access to the conversation that produced it. It returned **BLOCK, confidence
82, four critical findings.** All four were real.

### Why this is not optional

The producer cannot certify its own work. A model reviewing its own design
inherits its own blind spots, and a same-family reviewer inherits most of them.
The isolation is structural: a fresh context, a different model, a packet
containing only the decision and its constraints.

### What the review actually caught

| Finding | The hole |
|---|---|
| The antitrust block was not structural | A regex over free text is trivially evaded — "1.8x Medicare" passes |
| Cross-tenant linkage leaked patient data | Sharing derived rules meant sharing the cases behind them |
| Nothing bound generated text to its sources | The model could paraphrase a rule with no citation at all |
| Decoupling stripped effective dating | A two-year-old rule would rank equal to current policy |

Checking one of its claims surfaced something worse than the claim: a
constraint in the existing code offered only two source slots, so a
criterion-backed claim had **no legal slot** and could only enter a document
disguised as one of the other two. The laundering path was already in the code.

### The packet format that made it work

- The decision, stated plainly
- The assumptions it rests on
- **A falsifier** — what would make this wrong. A decision that states no
  falsifier cannot be wrong about anything, which is itself the defect
- The constraints it must not violate

### Reusable checklist

- [ ] Judge model verifiably different from the producer
- [ ] Judge receives the packet only — never the conversation
- [ ] Packet includes an explicit falsifier
- [ ] Every finding either fixed or explicitly rejected with a reason
- [ ] Fixes verified by execution, not by claiming them

---

## Stage 5 · Research the stack with parallel agents

**Input:** a list of components the system will run on.
**Output:** verified facts, each marked implemented or planned.

**What actually happened:** seven codebases, 800k+ files. Four sub-agents ran
in parallel, each with its own context budget, each instructed to cite file
paths and to mark claims `IMPLEMENTED` or `PLANNED`.

**They overturned two premises I was about to publish as fact.**

### The corrections

- A SQL function that *appeared* to embed text inside the database was an HTTP
  client. The summary saying "retrieval runs beside the data — it never leaves
  the box" described intent, not behavior. For protected health information
  that distinction is the difference between a design and a breach.
- A runtime credited with decentralized identity had none; its own
  specification said it had "zero hard dependencies on any partner project."

### The rules

- **Scope agents to docs and manifests first.** An agent told to read a 330k-file
  tree will exhaust its context before it finishes. Read the README, the
  architecture doc, and the manifests; open source only to confirm a claim.
- **Demand file paths.** A claim without a path is a recollection.
- **Demand the implemented/planned distinction explicitly.** It is the single
  most valuable output, and agents will not volunteer it.
- **Run them in parallel, in one message.** Seven sequential agents is seven
  times the wall clock for the same result.

A first round of agents was lost to a session restart. Their transcripts held
only tool output — no salvageable briefs — so they were relaunched with tighter
scopes. **Record findings to disk as soon as they arrive**, not at the end.

### Reusable checklist

- [ ] One agent per coherent area, dispatched in parallel
- [ ] Each scoped to documentation first, source second
- [ ] Every claim carries a file path
- [ ] Every capability marked implemented / planned / absent
- [ ] Findings written to disk immediately on arrival

---

## Stage 6 · Document for humans

**Input:** everything above. **Output:** pages a stakeholder can read.

Three pages, deliberately separated by audience:

| Page | Answers | For |
|---|---|---|
| **How this works** | Why the product is shaped this way | Clinicians, customers |
| **Technology** | What the stack actually is | Engineers, reviewers |
| **Build playbook** | How it gets built | The team doing it |

### The rule that gives these pages their value

**State the gap.** The Technology page contains a highlighted correction saying
a component does not do what its own summary claims, and a table marking six
capabilities as shipped, planned, or unbuilt. An architecture document that
presents a roadmap as shipped is worse than one that admits the boundary,
because the first will be believed.

Shared documentation styles were promoted into the common stylesheet the moment
a *second* page needed them — a copy in each page is how two of them drift.

### Reusable checklist

- [ ] One page per audience, not one page for everyone
- [ ] Shipped / planned / absent marked wherever the distinction exists
- [ ] Corrections stated prominently, not footnoted
- [ ] Shared styles promoted on second use

---

## Stage 7 · Publish for review

**Input:** the documented prototype. **Output:** a URL anyone can open.

Bundle, upload to IPFS, **verify every link resolves against the live gateway.**

### The failure this catches

An earlier upload shipped a sign-in loop: the dashboard had been renamed in the
bundle, and `login.html` built its redirect in JavaScript, which a string
replacement missed. It was caught by a link check before publishing, and the
same class of bug appeared again in the next upload — caught again the same way.

**A bundle is a different artifact than a working directory.** Path rewrites,
renamed entry points, and JavaScript-constructed URLs all break at the seam.

### Reusable checklist

- [ ] Every internal link resolved against the bundle before upload
- [ ] JavaScript-constructed URLs checked separately from `href` attributes
- [ ] Every published URL fetched live and status-checked after upload

---

## Stage 8 · Scaffold with the skill packages

**Input:** the prototype, the schema, the research.
**Output:** a compiling three-surface system.

**What actually happened:** the entire design system was copied into the target
repository's `docs/` directory first, so development reads from a source of
truth that lives beside the code. Then the skill contracts governed generation.

### The seam that makes this work

**One token file generates every theme.** `tokens.toml` carries the measured
brand values and produces both `web/src/theme.css` and
`mobile/lib/core/theme/tokens.dart`, each with a DO-NOT-EDIT banner.

This is generated rather than hand-mirrored for a documented reason: two
hand-mirrored theme files in a previous project **had already drifted** — two
different values for the same background role, with nothing in the build to
notice. Two palettes that agree on intent and disagree on values are worse than
one ugly palette, because every screenshot comparison becomes unreliable.

Verified: 22 roles × 2 themes, identical values across surfaces, regeneration
idempotent.

### The architectural rule that earns its keep

**The shared core names no shell.** The `aso-host` crate has no Axum, no Tauri,
no Flutter dependency. That single constraint is what lets one core serve three
surfaces — the moment the core knows which shell it is inside, it stops being
shared. It is checked by the audit, not by intention.

### The ordering that is not negotiable

Phases 1 and 2 — data lanes with privacy classes, and the identity boundary —
are **irreversible**. Retrofitting either means rewriting the schema and the
gateway. Everything from the design system onward is comparatively cheap to
redo. Getting this backwards is the most expensive mistake available.

### What went wrong, and what it teaches

**Dependency versions were invented rather than looked up.** A pinned
`riverpod_lint: 3.3.2` had never been published. `flutter pub get` caught it; a
caret range would have resolved to something arbitrary and hidden the mistake
entirely — which is the argument for exact pins in one sentence.

**A genuine dependency conflict had no solution.** Three packages capped a
shared analyzer dependency incompatibly. The resolution was to drop the optional
one and **write down why**, including the instruction to re-add both together
and never one alone. An undocumented omission gets re-added by the next person.

### Reusable checklist

- [ ] Design system copied into the target repo before any code
- [ ] One token source generating every surface's theme
- [ ] Shared core has zero shell dependencies, checked mechanically
- [ ] Irreversible phases sequenced first
- [ ] Every dependency version read from the registry, never assumed
- [ ] Every omission documented with its reason

---

## Stage 9 · Make the boundaries enforceable

**Input:** the scaffolded system. **Output:** an audit that fails the build.

A rule nobody checks stops being a rule. Six checks were written, each carrying
**why it exists** — because a rule whose reason is lost gets deleted the first
time it is inconvenient.

```
1. React filenames are kebab-case
2. No query cache dependency
3. Components make no direct network calls
4. The shared core names no shell framework
5. Generated files carry their DO-NOT-EDIT banner
6. Three evidence states survive on both surfaces
```

### The audit had three bugs of its own

Worth stating plainly, because it is the most transferable lesson here:

- It reported **PASS while a check failed** — `FAIL=1` set inside a pipeline
  subshell never escaped it
- A regex for `invoke(` also matched `onAffirm(`
- It flagged its own example component for the crime of *documenting the
  prohibition in a code comment*

All three were found by **negative testing**: planting a real violation and
confirming the audit caught it. An audit that has never failed is an audit that
has never been tested.

### Evidence of durability

Between the scaffold and this document, the web application grew from 9 source
files to 121 — new features, new components, a package install. **The audit
still passes.** The boundaries held under someone else's work, which is the only
real test of whether they were boundaries or just intentions.

### Reusable checklist

- [ ] Every architectural rule has a mechanical check
- [ ] Every check states why it exists
- [ ] Every check negative-tested with a planted violation
- [ ] Exit codes verified — a check that cannot fail is decoration

---

## The verification discipline, stated once

Every stage above shares one rule, and it is the thing that makes the method
work rather than merely sound organized.

> **"Working" is a runtime claim. Compiling is not evidence.**

Results are recorded in four words, and only one means finished:

| Word | Meaning |
|---|---|
| **Passed** | The production artifact launched and the workflow completed |
| **Build-only** | It compiled but was never launched. **Never call this working** |
| **Blocked** | An unavailable dependency prevented proof |
| **Failed** | It ran and produced incorrect behavior |

At the end of this session the honest record was: Rust workspace **passed**
(built, tested, server started, boundary enforced over live HTTP), Flutter
**passed** (analyzed clean, seven tests), and desktop and mobile devices
**build-only** — real, but not yet working. A generated project starts
unverified on purpose. That is not a gap to paper over; it is an accurate
statement until someone runs it on hardware.

---

## What to reuse, in order

1. **Extract the brand; never invent it.** Stop and ask if the source is missing.
2. **Name the domain distinction the industry collapses.** It will propagate
   through every layer, and it is cheap only at the start.
3. **Share the stylesheet and shell from screen one.** This is what makes a
   single token source possible later.
4. **Generate repeated structure; never paste it.**
5. **Treat feedback as questions about the model.**
6. **Execute the schema. Do not review it.**
7. **Write behavioral checks that expect refusals.**
8. **Have a different model attack the design, with a falsifier in the packet.**
9. **Research with parallel agents; demand file paths and shipped-vs-planned.**
10. **Write findings to disk the moment they arrive.**
11. **State the gaps in public documentation.**
12. **Verify every link against the bundle, not the working directory.**
13. **Copy the design system into the code repo before writing code.**
14. **Generate every theme from one token file.**
15. **Keep the shared core free of shell dependencies, and check it.**
16. **Sequence the irreversible decisions first.**
17. **Read every dependency version from the registry.**
18. **Document every omission with its reason.**
19. **Negative-test the audit.**
20. **Say build-only when it is build-only.**

---

## The one-line version

**Design until it is clickable, formalize until it executes, let a different
model attack it, verify the stack by reading it, publish the gaps along with the
wins, and generate code under contracts that a script refuses to let you break.**
