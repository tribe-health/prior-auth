#!/usr/bin/env bash
# check-findings-sycophancy.sh — anti-theater gate for the adversarial judge's
# own findings report. Catches the failure mode where the reviewer softens
# itself back toward agreement (hedged praise, "no real issues", empty
# findings on substantial input).
#
# Distinct from shared/scripts/sycophancy-check-{reflection,artifact}.sh:
# those gate PMPO reflections/assessments; this gates the JUDGE's report.
#
# Usage:
#   check-findings-sycophancy.sh --findings <findings.json> \
#     [--strictness loose|standard|strict|adversarial] [--counter-key <key>]
#
# Exit codes:
#   0  accepted (or gate unavailable / soft cap reached — logged, never blocks)
#   1  invalid PROMETHEUS_ADV_REJECT_CAP (non-numeric, 0, or above the ceiling)
#   2  rejected — stdout carries feedback for dispatch-judge.sh --feedback
#
# Soft cap per counter-key, mirroring the reflector gate. Defaults to 2 and is
# overridable via PROMETHEUS_ADV_REJECT_CAP, bounded by a hard ceiling of 5.
# bash 3.2 compatible.
set -uo pipefail

FINDINGS="" STRICTNESS="${PROMETHEUS_REFLECT_STRICTNESS:-strict}" KEY="adv-review"
while [ $# -gt 0 ]; do
  case "$1" in
    --findings)    FINDINGS="${2:-}"; shift 2 ;;
    --strictness)  STRICTNESS="${2:-strict}"; shift 2 ;;
    --counter-key) KEY="${2:-adv-review}"; shift 2 ;;
    *) echo "usage: $0 --findings <json> [--strictness <s>] [--counter-key <k>]" >&2; exit 0 ;;
  esac
done
[ -f "$FINDINGS" ] || { echo "[adv-gate] WARN: findings file missing — gate skipped" >&2; exit 0; }
command -v python3 >/dev/null 2>&1 || { echo "[adv-gate] WARN: python3 missing — gate skipped" >&2; exit 0; }

# --- locate the shared sycophancy library -------------------------------------
LIB=""
HERE="$(cd "$(dirname "$0")" && pwd)"
for root in "${CLAUDE_PLUGIN_ROOT:-}" "${PLUGIN_ROOT:-}" "$HERE/../../../.."; do
  [ -n "$root" ] || continue
  cand="$root/shared/scripts/lib/sycophancy.sh"
  [ -f "$cand" ] && { LIB="$cand"; break; }
done
[ -n "$LIB" ] || { echo "[adv-gate] WARN: sycophancy.sh lib not found — gate skipped" >&2; exit 0; }
# shellcheck source=/dev/null
source "$LIB"

syco_find_bin >/dev/null 2>&1 || { echo "[adv-gate] WARN: sycophancy-correction binary absent — gate skipped" >&2; exit 0; }

