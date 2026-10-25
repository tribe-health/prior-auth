#!/usr/bin/env bash
# dispatch-judge.sh — send the review packet to a fresh-context LLM judge via
# liter-llm, enforcing judge != producer wherever an alternative model exists.
#
# Usage:
#   dispatch-judge.sh --mode diff|artifact --packet <packet.json> \
#     [--mandate <mandate.md>] [--feedback <rejection.md>] [--out <findings.json>]
#
# Exit codes:
#   0  findings written (isolation_mode=liter-llm)
#   2  judge responded but output failed schema-shape validation
#   3  liter-llm unavailable — caller must fall back to a harness-native
#      fresh-context subagent (mandate + packet ONLY) and record
#      isolation_mode=harness-native
#   4  no judge possible — caller records a cumulative pending_review receipt
#
# bash 3.2 compatible (no mapfile, no declare -A).
set -uo pipefail

MODE="" PACKET="" MANDATE="" FEEDBACK="" OUT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --mode)     MODE="${2:-}"; shift 2 ;;
    --packet)   PACKET="${2:-}"; shift 2 ;;
    --mandate)  MANDATE="${2:-}"; shift 2 ;;
    --feedback) FEEDBACK="${2:-}"; shift 2 ;;
    --out)      OUT="${2:-}"; shift 2 ;;
    *) echo "usage: $0 --mode diff|artifact|skill|agent|decision --packet <json> [--mandate <md>] [--feedback <md>] [--out <json>]" >&2; exit 4 ;;
  esac
done
# skill|agent are the creation modes added by change-arc-003/004/005; decision is
# the ideation mode added by change-idt-001. Each needs a matching
# assets/reviewer-mandate-<mode>.md; the check below enforces that, so a mode
# accepted here without a mandate fails loudly rather than reviewing blind.
case "$MODE" in
  diff|artifact|skill|agent|decision) ;;
  *) echo "[judge] ERROR: --mode must be diff, artifact, skill, agent, or decision" >&2; exit 4 ;;
esac
[ -f "$PACKET" ] || { echo "[judge] ERROR: packet not found: $PACKET" >&2; exit 4; }
command -v python3 >/dev/null 2>&1 || { echo "[judge] ERROR: python3 required" >&2; exit 4; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
[ -n "$MANDATE" ] || MANDATE="$SCRIPT_DIR/../assets/reviewer-mandate-$MODE.md"
[ -f "$MANDATE" ] || { echo "[judge] ERROR: mandate not found: $MANDATE" >&2; exit 4; }

# --- judge transport ----------------------------------------------------------
# The judge talks to an OpenAI-compatible /v1/chat/completions endpoint. That is
# the stable contract: `liter-llm` ships `api` and `mcp` subcommands (it is a
# proxy SERVER), so the previous `liter-llm complete` call could never succeed —
# and because the guard only checked that the BINARY existed, the failure was
# reported as "liter-llm unavailable" rather than as the CLI-contract mismatch
# it actually was. Probing the endpoint keeps the diagnosis honest.
#
# LITER_LLM_BASE_URL overrides; otherwise try the local openai-proxy, then a
# liter-llm `api` server on its default port.
# Endpoint + model resolution live in ONE shared library so a config change never
# requires editing this script (and never an edit inside a plugin cache, which the
# next install silently destroys). See shared/scripts/lib/kbd-model-resolve.sh.
RESOLVE_LIB=""
for _cand_lib in \
  "$(cd "$(dirname "$0")" && pwd)/../../../../shared/scripts/lib/kbd-model-resolve.sh" \
  "${CLAUDE_PLUGIN_ROOT:-}/shared/scripts/lib/kbd-model-resolve.sh" \
  "${PLUGIN_ROOT:-}/shared/scripts/lib/kbd-model-resolve.sh"; do
  if [ -n "$_cand_lib" ] && [ -f "$_cand_lib" ]; then RESOLVE_LIB="$_cand_lib"; break; fi
done
if [ -n "$RESOLVE_LIB" ]; then
  # shellcheck source=/dev/null
  . "$RESOLVE_LIB"
fi

probe_endpoint() {
  # --noproxy '*': an ambient HTTP(S)_PROXY must never intercept loopback.
  curl -s -o /dev/null --max-time 5 --noproxy '*' "$1/models" 2>/dev/null
}

JUDGE_BASE_URL="${LITER_LLM_BASE_URL:-}"
if [ -z "$JUDGE_BASE_URL" ] && command -v kbd_resolve_gateway >/dev/null 2>&1; then
  JUDGE_BASE_URL="$(kbd_resolve_gateway 2>/dev/null || true)"
fi
if [ -z "$JUDGE_BASE_URL" ]; then
  for cand in "http://localhost:8181/v1" "http://localhost:4000/v1"; do
    if probe_endpoint "$cand"; then JUDGE_BASE_URL="$cand"; break; fi
  done
fi

if [ -z "$JUDGE_BASE_URL" ]; then
  echo "[judge] WARN: no OpenAI-compatible endpoint reachable (set" >&2
  echo "[judge]       LITER_LLM_BASE_URL, or start one) — fall back to a" >&2
  echo "[judge]       harness-native fresh-context subagent (prompt = mandate +" >&2
  echo "[judge]       packet, nothing else) and record isolation_mode=harness-native" >&2
  exit 3
fi

# --- model resolution + collision check --------------------------------------
PRODUCER="$(python3 - "$PACKET" <<'PY' 2>/dev/null || echo unknown
import json, sys
print(json.load(open(sys.argv[1])).get("producer_model") or "unknown")
PY
)"
PRODUCER_IDENTITY="$(python3 - "$PACKET" <<'PY' 2>/dev/null || true
import json, sys
identity = json.load(open(sys.argv[1])).get("producer_identity") or {}
if all(identity.get(key) for key in ("providerConnectionId", "providerId", "modelId")):
    print(json.dumps([identity["providerConnectionId"], identity["providerId"], identity["modelId"]], separators=(",", ":")))
