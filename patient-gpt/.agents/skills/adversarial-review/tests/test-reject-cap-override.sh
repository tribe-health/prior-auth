#!/usr/bin/env bash
# test-reject-cap-override.sh — the sycophancy screen's rejection cap.
#
# Separate from run-fixture-suite.sh on purpose. That suite proves the GATE
# discriminates and needs a live judge; this one proves a CONFIGURATION contract
# and makes zero model calls, so it is cheap enough to run anywhere. Group C of
# the fixture suite deliberately covers only the creators' retry cap — a
# different bound — and must stay that way, or the two would drift into
# pretending to test each other.
#
# Exit: 0 all assertions held · 1 an assertion failed · 2 preconditions
# bash 3.2 compatible.
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
GATE="$HERE/../scripts/check-findings-sycophancy.sh"
LOOP="$HERE/../scripts/review-retry-loop.sh"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/adv-cap-test.XXXXXX")"

[ -f "$GATE" ] || { echo "check-findings-sycophancy.sh not found" >&2; exit 2; }
command -v python3 >/dev/null 2>&1 || { echo "python3 required" >&2; exit 2; }

# Resolve the real counter path from the shared library rather than guessing it.
# An earlier hand-run of these cases cleared the WRONG directory and produced
# two bogus results (a cap of 1 looking like it did nothing) before the mistake
# was spotted — so the test derives the path instead of hardcoding one.
COUNTER_DIR=""
for root in "${CLAUDE_PLUGIN_ROOT:-}" "${PLUGIN_ROOT:-}" "$HERE/../../../.."; do
  [ -n "$root" ] || continue
  if [ -f "$root/shared/scripts/lib/sycophancy.sh" ]; then
    # shellcheck source=/dev/null
    . "$root/shared/scripts/lib/sycophancy.sh"
    COUNTER_DIR="$(dirname "$(syco_counter_path probe)")"
    break
  fi
done
[ -n "$COUNTER_DIR" ] || { echo "could not resolve the counter directory" >&2; exit 2; }

KEY="captest-$$"
COUNTER="$COUNTER_DIR/$KEY.txt"
cleanup() { rm -rf "$WORK"; rm -f "$COUNTER"; }
trap cleanup EXIT

PASS=0 FAIL=0
ok()  { echo "  ✅ $1"; PASS=$((PASS + 1)); }
bad() { echo "  ❌ $1"; FAIL=$((FAIL + 1)); }

# A zero-finding report with no checked_classes trail: the deterministic
# rejection path, so these assertions never depend on the sycophancy binary
# scoring any particular way.
EMPTY="$WORK/empty.json"
cat > "$EMPTY" <<'JSON'
{"mode":"skill","verdict":"PASS","findings":[],"cross_model_check":"verified-distinct"}
JSON