# --- soft cap: after N consecutive rejections, accept with a warning ----------
#
# The cap was hardcoded to 2, which decided on the operator's behalf in contexts
# the author of the constant never saw. It now reads PROMETHEUS_ADV_REJECT_CAP,
# mirroring how PROMETHEUS_REFLECT_STRICTNESS is consumed.
#
# BOUNDED, not open: a hard ceiling of 5 keeps "overridable" from becoming
# "effectively disabled". A value above the ceiling is an ERROR rather than being
# clamped or ignored, because silently honouring a typo'd 500 would leave the
# operator believing a bound is in force that is not.
#
# This governs ONLY the sycophancy screen — how many times an evasive JUDGE
# REPORT may be sent back. The creators' retry cap (how many times an ARTIFACT is
# re-reviewed after CRITICAL findings) is a different bound owned by
# review-retry-loop.sh and is unaffected. Conflating them would let a lenient
# screen setting silently extend how long a broken artifact keeps being retried.
REJECT_CAP_CEILING=5
REJECT_CAP="${PROMETHEUS_ADV_REJECT_CAP:-2}"
CAP_OVERRIDDEN=false
if [ -n "${PROMETHEUS_ADV_REJECT_CAP:-}" ]; then
  case "$PROMETHEUS_ADV_REJECT_CAP" in
    ''|*[!0-9]*)
      echo "[adv-gate] ERROR: PROMETHEUS_ADV_REJECT_CAP must be a positive integer," >&2
      echo "[adv-gate]        got '$PROMETHEUS_ADV_REJECT_CAP'." >&2
      exit 1 ;;
  esac
  if [ "$PROMETHEUS_ADV_REJECT_CAP" -gt "$REJECT_CAP_CEILING" ]; then
    echo "[adv-gate] ERROR: PROMETHEUS_ADV_REJECT_CAP=$PROMETHEUS_ADV_REJECT_CAP exceeds the" >&2
    echo "[adv-gate]        hard ceiling of $REJECT_CAP_CEILING. Refusing rather than clamping:" >&2
    echo "[adv-gate]        a silently-lowered cap would look like it was honoured." >&2
    exit 1
  fi
  if [ "$PROMETHEUS_ADV_REJECT_CAP" -lt 1 ]; then
    echo "[adv-gate] ERROR: PROMETHEUS_ADV_REJECT_CAP must be at least 1 (got 0)." >&2
    echo "[adv-gate]        A cap of 0 would accept every report without screening it." >&2
    exit 1
  fi
  [ "$PROMETHEUS_ADV_REJECT_CAP" -ne 2 ] && CAP_OVERRIDDEN=true
fi

# --- record the cap in the findings artifact ---------------------------------
# An override that leaves no trace makes a lenient run indistinguishable from a
# strict one after the fact — someone auditing a stored findings.json could not
# tell whether the screen was at its default bound or had been widened. Write it
# into the artifact itself, not just the log, because the log is not kept.
#
# Always recorded, override or not: "cap_overridden: false" and a missing key
# mean different things (the latter is a pre-change artifact).
record_cap() {
  python3 - "$FINDINGS" "$REJECT_CAP" "$CAP_OVERRIDDEN" <<'PY' 2>/dev/null || true
import json, sys
path, cap, overridden = sys.argv[1], int(sys.argv[2]), sys.argv[3] == "true"
try:
    with open(path) as fh:
        d = json.load(fh)
except Exception:
    raise SystemExit(0)          # unreadable artifact: never make it worse
if not isinstance(d, dict):
    raise SystemExit(0)
d["sycophancy_screen"] = {
    "reject_cap": cap,
    "cap_overridden": overridden,
    "cap_default": 2,
}
tmp = path + ".tmp"
with open(tmp, "w") as fh:
    json.dump(d, fh, indent=2)
import os
os.replace(tmp, path)            # atomic: a crash never leaves a half-written artifact
PY
}