PY
)"

# Served aliases select transport routes. Canonical identity tuples alone decide
# whether judge, critic, backup and producer are actually different models.
JUDGE_MODEL=""; CRITIC_MODEL=""; BACKUP_MODEL=""
JUDGE_IDENTITY=""; CRITIC_IDENTITY=""; BACKUP_IDENTITY=""
if command -v kbd_resolve_role >/dev/null 2>&1; then
  JUDGE_MODEL="$(kbd_resolve_role judge 2>/dev/null || true)"
  CRITIC_MODEL="$(kbd_resolve_role critic 2>/dev/null || true)"
  BACKUP_MODEL="$(kbd_resolve_role backup 2>/dev/null || true)"
  JUDGE_IDENTITY="$(kbd_resolve_role_identity judge 2>/dev/null || true)"
  CRITIC_IDENTITY="$(kbd_resolve_role_identity critic 2>/dev/null || true)"
  BACKUP_IDENTITY="$(kbd_resolve_role_identity backup 2>/dev/null || true)"
fi
[ -n "$JUDGE_MODEL" ] || JUDGE_MODEL="kbd-judge"

JUDGE_AUTH_TOKEN="$(kbd_gateway_auth 2>/dev/null || printf '%s' "${LITER_LLM_MASTER_KEY:-${OPENAI_API_KEY:-sk-local}}")"
AVAILABLE_MODELS="$(curl -s --max-time 5 --noproxy '*' "$JUDGE_BASE_URL/models" \
  -H "Authorization: Bearer $JUDGE_AUTH_TOKEN" 2>/dev/null | \
  python3 -c 'import json,sys
try: body=json.load(sys.stdin)
except Exception: raise SystemExit
for model in body.get("data") or []:
    if isinstance(model,dict) and model.get("id"): print(model["id"])' 2>/dev/null || true
)"
_alias_available() {
  [ -n "$1" ] || return 1
  if [ -n "$AVAILABLE_MODELS" ]; then
    printf '%s\n' "$AVAILABLE_MODELS" | grep -Fxq "$1"
  elif command -v kbd_model_declared >/dev/null 2>&1; then
    kbd_model_declared "$1"
  else
    return 0
  fi
}

_judge_collision=0
[ -n "$JUDGE_IDENTITY" ] || _judge_collision=1
[ -n "$JUDGE_IDENTITY" ] && [ "$JUDGE_IDENTITY" = "$CRITIC_IDENTITY" ] && _judge_collision=1
[ -n "$JUDGE_IDENTITY" ] && [ "$JUDGE_IDENTITY" = "$PRODUCER_IDENTITY" ] && _judge_collision=1
if [ "$_judge_collision" -eq 1 ] || ! _alias_available "$JUDGE_MODEL"; then
  if [ -n "$BACKUP_IDENTITY" ] && [ "$BACKUP_IDENTITY" != "$CRITIC_IDENTITY" ] \
    && [ "$BACKUP_IDENTITY" != "$PRODUCER_IDENTITY" ] && _alias_available "$BACKUP_MODEL"; then
    echo "[judge] NOTE: judge collision, missing identity, or unavailability detected — switching to backup '$BACKUP_MODEL'" >&2
    JUDGE_MODEL="$BACKUP_MODEL"
    JUDGE_IDENTITY="$BACKUP_IDENTITY"
  else
    echo "[judge] WARN: JUDGE_MODEL_COLLISION — no distinct available backup is configured" >&2
    echo "[judge]       Review remains pending; refusing to claim independent judgment." >&2
    exit 4
  fi
