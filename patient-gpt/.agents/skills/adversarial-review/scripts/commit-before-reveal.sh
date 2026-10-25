#!/usr/bin/env bash
# commit-before-reveal.sh — withhold analysis until the user commits their own judgement.
#
# Usage:
#   commit-before-reveal.sh record  --session <dir> --judgement <file|-> [--confidence N]
#   commit-before-reveal.sh check   --session <dir>
#
# Exit: 0 a judgement is recorded (reveal permitted) · 1 usage · 2 REFUSED
#
# WHY THIS EXISTS
# Showing a user the analysis first and asking what they think second produces
# agreement, not judgement. The evidence is one-sided:
#
#   - Microsoft Research (2025): confidence in AI was among the strongest
#     predictors of whether knowledge workers engaged in critical thinking AT
#     ALL — higher trust, less scrutiny.
#   - Explainable output *increased* trust while promoting over-reliance,
#     producing "False Confirmation" errors: making reasoning visible "may
#     instead provide false assurance that errors have been checked for and
#     ruled out."
#   - Greater AI dependence tracks lower critical thinking, mediated by
#     cognitive fatigue; 27.7% of students showed degraded decision-making
#     (PubMed 41076923).
#
# Anchoring is not fixable by telling the user to think independently — once
# they have seen the answer, their prior is gone. The only intervention that
# survives is ORDERING: capture the human judgement first, then reveal.
#
# Of 21 commercial idea-validation tools surveyed for this phase, ZERO implement
# any over-reliance countermeasure.
#
# WHY IT REFUSES RATHER THAN WARNS
# A warning is advice; the model can proceed anyway and usually will. Exit 2
# with no analysis written is the only version a caller cannot ignore — the same
# fail-closed posture as the producer-model guard.
#
# bash 3.2 compatible. No LLM calls.
set -uo pipefail

CMD="${1:-}"; shift 2>/dev/null || true
SESSION="" JUDGEMENT="" CONFIDENCE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --session)    SESSION="${2:-}";    shift 2 ;;
    --judgement)  JUDGEMENT="${2:-}";  shift 2 ;;
    --confidence) CONFIDENCE="${2:-}"; shift 2 ;;
    *) echo "usage: $0 record|check --session <dir> [--judgement <file|->] [--confidence N]" >&2; exit 1 ;;
  esac
done
case "$CMD" in record|check) ;; *) echo "usage: $0 record|check ..." >&2; exit 1 ;; esac
[ -n "$SESSION" ] || { echo "[commit-gate] ERROR: --session is required" >&2; exit 1; }

PRIOR="$SESSION/user-judgement.json"

# ---------------------------------------------------------------- record ----
if [ "$CMD" = "record" ]; then
  [ -n "$JUDGEMENT" ] || { echo "[commit-gate] ERROR: --judgement <file|-> is required" >&2; exit 1; }
  mkdir -p "$SESSION" 2>/dev/null || { echo "[commit-gate] ERROR: cannot create $SESSION" >&2; exit 1; }

  if [ "$JUDGEMENT" = "-" ]; then
    TEXT="$(cat)"
  else
    [ -f "$JUDGEMENT" ] || { echo "[commit-gate] ERROR: judgement file not found: $JUDGEMENT" >&2; exit 1; }
    TEXT="$(cat "$JUDGEMENT")"
  fi

  # An empty or near-empty judgement is not a judgement. Accepting "idk" would
  # satisfy the gate's letter while defeating its purpose — the user must have
  # actually formed a view for the ordering to matter.
  STRIPPED="$(printf '%s' "$TEXT" | tr -d '[:space:]')"
  if [ "${#STRIPPED}" -lt 20 ]; then
    echo "[commit-gate] REFUSED: the recorded judgement is empty or too short to be one." >&2
    echo "[commit-gate]   State what you currently believe and why, before seeing the" >&2
    echo "[commit-gate]   analysis. A placeholder satisfies the gate while defeating it." >&2
    exit 2
  fi

  case "${CONFIDENCE:-}" in
    '') CONF_JSON="null" ;;
    *[!0-9]*) echo "[commit-gate] ERROR: --confidence must be an integer 0-100" >&2; exit 1 ;;
    *) if [ "$CONFIDENCE" -gt 100 ]; then
         echo "[commit-gate] ERROR: --confidence must be 0-100" >&2; exit 1
       fi
       CONF_JSON="$CONFIDENCE" ;;
  esac

  # NB: keep `|| { ...; }` OFF the heredoc-opening line. Bash parses the
  # redirection first, so a multi-line brace group there is a syntax error
  # reported far below, at the next `fi`.
  WROTE=1
  TEXT="$TEXT" CONF="$CONF_JSON" python3 - "$PRIOR" <<'PY' || WROTE=0
import json, os, sys, time
json.dump({
    "recorded_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    "judgement": os.environ["TEXT"],
    "confidence": None if os.environ["CONF"] == "null" else int(os.environ["CONF"]),
    # The whole point: this was written BEFORE any analysis was shown.
    "recorded_before_analysis": True,
}, open(sys.argv[1], "w"), indent=2)
PY
  if [ "$WROTE" -ne 1 ]; then
    echo "[commit-gate] ERROR: failed to write the judgement record" >&2
    exit 1
  fi
  echo "[commit-gate] recorded — analysis may now be revealed." >&2
  exit 0
fi

# ----------------------------------------------------------------- check ----
if [ ! -f "$PRIOR" ]; then
  echo "[commit-gate] REFUSED: no user judgement recorded for this session." >&2
  echo "[commit-gate]   Analysis is withheld until you commit your own view first." >&2
  echo "[commit-gate]   Seeing the answer first replaces your judgement with agreement:" >&2
  echo "[commit-gate]   confidence in AI predicts whether users scrutinise it at all." >&2
  echo "[commit-gate]   Record it:  $0 record --session $SESSION --judgement -" >&2
  exit 2
fi

VALID="$(python3 - "$PRIOR" <<'PY' 2>/dev/null || echo INVALID
import json, sys
try:
    d = json.load(open(sys.argv[1]))
except Exception:
    print("INVALID"); raise SystemExit(0)
ok = (isinstance(d, dict)
      and isinstance(d.get("judgement"), str)
      and len("".join(d["judgement"].split())) >= 20
      and d.get("recorded_before_analysis") is True)
print("OK" if ok else "INVALID")
PY
)"

if [ "$VALID" != "OK" ]; then
  echo "[commit-gate] REFUSED: the judgement record is missing, malformed, or too short." >&2
  echo "[commit-gate]   A record that cannot be read is not a recorded judgement." >&2
  exit 2
fi

echo "[commit-gate] PASS: a prior judgement is on record — reveal permitted." >&2
exit 0