COUNTER="$(syco_counter_path "$KEY" 2>/dev/null || true)"
COUNT=0
[ -n "$COUNTER" ] && [ -f "$COUNTER" ] && COUNT="$(cat "$COUNTER" 2>/dev/null || echo 0)"
case "$COUNT" in ''|*[!0-9]*) COUNT=0 ;; esac
if [ "$COUNT" -ge "$REJECT_CAP" ]; then
  echo "[adv-gate] WARN: soft cap reached ($COUNT consecutive rejections, cap $REJECT_CAP) — accepting report; review it manually" >&2

  # Offer the operator the decision the cap used to make for them — but ONLY
  # when there is an operator present to answer.
  #
  # The non-interactive path is the one that matters. This script runs inside
  # SubagentStop hooks and CI jobs where stdin is not a terminal; a prompt there
  # would block forever, and a gate that hangs the pipeline gets disabled, which
  # is strictly worse than a cap that is occasionally too tight. So: prompt only
  # on a TTY, once, with a timeout, defaulting to accept on every failure mode
  # (no TTY, timeout, EOF, empty answer).
  if [ -t 0 ] && [ -t 2 ] && [ "${PROMETHEUS_ADV_NO_PROMPT:-0}" != "1" ]; then
    printf '[adv-gate] Continue rejecting past the cap of %s? [y/N] ' "$REJECT_CAP" >&2
    ANSWER=""
    # -t 30: an unattended terminal (a detached tmux pane, a forgotten window)
    # must not stall the run either. Timing out takes the default.
    if read -r -t 30 ANSWER 2>/dev/null; then :; else ANSWER=""; fi
    case "$ANSWER" in
      y|Y|yes|YES)
        echo "[adv-gate] operator chose to keep rejecting — cap overridden for this run" >&2
        CAP_OVERRIDDEN=true
        REJECT_CAP=$((COUNT + 1))   # allow exactly one more rejection, not unbounded
        ;;
      *)
        echo "[adv-gate] accepting at the cap (default)" >&2
        [ -n "$COUNTER" ] && rm -f "$COUNTER" 2>/dev/null
        record_cap
        exit 0
        ;;
    esac
  else
    [ -n "$COUNTER" ] && rm -f "$COUNTER" 2>/dev/null
    record_cap
    exit 0
  fi
fi

# --- deterministic theater check: empty findings need a due-diligence trail ---
# The sycophancy detector scores *language* patterns; a terse empty report can
# score 0.0 while still being pure rubber-stamp. The mandate requires
# zero-finding reports to enumerate checked_classes — enforce it here.
EMPTY_NO_TRAIL="$(python3 - "$FINDINGS" <<'PY' 2>/dev/null || echo 0
import json, sys
d = json.load(open(sys.argv[1]))
print(1 if not (d.get("findings") or []) and not (d.get("checked_classes") or []) else 0)
PY
)"
if [ "$EMPTY_NO_TRAIL" = "1" ]; then
  NEXT=$((COUNT + 1))
  [ -n "$COUNTER" ] && { mkdir -p "$(dirname "$COUNTER")" 2>/dev/null; printf '%s' "$NEXT" > "$COUNTER" 2>/dev/null; }
  echo "[adv-gate] REJECTED (zero findings with no checked_classes trail, rejection $NEXT/$REJECT_CAP)" >&2
  cat <<'EOF'
Your previous findings report was rejected: it reported zero findings without
a due-diligence trail. A zero-finding report MUST include a non-empty
top-level "checked_classes" array enumerating each failure class you checked
and why it does not apply to this packet. Re-examine the packet; if you still
find nothing, prove the work.
EOF
  record_cap
  exit 2
fi

# --- render the report as prose for pattern analysis --------------------------
REPORT_TEXT="$(python3 - "$FINDINGS" <<'PY' 2>/dev/null || true
import json, sys
d = json.load(open(sys.argv[1]))
lines = [
    "Adversarial review report (mode=%s, verdict=%s)" % (d.get("mode"), d.get("verdict")),
    "Finding count: %d" % len(d.get("findings") or []),
]
for f in d.get("findings") or []:
    line = "%s %s:%s — %s. Evidence: %s" % (
        f.get("severity"), f.get("file", "?"), f.get("line", "?"),
        f.get("claim", ""), f.get("evidence", ""))
    if f.get("suggested_fix"):
        line += " Suggested fix: %s" % f["suggested_fix"]
    if f.get("resolution"):
        line += " Resolution: %s" % f["resolution"]
    lines.append(line)
if not d.get("findings"):
    lines.append("No findings were reported. Checked classes: %s"
                 % "; ".join(d.get("checked_classes") or []))
print("\n".join(lines))
PY
)"
[ -n "$REPORT_TEXT" ] || { echo "[adv-gate] WARN: could not render findings — gate skipped" >&2; exit 0; }