fi
if [ -z "$JUDGE_IDENTITY" ] || [ -z "$PRODUCER_IDENTITY" ]; then
  echo "[judge] WARN: canonical judge/producer identity is incomplete; independence is degraded" >&2
fi

# A producer of "unknown" makes the collision check pass trivially — every one of
# the 8 historical reviews did exactly this, so judge!=producer was never actually
# enforced. Surface it rather than let it read as a clean cross-model review.
if [ "$PRODUCER" = "unknown" ]; then
  echo "[judge] WARN: PRODUCER_UNKNOWN — packet carries no producer_model, so the" >&2
  echo "[judge]       judge!=producer check cannot be enforced for this review." >&2
fi

echo "[MODEL_ROUTING] phase=adv-review-judge class=frontier model=$JUDGE_MODEL producer=$PRODUCER" >&2

# --- build prompts ------------------------------------------------------------
# Review packets routinely exceed macOS ARG_MAX. Keep every large value in a
# private temporary directory: environment variables and curl's inline
# --data-binary argument both count against the same process-launch limit.
_judge_tmp="$(mktemp -d)" || { echo "[judge] ERROR: cannot create temporary directory" >&2; exit 4; }
cleanup_judge_tmp() { rm -rf "$_judge_tmp"; }
trap cleanup_judge_tmp EXIT HUP INT TERM

SYSTEM_PROMPT_FILE="$_judge_tmp/system-prompt.md"
REQ_BODY_FILE="$_judge_tmp/request.json"
RAW_FILE="$_judge_tmp/raw-completion.txt"
cp "$MANDATE" "$SYSTEM_PROMPT_FILE" || { echo "[judge] ERROR: cannot stage mandate" >&2; exit 4; }
if [ -n "$FEEDBACK" ] && [ -f "$FEEDBACK" ]; then
  printf '\n\n## Previous report rejected — address this feedback\n\n' >> "$SYSTEM_PROMPT_FILE"
  cat "$FEEDBACK" >> "$SYSTEM_PROMPT_FILE"
fi

# --- dispatch (fresh context: the judge sees ONLY mandate + packet) -----------
# Assemble the request from file paths, not shell interpolation or environment
# variables. The packet may contain arbitrary source text and can be megabytes.
python3 - "$JUDGE_MODEL" "$SYSTEM_PROMPT_FILE" "$PACKET" "$REQ_BODY_FILE" <<'PY'
import json, sys

model, system_path, packet_path, output_path = sys.argv[1:]
body = {
    "model": model,
    "messages": [
        {"role": "system", "content": open(system_path, encoding="utf-8").read()},
        {"role": "user", "content": open(packet_path, encoding="utf-8").read()},
    ],
}

# temperature=0 is the right default for a judge — a review should be
# reproducible. But some reasoning models REFUSE any other value and reject the
# whole request rather than clamping:
#   HTTP 400 "invalid temperature: only 1 is allowed for this model"
# Kimi k3 does exactly this, which made every dispatch to it fail outright.
#
# Omitting the field lets such a model apply its own required default, while
# every other model still gets an explicit 0. Do not "fix" this by sending 1
# unconditionally — that would silently make ALL judges non-deterministic to
# accommodate one.
FIXED_TEMPERATURE_MODELS = ("k3", "kimi-for-coding", "o1", "o3", "gpt-5")
if not any(model.startswith(p) for p in FIXED_TEMPERATURE_MODELS):
    body["temperature"] = 0

with open(output_path, "w", encoding="utf-8") as handle:
    json.dump(body, handle)
PY
[ -s "$REQ_BODY_FILE" ] || { echo "[judge] ERROR: failed to build request body" >&2; exit 4; }

# liter-llm requires a Bearer token on every /v1/* route (a config with no
# master_key answers 401 to everything); openai-proxy ignores the value but still
# needs the header. Prefer the gateway master key over a personal OPENAI_API_KEY —
# the latter is the wrong credential for a local liter-llm front door.
if command -v kbd_gateway_auth >/dev/null 2>&1; then
  AUTH_HEADER="Authorization: Bearer $(kbd_gateway_auth)"
