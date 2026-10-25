#!/usr/bin/env bash
# validate-decision-artifact.sh — enforce that a decision was judged by a model
# that did not produce it.
#
# Usage:
#   validate-decision-artifact.sh --findings <findings.json>
#
# Exit codes:
#   0  accepted — cross_model_check is verified-distinct
#   1  usage / unreadable input
#   2  REJECTED — the cross-model guarantee was not obtained
#
# WHY A SCRIPT AND NOT JUST THE SCHEMA
# assets/schemas/findings.schema.json already encodes this rule, but a schema only
# binds callers that validate against it, and `jsonschema` is not guaranteed to be
# installed. This is the enforcement point a creator can actually invoke, mirroring
# how validate-skill.sh — not a schema — is the enforced sycophancy gate.
#
# WHY DECISION MODE IS STRICTER THAN THE OTHERS
# For diff/artifact/skill/agent, `same-model-collision` and
# `unverified-producer-unknown` are HONEST RECORDS: a reviewer may legitimately not
# know the producer, and recording that truth beats fabricating a comparison. A
# decision is different — it is the artifact a human commits to. A decision judged
# by its own producer carries the appearance of scrutiny with none of the substance,
# which is precisely the failure this pack exists to eliminate. So here the honest
# record is a REJECTION, not a footnote.
#
# bash 3.2 compatible. No LLM calls.
set -uo pipefail

FINDINGS=""
while [ $# -gt 0 ]; do
  case "$1" in
    --findings) FINDINGS="${2:-}"; shift 2 ;;
    *) echo "usage: $0 --findings <findings.json>" >&2; exit 1 ;;
  esac
done
[ -n "$FINDINGS" ] || { echo "[decision-gate] ERROR: --findings is required" >&2; exit 1; }
[ -f "$FINDINGS" ] || { echo "[decision-gate] ERROR: findings file not found: $FINDINGS" >&2; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "[decision-gate] ERROR: python3 required" >&2; exit 1; }

# Read mode and cross_model_check in one pass. A malformed artifact prints PARSE_ERROR
# rather than an empty string, so "unreadable" is never mistaken for "absent field" —
# they need different messages and both must fail.
READ="$(python3 - "$FINDINGS" <<'PY' 2>/dev/null || echo "PARSE_ERROR PARSE_ERROR"
import json, sys
try:
    d = json.load(open(sys.argv[1]))
except Exception:
    print("PARSE_ERROR PARSE_ERROR"); raise SystemExit(0)
if not isinstance(d, dict):
    print("PARSE_ERROR PARSE_ERROR"); raise SystemExit(0)
print("%s %s" % (d.get("mode") or "MISSING", d.get("cross_model_check") or "MISSING"))
PY
)"
MODE="${READ%% *}"
XM="${READ##* }"

if [ "$MODE" = "PARSE_ERROR" ]; then
  echo "[decision-gate] REJECTED: $FINDINGS is not readable JSON object." >&2
  echo "[decision-gate]   An unparseable review is not a passing review." >&2
  exit 2
fi

# Only decision artifacts are held to this bar. Other modes record the truth and
# move on — see the header note on why the asymmetry is deliberate.
if [ "$MODE" != "decision" ]; then
  echo "[decision-gate] SKIP: mode=$MODE is not 'decision' — no cross-model requirement applied." >&2
  exit 0
fi

case "$XM" in
  verified-distinct)
    echo "[decision-gate] PASS: judged by a model proven distinct from the producer." >&2
    exit 0 ;;
  MISSING)
    echo "[decision-gate] REJECTED: cross_model_check is absent." >&2
    echo "[decision-gate]   A decision artifact must state whether the judge differed" >&2
    echo "[decision-gate]   from the producer. Silence is not evidence of separation." >&2
    exit 2 ;;
  same-model-collision)
    echo "[decision-gate] REJECTED: cross_model_check = same-model-collision." >&2
    echo "[decision-gate]   The judge WAS the producer, so this review proves nothing" >&2
    echo "[decision-gate]   regardless of its verdict. Configure a second provider:" >&2
    echo "[decision-gate]     /liter-llm-bridge configure" >&2
    exit 2 ;;
  unverified-producer-unknown)
    echo "[decision-gate] REJECTED: cross_model_check = unverified-producer-unknown." >&2
    echo "[decision-gate]   The producer was not declared, so the judge != producer" >&2
    echo "[decision-gate]   comparison passed trivially. Export the real value:" >&2
    echo "[decision-gate]     export KBD_PRODUCER_MODEL=\"claude-opus-5\"" >&2
    exit 2 ;;
  *)
    echo "[decision-gate] REJECTED: unrecognised cross_model_check value '$XM'." >&2
    echo "[decision-gate]   Refusing rather than guessing: an unknown value could be a" >&2
    echo "[decision-gate]   future state this gate does not yet understand." >&2
    exit 2 ;;
esac
