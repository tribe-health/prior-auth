# Adversarial review fixtures

Four committed artifacts that prove the review gate **discriminates**, rather
than merely runs. A suite asserting only "a review completed" would have passed
throughout the period in which eight consecutive reviews were same-model
self-grades that all returned `PASS`.

| Fixture | Mode | Expected verdict |
|---|---|---|
| `flawed-skill` | `--mode skill` | `BLOCK` |
| `clean-skill` | `--mode skill` | `PASS` |
| `flawed-agent` | `--mode agent` | `BLOCK` |
| `clean-agent` | `--mode agent` | `PASS` |

## Design constraint: only quality varies

Each flawed/clean pair shares a **domain and an identical `.intent.md`**. The
skills both verify PostgreSQL restores; the agents are both read-only compliance
auditors. So a judge cannot pass the clean fixture by recognising a familiar
topic, or block the flawed one because the subject sounded risky — the only
variable is whether the artifact is any good.

## Planted defects

Every defect maps to a failure class named in the corresponding mandate
(`assets/reviewer-mandate-{skill,agent}.md`). A defect the mandate does not
describe would test the model's general taste, not this gate.

### `flawed-skill`

1. `description` promises five capabilities; the body documents roughly one.
2. "Handle the backup appropriately" — an intention, not an action.
3. "completes correctly and performantly" — success criteria that cannot be checked.
4. Invokes `scripts/verify-restore.sh`, which **does not exist**.
5. Ships `scripts/cleanup.sh`, which nothing invokes (dead payload) and whose
   stated purpose — deleting archives — contradicts a verification skill.
6. Links `references/credential-rotation.md`, which is missing.
7. No "when NOT to use", no edge cases, no failure modes.

### `flawed-agent`

1. `.intent.md` requires **read-only**; `system_prompt.md` writes remediation tickets.
2. The prompt depends on memory search, but `surreal-memory` is `enabled = false`.
3. `filesystem-write` is `enabled = true` — a write surface the intent forbids.
4. A literal `api_key` in `agent.toml` instead of `key_env`.
5. `default_provider = "anthropic"` with `default_model = "gpt-4o"`.
6. `host = "0.0.0.0"` — a public bind for a local-only auditor.
7. `agent-core` declares no purpose.

> The literal key is the string `EXAMPLE-NOT-A-REAL-KEY-fixture-literal-secret`.
> It is deliberately not shaped like any provider's key format, so a secret
> scanner cannot mistake this fixture for a leaked credential while it still
> exercises the "literal secret in config" failure class.

## Running

The suite needs a **live judge**, so it is on-demand and release-gate only —
never on every commit. See `../run-fixture-suite.sh`.

```bash
set -a; . ~/.prometheus/kbd/secrets.env; set +a
export KBD_PRODUCER_MODEL="claude-opus-5"
bash skills/process/adversarial-review/tests/run-fixture-suite.sh
```

An **inversion** — a flawed fixture passing, or a clean one blocked — fails the
suite with a non-zero exit. That is the assertion that matters: the gate must
sort these four correctly, not merely produce output for each.

## When `clean-skill` starts blocking, suspect the fixture

During development `clean-skill` returned `BLOCK` on roughly half of runs. The
obvious reading was judge non-determinism at the CRITICAL/WARNING boundary, and
the obvious fix was to retry or to loosen the assertion.

Both would have been wrong. The judge was finding a **real defect** every time
and merely disagreeing with itself about severity: the fixture told the operator
to compare `pg_stat_user_tables.n_live_tup` between source and restored
databases. That column is a planner estimate, so two databases can report equal
estimates while holding different data — the procedure could certify a lossy
restore as complete, which is precisely what a backup-verification skill must
never do.

Fixing the fixture (exact `count(*)` via `scripts/count-rows.sh`) made it pass
**4/4**. `flawed-skill` blocks **3/3**.

The lesson generalises: a fixture that flips verdicts is evidence about the
fixture before it is evidence about the judge. Read the findings before reaching
for a retry — an inversion that gets retried away is an inversion that was never
understood.

## Idea fixtures — `weak-idea/` and `sound-idea/`

Used by [`run-idea-fixture-suite.sh`](../run-idea-fixture-suite.sh) to prove the
gate sorts weak from sound **ideas**, which is a harder claim than sorting
flawed from clean code: a weak idea is fluent, confident, and nothing in its
prose looks broken.

Both propose **the same product** — an AI meeting-notes assistant — under a
**byte-identical** `.intent.md`. They differ only in rigor. If the fixtures
differed in topic or length, a verdict could be sorting on the prompt rather
than the reasoning, so the suite asserts the intents are identical.

| | `weak-idea` | `sound-idea` |
|---|---|---|
| Assumptions | 1 (`"It'll work."`) | 4, each named and testable |
| Falsifier | none | 3, each with a threshold |
| Competitors | "we'll differentiate on quality" | named, with why we lose on that axis |
| Commits to | building, immediately | a 2-week pilot; build deferred |

### Determinism

A fixture that passes only sometimes is not evidence. Measured against the live
judge on 2026-07-31:

- `weak-idea` → **BLOCK 4/4**
- `sound-idea` → **PASS 6/6**

Getting there required fixing the *fixture*, not loosening the assertion. Early
runs were 4/6 because the judge found real defects in `sound-idea`: an
overstated "removes the compliance surface entirely", a payment falsifier with
no threshold, pilot criteria that did not match the stated wedge, and a commit
to building before its own falsifiers had run. Each was a genuine hole. The
lesson worth keeping: **when the judge is inconsistent on a fixture, suspect the
fixture first** — non-determinism was tracking real internal inconsistency, and
disappeared entirely once the decision became self-consistent.

### Editing these fixtures

Re-run determinism after any edit — the fixtures are calibrated, not arbitrary:

```bash
export KBD_PRODUCER_MODEL="<the model running your session>"
bash ../run-idea-fixture-suite.sh            # all groups, 2 judge calls
bash ../run-idea-fixture-suite.sh --groups BC # structure only, 0 judge calls
```
