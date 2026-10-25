#!/usr/bin/env bash
# test-decision-gate.sh — assert the decision gate REJECTS unverified reviews.
#
# The plan's round-1 adversarial review caught the distinction this test exists to
# hold: proving that one artifact CAN carry `verified-distinct` is not the same
# property as proving every decision artifact MUST. Demonstration is not enforcement.
#
# Makes NO judge calls — every case is a synthetic artifact — so this runs anywhere
# and costs nothing.
#
# Exit: 0 all assertions held · 1 an assertion failed · 2 preconditions
# bash 3.2 compatible.
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
GATE="$HERE/../scripts/validate-decision-artifact.sh"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/decision-gate-test.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

[ -f "$GATE" ] || { echo "validate-decision-artifact.sh not found" >&2; exit 2; }
command -v python3 >/dev/null 2>&1 || { echo "python3 required" >&2; exit 2; }

PASS=0 FAIL=0
ok()  { echo "  ✅ $1"; PASS=$((PASS + 1)); }
bad() { echo "  ❌ $1"; FAIL=$((FAIL + 1)); }

art() { # art <file> <mode> <cross_model_check|OMIT>
  if [ "$3" = "OMIT" ]; then
    printf '{"mode":"%s","verdict":"PASS","judge_model":"kbd-judge","isolation_mode":"rest-gateway","findings":[]}\n' "$2" > "$1"
  else
    printf '{"mode":"%s","verdict":"PASS","judge_model":"kbd-judge","isolation_mode":"rest-gateway","cross_model_check":"%s","findings":[]}\n' "$2" "$3" > "$1"
  fi
}

expect() { # expect <label> <file> <wanted-exit>
  bash "$GATE" --findings "$2" >/dev/null 2>&1
  local rc=$?
  if [ "$rc" -eq "$3" ]; then ok "$1 (exit $rc)"; else bad "$1 — exit $rc, expected $3"; fi
}

echo "── A decision must be judged cross-model"

art "$WORK/good.json" decision verified-distinct
expect "verified-distinct is accepted" "$WORK/good.json" 0

art "$WORK/collision.json" decision same-model-collision
expect "same-model-collision is REJECTED" "$WORK/collision.json" 2

art "$WORK/unknown.json" decision unverified-producer-unknown
expect "unverified-producer-unknown is REJECTED" "$WORK/unknown.json" 2

art "$WORK/absent.json" decision OMIT
expect "absent cross_model_check is REJECTED" "$WORK/absent.json" 2

# A value this gate does not recognise must fail closed. A future state silently
# treated as acceptable is how a gate stops gating.
art "$WORK/weird.json" decision some-future-state
expect "unrecognised value is REJECTED" "$WORK/weird.json" 2

echo "── A verdict of PASS does not exempt an unverified review"
printf '{"mode":"decision","verdict":"PASS","judge_model":"kbd-judge","isolation_mode":"rest-gateway","cross_model_check":"same-model-collision","findings":[]}\n' > "$WORK/passcollide.json"
expect "PASS + collision still REJECTED" "$WORK/passcollide.json" 2

echo "── Other modes keep the honest-record behaviour"
for m in diff artifact skill agent; do
  art "$WORK/$m.json" "$m" same-model-collision
  expect "mode=$m + collision is not rejected here" "$WORK/$m.json" 0
done

echo "── Unreadable input fails closed"
printf '{"mode":"decision",' > "$WORK/broken.json"
expect "malformed JSON is REJECTED" "$WORK/broken.json" 2
printf 'not json at all\n' > "$WORK/notjson.json"
expect "non-JSON is REJECTED" "$WORK/notjson.json" 2

echo "── Usage errors are distinguishable from rejections"
bash "$GATE" >/dev/null 2>&1
[ $? -eq 1 ] && ok "missing --findings exits 1, not 2" || bad "missing --findings did not exit 1"
bash "$GATE" --findings "$WORK/does-not-exist.json" >/dev/null 2>&1
[ $? -eq 1 ] && ok "missing file exits 1, not 2" || bad "missing file did not exit 1"

echo "── Rejection explains itself"
art "$WORK/msg.json" decision same-model-collision
# Capture to a file first. Under `set -o pipefail` the gate's deliberate exit 2
# propagates as the PIPELINE status and masks grep's success, so
# `gate | grep -q ...` reports failure against a perfectly correct message. That
# is what the first version of this assertion did.
bash "$GATE" --findings "$WORK/msg.json" >"$WORK/msg.out" 2>&1 || true
if grep -q "judge WAS the producer" "$WORK/msg.out"; then
  ok "collision rejection names the cause"
else
  bad "collision rejection did not explain itself"
fi

echo ""
echo "=== DECISION GATE TEST ==="
echo "  Passed: $PASS"
echo "  Failed: $FAIL"
echo ""
if [ "$((PASS + FAIL))" -eq 0 ]; then
  echo "  ❌ NO ASSERTIONS RAN"
  exit 2
fi
if [ "$FAIL" -eq 0 ]; then
  echo "  ✅ decision artifacts must be cross-model verified"
  exit 0
fi
echo "  ❌ $FAIL assertion(s) failed"
exit 1
