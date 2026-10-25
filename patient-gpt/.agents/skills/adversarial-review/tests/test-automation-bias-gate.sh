#!/usr/bin/env bash
# test-automation-bias-gate.sh — the commit-before-reveal gate cannot be bypassed.
#
# The interesting assertions here are the BYPASS ATTEMPTS. A test that only
# proves the happy path works would pass against a gate that any caller can walk
# around, which is the same "demonstrated but not enforced" mistake an earlier
# adversarial round caught in this phase's plan.
#
# Makes NO judge calls. Runs anywhere.
#
# Exit: 0 all assertions held · 1 an assertion failed · 2 preconditions
# bash 3.2 compatible.
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
GATE="$HERE/../scripts/commit-before-reveal.sh"
SCHEMA="$HERE/../assets/schemas/findings.schema.json"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/ab-gate-test.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

[ -f "$GATE" ]   || { echo "commit-before-reveal.sh not found" >&2; exit 2; }
[ -f "$SCHEMA" ] || { echo "findings.schema.json not found" >&2; exit 2; }
command -v python3 >/dev/null 2>&1 || { echo "python3 required" >&2; exit 2; }

PASS=0 FAIL=0
ok()  { echo "  ✅ $1"; PASS=$((PASS + 1)); }
bad() { echo "  ❌ $1"; FAIL=$((FAIL + 1)); }
expect() { # expect <label> <session> <wanted-exit>
  bash "$GATE" check --session "$2" >/dev/null 2>&1
  local rc=$?
  if [ "$rc" -eq "$3" ]; then ok "$1 (exit $rc)"; else bad "$1 — exit $rc, expected $3"; fi
}

REAL="I believe relay-first is correct because cellular CGNAT makes hole-punching unreliable."

echo "── The gate refuses before a judgement exists"
expect "no session at all is REFUSED" "$WORK/none" 2
mkdir -p "$WORK/empty"
expect "empty session dir is REFUSED" "$WORK/empty" 2

echo "── Bypass attempts must all fail"

# 1. Placeholder text. Satisfies "a judgement exists" while defeating the point.
S="$WORK/placeholder"; mkdir -p "$S"
echo "idk" | bash "$GATE" record --session "$S" --judgement - >/dev/null 2>&1
if [ ! -f "$S/user-judgement.json" ]; then
  ok "placeholder judgement was not recorded at all"
else
  bad "placeholder judgement was accepted"
fi

# 2. Hand-forged record — the caller writes the file itself to skip the prompt.
S="$WORK/forged"; mkdir -p "$S"
printf '{"judgement":"ok","recorded_before_analysis":true}\n' > "$S/user-judgement.json"
expect "hand-forged short judgement is REFUSED" "$S" 2

# 3. The honest-looking forgery: long text, but the flag says it came AFTER
#    the analysis. Ordering is the entire mechanism, so this must fail.
S="$WORK/afterflag"; mkdir -p "$S"
python3 - "$S/user-judgement.json" "$REAL" <<'PY'
import json, sys
json.dump({"judgement": sys.argv[2], "confidence": 70,
           "recorded_before_analysis": False}, open(sys.argv[1], "w"))
PY
expect "judgement recorded AFTER analysis is REFUSED" "$S" 2

# 4. Truncated/corrupt record must fail closed, not open.
S="$WORK/corrupt"; mkdir -p "$S"
printf '{"judgement":' > "$S/user-judgement.json"
expect "corrupt record is REFUSED" "$S" 2

# 5. Wrong type where a string is expected.
S="$WORK/wrongtype"; mkdir -p "$S"
printf '{"judgement":42,"recorded_before_analysis":true}\n' > "$S/user-judgement.json"
expect "non-string judgement is REFUSED" "$S" 2

echo "── A genuine judgement permits reveal"
S="$WORK/good"; mkdir -p "$S"
printf '%s\n' "$REAL" | bash "$GATE" record --session "$S" --judgement - --confidence 65 >/dev/null 2>&1
expect "recorded judgement permits reveal" "$S" 0

if python3 -c "
import json,sys
d=json.load(open('$S/user-judgement.json'))
sys.exit(0 if d.get('confidence')==65 and d.get('recorded_before_analysis') is True else 1)" 2>/dev/null; then
  ok "record captures confidence and the before-analysis flag"
else
  bad "record did not capture confidence / ordering flag"
fi

echo "── Refusals explain the mechanism, not just the failure"
bash "$GATE" check --session "$WORK/none" >"$WORK/msg.out" 2>&1 || true
if grep -q "before you" "$WORK/msg.out" || grep -q "commit your own view" "$WORK/msg.out"; then
  ok "refusal explains why ordering matters"
else
  bad "refusal did not explain the mechanism"
fi

echo "── Decision artifacts must carry the countermeasure fields"
SCHEMA_RESULT="$(python3 - "$SCHEMA" <<'PY' 2>/dev/null || echo ERROR
import json, sys
try:
    import jsonschema
except ImportError:
    print("SKIP"); raise SystemExit(0)
s = json.load(open(sys.argv[1]))
base = {"mode": "decision", "verdict": "PASS", "judge_model": "j",
        "isolation_mode": "rest-gateway", "cross_model_check": "verified-distinct",
        "findings": [], "confidence": 70,
        "what_would_change_this": "a measured relay rate under 20%",
        "disconfirming": ["vendor convergence may reflect cost, not necessity"]}
cases = [(base, True),
         ({k: v for k, v in base.items() if k != "confidence"}, False),
         ({**base, "confidence": "high"}, False),
         ({k: v for k, v in base.items() if k != "what_would_change_this"}, False),
         ({**base, "disconfirming": []}, False)]
for doc, want in cases:
    try:
        jsonschema.validate(doc, s); got = True
    except Exception:
        got = False
    if got != want:
        print("FAIL"); raise SystemExit(0)
print("OK")
PY
)"
case "$SCHEMA_RESULT" in
  OK)   ok "schema enforces confidence / what_would_change_this / disconfirming" ;;
  SKIP) ok "schema check skipped (jsonschema not installed) — not a failure" ;;
  *)    bad "schema does not enforce the countermeasure fields" ;;
esac

echo ""
echo "=== AUTOMATION BIAS GATE TEST ==="
echo "  Passed: $PASS"
echo "  Failed: $FAIL"
echo ""
if [ "$((PASS + FAIL))" -eq 0 ]; then
  echo "  ❌ NO ASSERTIONS RAN"
  exit 2
fi
if [ "$FAIL" -eq 0 ]; then
  echo "  ✅ analysis is withheld until the user commits, and cannot be bypassed"
  exit 0
fi
echo "  ❌ $FAIL assertion(s) failed"
exit 1
