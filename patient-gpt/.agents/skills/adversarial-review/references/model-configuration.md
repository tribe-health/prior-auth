# Model configuration for adversarial review

How the judge finds a model that is **not** the producer, and how to point it at any
provider you have — a local `openai-proxy`, or a Kimi/MiniMax/Qwen/GLM coding plan.

## The rule this exists to enforce

The critic must not share the producer's blind spots. A same-family judge is a
**failure**, not a fallback.

This was not enforced for a long time. All 8 reviews stored under
`.kbd-orchestrator/phases/docusaurus-github-pages-site/review/` record
`isolation_mode: harness-native` and `judge_model: "harness-subagent (claude,
parent-session family)"` — Claude reviewing Claude, every one `PASS`. Treat those
artifacts as unreliable.

## Two files, one gateway

```
~/.prometheus/kbd/models.toml              KBD owns:       role -> model NAME
~/.config/liter-llm/liter-llm-proxy.toml   liter-llm owns: NAME -> provider + base_url + ${KEY}
```

Adding a provider edits liter-llm's file. Repointing a role edits `models.toml`.
**Neither requires editing a script** — that is the entire point of the split.

```toml
# ~/.prometheus/kbd/models.toml
[gateway]
candidates = ["http://localhost:8181/v1", "http://localhost:4000/v1"]

[roles]
generator = "kbd-frontier"   # the producer; not dispatched, only compared against
critic    = "kbd-critic"     # MUST differ from generator
judge     = "kbd-judge"
backup    = "kbd-backup"

[role_identities]
critic_gateway_connection_id = "full-pack:local-gateway"
critic_provider_connection_id = "full-pack:local-proxy"
critic_provider_id = "openai"
critic_model_id = "gpt-5.5"
judge_gateway_connection_id = "full-pack:local-gateway"
judge_provider_connection_id = "full-pack:local-proxy"
judge_provider_id = "openai"
judge_model_id = "gpt-5.6-sol"
backup_gateway_connection_id = "full-pack:local-gateway"
backup_provider_connection_id = "full-pack:local-proxy"
backup_provider_id = "openai"
backup_model_id = "gpt-5.4"
```

Aliases select a gateway route. Collision checks use the canonical
provider-connection/provider/model triple, so two aliases that resolve to the
same model still collide. A judge collision or unavailable alias selects the
configured backup only when its canonical identity is distinct; otherwise the
review remains pending.

## Resolution order

AWS-CLI convention, highest wins. Implemented once in
`shared/scripts/lib/kbd-model-resolve.sh`:

```
explicit argument
  > PROMETHEUS_KBD_<ROLE>_MODEL        e.g. PROMETHEUS_KBD_JUDGE_MODEL
  > ~/.prometheus/kbd/models.toml      [roles]
  > .kbd-orchestrator/project.json     model_policy   (repo-local)
  > built-in default                   kbd-judge / kbd-critic / kbd-frontier
```

`preflight-models.sh` prints which layer supplied each role, so this is never a guess.

## Four contracts that will bite you

All four were verified against `tools/liter-llm`, and all four were live defects
in the shipped configuration.

### 1. `/v1/*` requires a Bearer token unconditionally

A config with no `[general] master_key` and no `[[keys]]` answers **401 to
everything**, `/v1/models` included. The template shipped before 2026-07-30 omitted
it, so the config could not serve a single request.

```toml
[general]
master_key = "${LITER_LLM_MASTER_KEY}"
```

### 2. `deny_private` blocks loopback

`[security].outbound_policy` defaults to `deny_private`, which **refuses** any
`localhost` / `127.0.0.1` `base_url` with `OutboundForbidden`.

```toml
[security]
outbound_policy = "off"
# or, if this host also reaches untrusted networks:
#   outbound_policy = "allowlist"
#   outbound_allowlist = ["http://localhost:8181"]
```

### 3. liter-llm never searches `$HOME`

`ProxyConfig::discover()` walks the **CWD upward** for `liter-llm-proxy.toml`.
Always pass `--config <abs path>`:

```bash
liter-llm api --config ~/.config/liter-llm/liter-llm-proxy.toml
liter-llm mcp --transport stdio --config ~/.config/liter-llm/liter-llm-proxy.toml
```

Without it the MCP server does not merely load zero models — it **fails to start**,
because `[mcp] stdio_trust_local` lives in the config it was never given.

### 4. A `base_url` override never speaks a non-OpenAI wire protocol, and never substitutes `provider_model` into the request