else
  AUTH_HEADER="Authorization: Bearer ${LITER_LLM_MASTER_KEY:-${OPENAI_API_KEY:-sk-local}}"
fi

# Capture the HTTP status separately. `curl -s` without `-f` exits 0 on 4xx/5xx,
# so the old `|| exit 3` branch was near-dead and a non-JSON 502 from a reverse
# proxy degraded to the generic "unavailable" message this script exists to avoid.
#
# TIMEOUT ESCALATION WITH RETRY
#
# A reasoning judge emits a long reasoning preamble before any content. On a
# large review packet that regularly exceeds a fixed client timeout, and an
# upstream that gives up first surfaces as HTTP 502 with a Network body — NOT as
# a clean curl timeout. Both symptoms mean the same thing: not enough time.
#
# A single fixed timeout therefore either fails on big packets or wastes wall
# clock on small ones. Instead: start at ADV_JUDGE_TIMEOUT and, on a
# timeout-shaped failure only, double it and retry up to ADV_JUDGE_RETRIES
# times, reporting each escalation so the wait is never silent.
#
# Only timeout-shaped failures escalate. A 401 is not slow, it is wrong, and
# retrying it just delays an actionable error.
_timeout="${ADV_JUDGE_TIMEOUT:-300}"
_max_attempts="${ADV_JUDGE_RETRIES:-3}"
_attempt=1

while : ; do
  _resp_file="$_judge_tmp/response.${_attempt}.json"
  HTTP_CODE="$(curl -s --max-time "$_timeout" \
    -o "$_resp_file" -w '%{http_code}' \
    --noproxy '*' \
    "$JUDGE_BASE_URL/chat/completions" \
    -H 'content-type: application/json' -H "$AUTH_HEADER" \
    --data-binary "@$REQ_BODY_FILE" 2>/dev/null)" || HTTP_CODE="000"

  # 000 = curl gave up locally. 502/503/504 with a Network/timeout body = the
  # gateway gave up on the upstream. Treat both as "needs more time".
  _retryable=0
  if [ "$HTTP_CODE" = "000" ]; then
    _retryable=1
  elif [ "$HTTP_CODE" = "502" ] || [ "$HTTP_CODE" = "503" ] || [ "$HTTP_CODE" = "504" ]; then
    if grep -Eiq 'Network|timeout|timed out' "$_resp_file" 2>/dev/null; then _retryable=1; fi
  fi

  if [ "$_retryable" -eq 0 ]; then
    break
  fi

  if [ "$_attempt" -ge "$_max_attempts" ]; then
    echo "[judge] WARN: judge request to $JUDGE_BASE_URL did not complete after" >&2
    echo "[judge]       ${_attempt} attempt(s), final timeout ${_timeout}s (HTTP ${HTTP_CODE})." >&2
    echo "[judge]       Raise ADV_JUDGE_TIMEOUT or ADV_JUDGE_RETRIES, or reduce the" >&2
    echo "[judge]       packet size — unavailable (exit 3)" >&2
    exit 3
  fi

  _prev="$_timeout"
  _timeout=$(( _timeout * 2 ))
  _attempt=$(( _attempt + 1 ))
  echo "[judge] retry ${_attempt}/${_max_attempts}: HTTP ${HTTP_CODE} looks like a timeout" >&2
  echo "[judge]        at ${_prev}s; escalating timeout to ${_timeout}s and retrying." >&2
done

case "$HTTP_CODE" in
  2*) ;;
  401|403)
    echo "[judge] ERROR: gateway rejected the credential (HTTP $HTTP_CODE) at $JUDGE_BASE_URL." >&2
    echo "[judge]        liter-llm requires [general] master_key (or [[keys]]) and a matching" >&2
    echo "[judge]        Bearer token. Repair with: /liter-llm-bridge configure" >&2
    echo "[judge]        body: $(head -c 200 "$_resp_file" 2>/dev/null)" >&2
    exit 3
    ;;
  *)
    echo "[judge] ERROR: gateway returned HTTP $HTTP_CODE at $JUDGE_BASE_URL" >&2
    echo "[judge]        body: $(head -c 200 "$_resp_file" 2>/dev/null)" >&2
    exit 3
    ;;
esac

# Surface the endpoint's own error text. A silent empty completion here reads as
# "the judge found nothing", which is the most dangerous possible failure mode
# for a review gate — it turns an outage into a false all-clear.
python3 - "$_resp_file" "$RAW_FILE" <<'PY'
import json, sys
try:
    data = json.load(open(sys.argv[1], encoding="utf-8"))