MCP_STRICTNESS="$(syco_map_strictness "$STRICTNESS")"
RESPONSE="$(syco_analyze "$REPORT_TEXT" "$MCP_STRICTNESS" 2>/dev/null || true)"
[ -n "$RESPONSE" ] || { echo "[adv-gate] WARN: sycophancy analysis produced no response — gate skipped" >&2; exit 0; }

SCORE="$(syco_score "$RESPONSE")"
CRITICAL="$(syco_critical "$RESPONSE")"

# S-03 (Caveat Collapse) exemption for substantive reports: S-03 flags text
# that lacks caveat/engagement vocabulary, a heuristic tuned for prose
# reflections. A report that enumerates >=1 concrete finding is structurally
# the opposite of caveat collapse — every finding IS surfaced friction — yet
# terse technical claims often miss the word lists (observed: warning-only
# reports rejected S-03:high while scoring ~0.08). Drop S-03 from the
# high/critical set when findings are present; the score gate and every other
# pattern still apply, and zero-finding reports keep full S-03 scrutiny.
N_FINDINGS="$(python3 - "$FINDINGS" <<'PY' 2>/dev/null || echo 0
import json, sys
print(len(json.load(open(sys.argv[1])).get("findings") or []))
PY
)"
case "$N_FINDINGS" in ''|*[!0-9]*) N_FINDINGS=0 ;; esac
if [ "$N_FINDINGS" -ge 1 ] && [ -n "$CRITICAL" ]; then
  # shellcheck disable=SC2086
  CRITICAL="$(printf '%s\n' $CRITICAL | grep -v '^S-03:' | tr '\n' ' ' | sed 's/ *$//')"
fi

# Shared decision rule (score threshold + critical floor + S-08 always-reject)
# instead of the legacy "any high/critical rejects" — see syco_should_reject
# in shared/scripts/lib/sycophancy.sh for the rationale. Zero-finding reports
# keep the legacy any-critical mode: with no substance on the table, a lone
# high/critical language hit (e.g. S-03 on a flattery-only checked_classes
# trail) is exactly the theater this gate exists to catch.
if [ "$N_FINDINGS" -eq 0 ]; then
  DECISION="$(PROMETHEUS_SYCO_CRITICAL_ALWAYS=1 syco_should_reject "${SCORE:-}" "${CRITICAL:-}")"
else
  DECISION="$(syco_should_reject "${SCORE:-}" "${CRITICAL:-}")"
fi
REJECT=""
if [ "$(printf '%s\n' "$DECISION" | sed -n 1p)" = "1" ]; then
  REJECT="$(printf '%s\n' "$DECISION" | sed -n 2p)"
  [ -n "$REJECT" ] || REJECT="sycophancy gate rejected (score=${SCORE:-?}, patterns=${CRITICAL:-none})"
fi

if [ -n "$REJECT" ]; then
  NEXT=$((COUNT + 1))
  [ -n "$COUNTER" ] && { mkdir -p "$(dirname "$COUNTER")" 2>/dev/null; printf '%s' "$NEXT" > "$COUNTER" 2>/dev/null; }
  echo "[adv-gate] REJECTED ($REJECT, strictness=$STRICTNESS, rejection $NEXT/$REJECT_CAP)" >&2
  cat <<EOF
Your previous findings report was rejected as insufficiently critical
($REJECT). Re-examine the packet with these requirements:
- Every claim of correctness must cite specific evidence from the diff or artifact.
- If you report zero findings, you must enumerate the specific failure classes
  you checked for and why each does not apply — generic reassurance is not
  acceptable.
- Remove hedged praise; report problems plainly with severity, file, and evidence.
EOF
  record_cap
  exit 2
fi

[ -n "$COUNTER" ] && rm -f "$COUNTER" 2>/dev/null
record_cap
echo "[adv-gate] PASS (score=${SCORE:-unknown}, strictness=$STRICTNESS)" >&2
exit 0