Two separate behaviors compound into one trap:

- **Protocol.** `DefaultClient::build_provider()` checks `config.base_url.is_some()`
  *before* looking at `provider_model` at all (the one exception is an explicit
  `azure/` prefix). Any `[[models]]` entry that sets `base_url` gets a generic
  OpenAI-compatible client — `/chat/completions`, `Authorization: Bearer`, OpenAI
  response shape — **no matter what prefix `provider_model` uses**. `provider_model =
  "anthropic/whatever"` with a `base_url` override does **not** get you the real
  Anthropic Messages wire format (`x-api-key`, `anthropic-version`, `/messages`,
  `content: [...]` responses). There is currently no way to point liter-llm's
  Anthropic client at a third-party host — it only ever talks to
  `https://api.anthropic.com/v1`.
- **Model field.** `liter-llm-proxy`'s `/v1/chat/completions` handler
  (`routes/chat.rs`) forwards the **caller's literal `"model"` string** upstream
  unchanged. `provider_model` is used only as a `model_hint` to pick the protocol
  handler above (irrelevant once `base_url` forces the generic client) — it is
  **never substituted into the outgoing request body**.

The practical consequence: for any `base_url`-overridden `[[models]]` entry, `name`
**must equal the real upstream model id**, or the upstream receives your alias
string (e.g. `"kbd-critic"`) as its `model` field. Some upstreams tolerate this
silently — Kimi's coding endpoint auto-upgrades any string to its current model,
and `openai-proxy` ignores `model` entirely and always answers as its own backend
— which is exactly what makes this dangerous: **`curl .../chat/completions` comes
back HTTP 200 with a well-formed `choices` array regardless of whether the
intended backend was ever reached.** The only way to catch it is to ask the model
to self-identify and compare the answer against what you configured. This is
precisely how the `kimi-coding` / `minimax-coding` rows below were caught wrong
(verified 2026-08-04): a `[[models]] name = "kbd-minimax-coding"` entry pointed at
MiniMax's real subscription endpoint got a clean `choices` response from
`openai-proxy` at `:8181` (which was answering *instead of* liter-llm, per the
gateway-ordering note below) that self-identified as ChatGPT — and, once routed
through liter-llm's own gateway correctly, a 400 from MiniMax itself
(`unknown model 'kbd-minimax-coding'`) because MiniMax — unlike Kimi and
openai-proxy — validates the model field strictly.

**Gateway ordering matters for the same reason.** `~/.prometheus/kbd/models.toml`
`[gateway] candidates` is checked in order; the first URL that answers `GET
/models` wins. `openai-proxy` (`:8181`) is a *different tool* that always answers
200 and always serves its own backend regardless of the requested model. If
liter-llm's own `api` server (default port `4000`) isn't running or isn't listed
first, KBD dispatch silently falls through to `openai-proxy` and every named
model — `kbd-critic`, `kbd-judge`, `k3`, `MiniMax-M3`, all of them — gets served by
whatever `openai-proxy` proxies to, with no error. Start liter-llm's gateway before
relying on named models:

```bash
set -a; . ~/.prometheus/kbd/secrets.env; set +a
liter-llm api --config ~/.config/liter-llm/liter-llm-proxy.toml &
```

and put `http://localhost:4000/v1` **first** in `[gateway] candidates`.

## Providers

liter-llm has first-class providers for all four; use the real prefixes.

| Provider | `provider_model` | `base_url` | key var |
|---|---|---|---|
| openai-proxy (local) | `openai/gpt-5.6-sol` | `http://localhost:8181/v1` | none (`sk-proxy-local`) |
| Kimi / Moonshot | `moonshot/kimi-k2.5` | `https://api.moonshot.ai/v1` | `MOONSHOT_API_KEY` |
| MiniMax (pay-as-you-go) | `minimax/MiniMax-M2.5` | `https://api.minimax.io/v1` | `MINIMAX_API_KEY` |
| Qwen / DashScope | `dashscope/qwen3-coder-plus` | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` | `DASHSCOPE_API_KEY` |
| Z.ai GLM | `zai/glm-4.7` | `https://api.z.ai/api/paas/v4` | `ZAI_API_KEY` |
| Kimi For Coding (subscription) | `moonshot/k3` | `https://api.kimi.com/coding/v1` | `KIMI_CODING_KEY` |
| MiniMax Token Plan (subscription) | `minimax/MiniMax-M3` | `https://api.minimax.io/v1` | `MINIMAX_KEY` |