except Exception:
    sys.exit(1)
if isinstance(data, dict) and data.get("error"):
    err = data["error"]
    msg = err.get("message") if isinstance(err, dict) else str(err)
    print(f"[judge-endpoint-error] {msg}", file=sys.stderr)
    sys.exit(1)
try:
    content = data["choices"][0]["message"]["content"]
except Exception:
    sys.exit(1)
with open(sys.argv[2], "w", encoding="utf-8") as handle:
    handle.write(content)
PY
if [ $? -ne 0 ] || [ ! -s "$RAW_FILE" ]; then
  echo "[judge] WARN: judge returned no usable completion — unavailable (exit 3)" >&2
  exit 3
fi

# --- normalize + shape-check the findings -------------------------------------
FINDINGS="$(JUDGE_MODEL="$JUDGE_MODEL" JUDGE_IDENTITY="$JUDGE_IDENTITY" MODE="$MODE" \
  PRODUCER="$PRODUCER" PRODUCER_IDENTITY="$PRODUCER_IDENTITY" JUDGE_BASE_URL="$JUDGE_BASE_URL" python3 - "$RAW_FILE" <<'PY'
import json, os, re, sys
raw = open(sys.argv[1], encoding="utf-8").read()

def extract(text):
    try:
        return json.loads(text)
    except Exception:
        pass
    m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.S)
    if m:
        try:
            return json.loads(m.group(1))
        except Exception:
            pass
    start = text.find("{")
    if start >= 0:
        try:
            return json.loads(text[start:text.rfind("}") + 1])
        except Exception:
            pass
    return None

data = extract(raw)
if not isinstance(data, dict) or "findings" not in data:
    sys.stderr.write("[judge] ERROR: judge output is not shape-valid findings JSON\n")
    raise SystemExit(1)

sev_ok = {"CRITICAL", "WARNING", "SUGGESTION"}
findings = []
for f in data.get("findings") or []:
    if not isinstance(f, dict):
        continue
    if f.get("severity") not in sev_ok:
        continue
    if not f.get("claim") or not f.get("evidence"):
        continue
    findings.append(f)

# isolation_mode must describe what ACTUALLY answered, not what we hoped would.
# It was previously the hardcoded literal "liter-llm" regardless of endpoint, so a
# same-family self-grade was indistinguishable from a genuine cross-model review in
# the stored artifact. Record the real endpoint, and state plainly whether the
# judge was verified distinct from the producer.
producer = os.environ.get("PRODUCER", "unknown")
judge = os.environ["JUDGE_MODEL"]
endpoint = os.environ.get("JUDGE_BASE_URL", "")
judge_identity = json.loads(os.environ["JUDGE_IDENTITY"]) if os.environ.get("JUDGE_IDENTITY") else None
producer_identity = json.loads(os.environ["PRODUCER_IDENTITY"]) if os.environ.get("PRODUCER_IDENTITY") else None

if not judge_identity or not producer_identity:
    cross = "unverified-producer-unknown"
elif judge_identity == producer_identity:
    cross = "same-model-collision"
else:
    cross = "verified-distinct"

out = {
    "mode": os.environ["MODE"],
    "verdict": "BLOCK" if any(f["severity"] == "CRITICAL" for f in findings) else "PASS",
    "judge_model": judge,
    "producer_model": producer,
    "isolation_mode": "rest-gateway:%s" % endpoint if endpoint else "rest-gateway",
    "cross_model_check": cross,
    "findings": findings,
}
if judge_identity:
    out["judge_identity"] = {
        "providerConnectionId": judge_identity[0], "providerId": judge_identity[1], "modelId": judge_identity[2]
    }
if producer_identity:
    out["producer_identity"] = {
        "providerConnectionId": producer_identity[0], "providerId": producer_identity[1], "modelId": producer_identity[2]
    }
# A zero-finding report must carry its due-diligence trail (mandate rule);
# the anti-theater gate rejects empty findings without checked_classes.
checked = data.get("checked_classes")
if isinstance(checked, list):
    out["checked_classes"] = [str(c) for c in checked if c]
print(json.dumps(out, indent=2))
PY
)" || { echo "[judge] ERROR: unusable judge output" >&2; exit 2; }

if [ -n "$OUT" ]; then
  mkdir -p "$(dirname "$OUT")"
  printf '%s\n' "$FINDINGS" > "$OUT"
  echo "[judge] wrote $OUT" >&2
else
  printf '%s\n' "$FINDINGS"
fi