reset() { rm -f "$COUNTER"; cp "$EMPTY" "$WORK/f.json"; }
run()   { # run <cap-or-empty> -> sets RC and OUT
  reset
  if [ -z "${1:-}" ]; then
    OUT="$(bash "$GATE" --findings "$WORK/f.json" --counter-key "$KEY" </dev/null 2>&1 >/dev/null)"; RC=$?
  else
    OUT="$(PROMETHEUS_ADV_REJECT_CAP="$1" bash "$GATE" --findings "$WORK/f.json" --counter-key "$KEY" </dev/null 2>&1 >/dev/null)"; RC=$?
  fi
}
screen_field() { python3 -c "
import json,sys
try: print(json.load(open('$WORK/f.json')).get('sycophancy_screen',{}).get(sys.argv[1],''))
except Exception: print('')
" "$1" 2>/dev/null; }

echo "── Rejection cap: default and overrides"

run ""
if [ "$RC" -eq 2 ] && printf '%s' "$OUT" | grep -q 'rejection 1/2'; then
  ok "unset → cap 2 (the documented default)"
else
  bad "unset → rc=$RC, expected 2 with 'rejection 1/2'"
fi

for v in 1 3 5; do
  run "$v"
  if [ "$RC" -eq 2 ] && printf '%s' "$OUT" | grep -q "rejection 1/$v"; then
    ok "cap=$v honoured (within the ceiling)"
  else
    bad "cap=$v → rc=$RC, expected 2 with 'rejection 1/$v'"
  fi
done

echo "── Hard ceiling: refuse, never clamp"

for v in 6 500; do
  run "$v"
  if [ "$RC" -eq 1 ] && printf '%s' "$OUT" | grep -q 'exceeds the'; then
    ok "cap=$v rejected as above the ceiling"
  else
    bad "cap=$v → rc=$RC, expected 1 with a ceiling error"
  fi
  # Clamping would be worse than erroring: the operator would believe a bound
  # was honoured that silently became a different one.
  if [ ! -f "$COUNTER" ]; then
    ok "cap=$v did no work before refusing (no counter written)"
  else
    bad "cap=$v wrote a counter despite being invalid"
  fi
done

echo "── Invalid values are errors, not silent fallbacks"

for v in 0 abc 3.5 -1; do
  run "$v"
  if [ "$RC" -eq 1 ]; then
    ok "cap='$v' rejected (rc=1)"
  else
    bad "cap='$v' → rc=$RC, expected 1"
  fi
done

echo "── The cap is recorded in the findings artifact"

run ""
if [ "$(screen_field reject_cap)" = "2" ] && [ "$(screen_field cap_overridden)" = "False" ]; then
  ok "default run records reject_cap=2, cap_overridden=False"
else
  bad "default run recorded cap=$(screen_field reject_cap) overridden=$(screen_field cap_overridden)"
fi

run 4
if [ "$(screen_field reject_cap)" = "4" ] && [ "$(screen_field cap_overridden)" = "True" ]; then
  ok "overridden run records reject_cap=4, cap_overridden=True"
else
  bad "overridden run recorded cap=$(screen_field reject_cap) overridden=$(screen_field cap_overridden)"
fi

# An explicit 2 equals the default, so it is not an override. Recording it as one
# would make an audit of stored artifacts report overrides that never happened.
run 2
if [ "$(screen_field cap_overridden)" = "False" ]; then
  ok "explicit cap=2 is not recorded as an override"
else
  bad "explicit cap=2 recorded as an override"
fi

# Recording must not damage what the judge already wrote.
reset
cat > "$WORK/f.json" <<'JSON'
{"mode":"skill","verdict":"BLOCK","judge_model":"kbd-judge","producer_model":"claude-opus-5",
 "cross_model_check":"verified-distinct",
 "findings":[{"severity":"CRITICAL","file":"SKILL.md","claim":"c","evidence":"e"}]}
JSON
PROMETHEUS_ADV_REJECT_CAP=3 bash "$GATE" --findings "$WORK/f.json" --counter-key "$KEY" </dev/null >/dev/null 2>&1
INTACT="$(python3 -c "
import json
try:
    d = json.load(open('$WORK/f.json'))
    keys = ('mode','verdict','judge_model','producer_model','cross_model_check')
    print(1 if all(k in d for k in keys) and len(d.get('findings') or []) == 1 else 0)
except Exception:
    print(0)")"
if [ "$INTACT" = "1" ]; then
  ok "recording preserves every pre-existing field"
else
  bad "recording damaged the artifact"
fi
if [ ! -f "$WORK/f.json.tmp" ]; then
  ok "atomic write leaves no .tmp behind"
else
  bad ".tmp file left behind"
fi

echo "── Never blocks without a terminal"

reset
printf '2' > "$COUNTER"
START="$(date +%s)"
OUT="$(bash "$GATE" --findings "$WORK/f.json" --counter-key "$KEY" </dev/null 2>&1 >/dev/null)"; RC=$?
ELAPSED=$(( $(date +%s) - START ))
if [ "$RC" -eq 0 ] && [ "$ELAPSED" -lt 5 ]; then
  ok "non-TTY at the cap returns immediately (${ELAPSED}s, rc=0)"
else
  bad "non-TTY at the cap: rc=$RC after ${ELAPSED}s — a hook would have stalled"
fi
if ! printf '%s' "$OUT" | grep -q 'Continue rejecting'; then
  ok "no prompt emitted without a TTY"
else
  bad "prompted without a TTY — CI and hooks would hang"
fi

echo "── Independent of the creators' retry cap"

if [ -f "$LOOP" ]; then
  cat > "$WORK/crit.json" <<'JSON'
{"verdict":"BLOCK","cross_model_check":"verified-distinct",
 "findings":[{"severity":"CRITICAL","file":"x","claim":"c","evidence":"e"}]}
JSON
  S="$(PROMETHEUS_ADV_REJECT_CAP=5 bash "$LOOP" state --findings "$WORK/crit.json" --round 2 2>/dev/null)"
  if [ "$S" = "CAPPED" ]; then
    ok "a widened screen cap does not extend the retry bound"
  else
    bad "retry loop returned '$S' under PROMETHEUS_ADV_REJECT_CAP=5, expected CAPPED"
  fi

  reset
  OUT="$(PROMETHEUS_ADV_RETRY_ROUNDS=5 bash "$GATE" --findings "$WORK/f.json" --counter-key "$KEY" </dev/null 2>&1 >/dev/null)"
  if printf '%s' "$OUT" | grep -q 'rejection 1/2'; then
    ok "the retry knob does not change the screen cap"
  else
    bad "PROMETHEUS_ADV_RETRY_ROUNDS altered the screen cap"
  fi
else
  bad "review-retry-loop.sh not found — cannot prove independence"
fi

echo ""
echo "=== REJECT CAP TEST ==="
echo "  Passed: $PASS"
echo "  Failed: $FAIL"
echo ""
if [ "$((PASS + FAIL))" -eq 0 ]; then
  echo "  ❌ NO ASSERTIONS RAN"
  exit 2
fi
if [ "$FAIL" -eq 0 ]; then
  echo "  ✅ the cap is overridable, bounded, recorded, and non-blocking"
  exit 0
fi
echo "  ❌ $FAIL assertion(s) failed"
exit 1