Remember contract #4 above: for the last two rows, `name` in `[[models]]` **must
literally be** `k3` / `MiniMax-M3` respectively — not an alias like `kbd-critic` —
because that literal string is what gets forwarded upstream as `"model"`.

### Coding plans

The `*-coding-plan` entries in liter-llm's `schemas/catalog.json` are **metadata,
not routable providers** — `provider_model = "kimi-for-coding/k3"` will not route.
Keep a routable prefix and override the endpoint:

```toml
[[models]]
name = "kbd-glm"
provider_model = "zai/glm-5.2"
base_url = "https://api.z.ai/api/coding/paas/v4"   # coding path, NOT /api/paas/v4
api_key  = "${ZAI_API_KEY}"
```

Z.ai's docs are explicit: a Coding Plan **must** use `/api/coding/paas/v4`, or the
subscription quota is not drawn. `/liter-llm-bridge configure add-provider glm-coding`
writes this for you.

**Kimi For Coding and the MiniMax Token Plan are each a distinct auth realm, not
just a distinct path** — the subscription key for one 401s against the other
product's endpoint (verified: `KIMI_CODING_KEY` gets `invalid_authentication_error`
against plain `api.moonshot.ai/v1`). Both products' own docs describe an
*Anthropic-compatible* surface (`/coding/v1` for Kimi, `/anthropic/v1` for MiniMax)
for use with Claude Code / Anthropic-SDK clients — but per contract #4, liter-llm's
`base_url`-override path cannot speak that wire format regardless of prefix. What
was actually verified live (2026-08-04) instead: **both subscription keys also work
against a plain OpenAI-compatible `/chat/completions` path** — `/coding/v1` for Kimi
(its own dedicated OpenAI-compatible path), and MiniMax's regular `/v1` (the
subscription *key* draws on the Token Plan quota regardless of which of MiniMax's
equivalent paths receives it). Use `add-provider kimi-coding` / `add-provider
minimax-coding` rather than hand-writing these — the presets encode the verified
`name`/`base_url` combination.

## Secrets

Never in the TOML. Keys live in `~/.prometheus/kbd/secrets.env` (`0600`, outside any
repo) and are referenced as `${VAR}`:

```bash
set -a; . ~/.prometheus/kbd/secrets.env; set +a
```

liter-llm supports `${VAR}` **only** — no `${VAR:-default}` — and expands an **unset**
var to `""`, which surfaces much later as an unexplained 401. Both
`/liter-llm-bridge configure check` and `scripts/check-model-config.sh` verify every
referenced var is actually set.

## Commands

```bash
S="${CLAUDE_PLUGIN_ROOT}/skills/process/liter-llm-bridge/scripts/configure-models.sh"

bash "$S" check                    # report state; change nothing
bash "$S" repair                   # add ONLY the missing mandatory pieces
bash "$S" add-provider glm-coding   # local-proxy|kimi|minimax|qwen|glm|glm-coding|kimi-coding|minimax-coding
bash "$S" verify                   # live 1-token completion per role
bash "$S" migrate                  # retire the legacy config.toml

bash scripts/check-model-config.sh  # routing + cache-drift audit (exit 2 = drift)
```

## Reading the artifact

`findings.json` now records what actually answered:

| Field | Meaning |
|---|---|
| `isolation_mode` | `rest-gateway:<url>` — the endpoint that served the review |
| `cross_model_check` | `verified-distinct` · `same-model-collision` · `unverified-producer-unknown` |
| `judge_model` / `producer_model` | the compared pair |

`isolation_mode` used to be the hardcoded literal `"liter-llm"` regardless of what
answered, which made a self-grade indistinguishable from a real cross-model review.

`unverified-producer-unknown` means the packet carried no `producer_model`, so the
collision check passed **trivially** — export `KBD_PRODUCER_MODEL` to fix it.

## Never edit a plugin cache

Files under `~/.claude/plugins/cache/...` (and the Codex equivalent) are overwritten
by the next install, and edits there are invisible to git. Caches are keyed by plugin
**version**, so a same-version edit is not picked up from the repo either — which is
how a previous "fix" both appeared to work and then silently vanished.

Change the repo, then:

```bash
bash scripts/update-skill-pack.sh --force   # also refreshes the plugin caches
bash scripts/check-model-config.sh          # exit 2 if any cache still diverges
```
