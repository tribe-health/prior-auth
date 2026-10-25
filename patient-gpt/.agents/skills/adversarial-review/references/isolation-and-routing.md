# Isolation and Model Routing

## Why fresh context, why cross-model

Two independent failure modes are being defended against:

1. **Context contamination.** A reviewer that shares the implementing
   session's context has already absorbed the author's framing, rationale,
   and confidence. Information asymmetry is what makes review work — the
   evolver codified this for its collection tasks ("always run as isolated
   subprocesses — never inline"), and this skill applies the same rule to
   judgment.
2. **Self-grading bias.** A model reviewing its own output systematically
   under-reports its own errors. The repo's existing separation agents
   (kbd-idea-critic, kbd-task-verifier, kbd-goal-evaluator) exist for exactly
   this reason; adversarial-review extends the rule to concrete diffs and
   planning artifacts, and strengthens it from "separate context" to
   "separate model" via liter-llm.

Isolation is **structural**, not honor-system: the judge is an API call whose
entire input is the review packet (`build-review-packet.sh` output). There is
no channel through which session history could reach it.

## Model resolution

```
[MODEL_ROUTING] phase=adv-review-judge class=frontier model=<resolved> producer=<producer>
```

1. Read `producer_model` from the packet (progress.json → `KBD_PRODUCER_MODEL` →
   `ANTHROPIC_MODEL` → harness vars → `unknown`). `unknown` makes the comparison below
   pass **trivially**, so `build-review-packet.sh` warns `PRODUCER_UNKNOWN` and the
   findings record `cross_model_check: unverified-producer-unknown`.
2. Resolve the `judge` role through `shared/scripts/lib/kbd-model-resolve.sh`.
   Precedence, highest first:

   ```
   explicit arg > PROMETHEUS_KBD_JUDGE_MODEL > ~/.prometheus/kbd/models.toml
     > .kbd-orchestrator/project.json model_policy > built-in default (kbd-judge)
   ```

   There is **no `frontier` → `medium` → `small` tier walk**, and no alias table. Roles
   resolve to `[[models]]` **names** declared in `~/.config/liter-llm/liter-llm-proxy.toml`.
3. If the judge equals the producer, fall back to the `critic` role. A different-model
   critic beats a same-model self-grade — tier purity is sacrificed for independence,
   never the reverse.
4. If that also matches → `JUDGE_MODEL_COLLISION` warning to stderr and proceed
   same-model, recorded as `cross_model_check: same-model-collision`. Never silent,
   never fatal.

> The retired `~/.config/liter-llm/config.toml` held a flat `[aliases]` table of
> `small`/`medium`/`frontier`. liter-llm cannot load that shape, so the parse yielded
> nothing and step 5 used to "pass the literal class name `frontier` through" — which
> sent `"frontier"` as a model id. That was the defect, not the design.

Phase classes (declared in SKILL.md frontmatter `model_routing`):

| Phase | Class | Rationale |
|---|---|---|
| `adv-review-preflight` | small | env scan + file reads, deterministic |
| `adv-review-packet` | small | pure bash assembly, no LLM call |
| `adv-review-judge` | frontier | open-ended defect hunting requires full reasoning |

## Fallback chain

Following liter-llm-bridge semantics — warn loudly and degrade honestly.
Missing infrastructure does not block agent tools, but final certification
still requires review or a signed waiver:

| Tier | Trigger | Guarantee | Marker |
|---|---|---|---|
| REST gateway | an OpenAI-compatible endpoint answers `GET /v1/models` | fresh context AND cross-model | `isolation_mode: "rest-gateway:<url>"`, exit 0 |
| harness-native subagent | `dispatch-judge.sh` exit 3 | fresh context only (same model family) | `isolation_mode: "harness-native"` |
| pending | exit 4 / no subagent capability | none | cumulative `pending_review` receipt; final certification fails |

The trigger is **gateway reachability** (`kbd_resolve_gateway`), not the presence of the
`liter-llm` binary — the judge speaks OpenAI REST and does not shell out to it.
`isolation_mode` was previously the fixed literal `"liter-llm"` regardless of what
answered, which made a same-family self-grade indistinguishable from a real cross-model
review in the stored artifact.

The harness-native fallback prompt is **exactly** the mandate file plus the
packet JSON — adding anything else (task summaries, prior conversation)
breaks the isolation contract.

## Preflight contract

`preflight-models.sh` output (cached at `.kbd-orchestrator/model-preflight.json`):

```json
{
  "status": "ok | degraded | needs_configure | config_broken | no_gateway | no_providers | unavailable",
  "gateway": "http://localhost:8181/v1",
  "roles": {
    "judge":     { "model": "kbd-judge",    "source": "/Users/you/.prometheus/kbd/models.toml" },
    "critic":    { "model": "kbd-critic",   "source": "/Users/you/.prometheus/kbd/models.toml" },
    "generator": { "model": "kbd-frontier", "source": "/Users/you/.prometheus/kbd/models.toml" }
  },
  "providers_detected": ["openai", "groq"],
  "classes_available": ["small", "medium", "frontier"],
  "distinct_models": 2,
  "config_path": "/Users/you/.config/liter-llm/liter-llm-proxy.toml",
  "config_exists": true,
  "config_defects": [],
  "checked_at": "2026-07-30T00:00:00Z"
}
```

Status handling by the calling skill:

- `unavailable` → offer `/liter-llm-bridge install`; until then fall back tier 2.
- `no_gateway` → nothing answered `GET /v1/models`. Start the local `openai-proxy`
  (`:8181`) or `liter-llm api --config <abs path>`, or set `LITER_LLM_BASE_URL`.
  Remember liter-llm never searches `$HOME` for its config.
- `config_broken` → the config exists but **cannot serve a request**. Read
  `config_defects`: a missing `[general] master_key` means every `/v1/*` call answers
  401, and a `localhost` `base_url` without `[security] outbound_policy` is refused by
  the default `deny_private`. Repair with `/liter-llm-bridge configure repair`.
- `no_providers` → ask the user which providers to configure and name the env
  var per provider (canonical table: liter-llm-bridge
  `references/provider-env-vars.md`). **Never collect or store key values** — the user
  exports the key; the config holds `${VAR}` references only, never literals.
- `needs_configure` → no judge role resolves. Run `/liter-llm-bridge configure repair`
  to seed `~/.prometheus/kbd/models.toml` and the matching `[[models]]` entries.
- `degraded` → warn: only one distinct dispatchable model; collisions expected until a
  second provider is configured.
- `ok` → proceed.

Cache invalidation: `--force`, config.toml newer than cache, or age > 24 h.
