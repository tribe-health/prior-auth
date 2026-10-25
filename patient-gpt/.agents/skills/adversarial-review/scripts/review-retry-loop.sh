#!/usr/bin/env bash
# review-retry-loop.sh — bounded CRITICAL retry loop shared by both creators.
#
# The loop shape is identical for the skill creator (change-arc-004) and the
# agent creator (change-arc-005), so it lives in ONE place. Two prose copies of
# "cap at 2 rounds" in two prompt files would drift the moment either is edited,
# and the drift would be invisible until a creator looped forever or stopped at
# one round without saying so.
#
# Usage — call once per round, and let it tell you what to do next:
#   review-retry-loop.sh state   --findings <json> --round <n>
#     prints one of: PROCEED | RETRY | CAPPED
#   review-retry-loop.sh unresolved --findings <json> --round <n> [--out <md>]
#     emits the "## Unresolved review findings" section for a CAPPED result
#
# Exit codes:
#   0  PROCEED — no CRITICAL findings; the artifact may be declared ready
#   3  RETRY   — CRITICAL findings and rounds remain; fix and re-review
#   4  CAPPED  — CRITICAL findings survived the cap; artifact is NOT clean
#   1  usage
#
# bash 3.2 compatible. No LLM calls.
set -uo pipefail

# The retry cap. Deliberately NOT the same knob as the sycophancy screen's
# rejection cap (PROMETHEUS_ADV_REJECT_CAP, made overridable by change-arc-007):
# that one bounds how many times a JUDGE REPORT may be sent back for being
# evasive; this one bounds how many times an ARTIFACT may be re-reviewed after
# CRITICAL findings. Conflating them would let a lenient screen setting silently
# extend how long a broken artifact keeps getting retried.
MAX_ROUNDS="${PROMETHEUS_ADV_RETRY_ROUNDS:-2}"
case "$MAX_ROUNDS" in ''|*[!0-9]*) MAX_ROUNDS=2 ;; esac
[ "$MAX_ROUNDS" -ge 1 ] || MAX_ROUNDS=2

CMD="${1:-}"; shift 2>/dev/null || true
FINDINGS="" ROUND="" OUT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --findings) FINDINGS="${2:-}"; shift 2 ;;
    --round)    ROUND="${2:-}";    shift 2 ;;
    --out)      OUT="${2:-}";      shift 2 ;;
    *) echo "usage: $0 state|unresolved --findings <json> --round <n> [--out <md>]" >&2; exit 1 ;;
  esac
done
case "$CMD" in state|unresolved) ;; *) echo "usage: $0 state|unresolved ..." >&2; exit 1 ;; esac
[ -f "$FINDINGS" ] || { echo "[retry] ERROR: findings file not found: $FINDINGS" >&2; exit 1; }
case "$ROUND" in ''|*[!0-9]*) echo "[retry] ERROR: --round must be a number" >&2; exit 1 ;; esac
command -v python3 >/dev/null 2>&1 || { echo "[retry] ERROR: python3 required" >&2; exit 1; }

CRITICAL_COUNT="$(python3 - "$FINDINGS" <<'PY' 2>/dev/null || echo -1
import json, sys
try:
    d = json.load(open(sys.argv[1]))
except Exception:
    print(-1); raise SystemExit(0)
f = d.get("findings")
if not isinstance(f, list):
    print(-1); raise SystemExit(0)
print(sum(1 for x in f if isinstance(x, dict)
          and str(x.get("severity", "")).upper() == "CRITICAL"))
PY
)"

# An unreadable findings file is NOT "no criticals". Treating a parse failure as
# a clean result is exactly how a broken pipeline reports success.
if [ "$CRITICAL_COUNT" -lt 0 ]; then
  echo "[retry] ERROR: could not read findings from $FINDINGS — refusing to" >&2
  echo "[retry]        report PROCEED on an unreadable review." >&2
  exit 4
fi

if [ "$CMD" = "state" ]; then
  if [ "$CRITICAL_COUNT" -eq 0 ]; then
    echo "PROCEED"; exit 0
  fi
  if [ "$ROUND" -lt "$MAX_ROUNDS" ]; then
    echo "RETRY"
    echo "[retry] $CRITICAL_COUNT CRITICAL finding(s) after round $ROUND of $MAX_ROUNDS — fix and re-review." >&2
    exit 3
  fi
  echo "CAPPED"
  echo "[retry] $CRITICAL_COUNT CRITICAL finding(s) still present at the $MAX_ROUNDS-round cap." >&2
  echo "[retry] The artifact is NOT clean. Append the Unresolved section and say so." >&2
  exit 4
fi

# --- unresolved: emit the section a capped run MUST carry ---------------------
SECTION="$(ROUND="$ROUND" MAX_ROUNDS="$MAX_ROUNDS" python3 - "$FINDINGS" <<'PY'
import json, os, sys
d = json.load(open(sys.argv[1]))
crit = [x for x in d.get("findings", [])
        if isinstance(x, dict) and str(x.get("severity", "")).upper() == "CRITICAL"]
out = ["## Unresolved review findings", ""]
out.append(
    "%d CRITICAL finding(s) survived the %s-round adversarial retry cap "
    "(stopped after round %s). This artifact is **not clean** — the cap bounds "
    "how long the loop runs, it does not resolve what the judge found."
    % (len(crit), os.environ["MAX_ROUNDS"], os.environ["ROUND"]))
out.append("")
xm = d.get("cross_model_check")
if xm and xm != "verified-distinct":
    out.append("> `cross_model_check: %s` — the judge was not provably distinct "
               "from the producer, so these findings are additionally unverified." % xm)
    out.append("")
for i, c in enumerate(crit, 1):
    loc = c.get("file") or "(unspecified)"
    if c.get("line"):
        loc = "%s:%s" % (loc, c["line"])
    out.append("%d. **%s** — %s" % (i, loc, c.get("claim", "(no claim recorded)")))
    if c.get("evidence"):
        out.append("   - Evidence: %s" % c["evidence"])
    if c.get("suggested_fix"):
        out.append("   - Suggested fix: %s" % c["suggested_fix"])
    out.append("")
print("\n".join(out).rstrip() + "\n")
PY
)" || { echo "[retry] ERROR: failed to render the Unresolved section" >&2; exit 1; }

# `$( ... )` strips trailing newlines, so re-add one explicitly with printf '%s\n'.
# Without it an appended section runs into whatever is written next, and a second
# append would start mid-line — turning a report into unparseable markdown.
if [ -n "$OUT" ]; then
  mkdir -p "$(dirname "$OUT")"
  printf '\n%s\n' "$SECTION" >> "$OUT"
  echo "[retry] appended Unresolved review findings to $OUT" >&2
else
  printf '%s\n' "$SECTION"
fi
exit 0
