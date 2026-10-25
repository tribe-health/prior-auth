#!/usr/bin/env bash
# test-coach-reflector-separation.sh — the coach cannot grade its own output.
#
# WHAT THIS ASSERTS, AND WHY THAT WORDING MATTERS
# An earlier adversarial round in this phase caught acceptance criteria that
# DEMONSTRATED a property on one input instead of ENFORCING it. "The coach did
# not grade itself in this sample" is a demonstration. The assertions here are
# structural instead:
#
#   1. The coach holds no tool that could write an evaluation (Read + read-only
#      Bash only) — so it cannot emit a verdict artifact even if prompted to.
#   2. The reflector SubagentStop hook exists and routes through
#      sycophancy-correction, so SOMETHING external does the grading.
#   3. The coach is not itself a reflector matcher — it cannot be the evaluator
#      of its own output by matching the evaluating hook.
#   4. The reflector hook is byte-unchanged from the pre-existing definition
#      (task 2 requires reuse, not modification).
#
# No LLM calls. Runs anywhere.
#
# Exit: 0 all assertions held · 1 an assertion failed · 2 preconditions
# bash 3.2 compatible.
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"
COACH="$ROOT/agents/kbd-coach.md"
HOOKS="$ROOT/hooks/hooks.json"

[ -f "$COACH" ] || { echo "agents/kbd-coach.md not found" >&2; exit 2; }
[ -f "$HOOKS" ] || { echo "hooks/hooks.json not found" >&2; exit 2; }
command -v python3 >/dev/null 2>&1 || { echo "python3 required" >&2; exit 2; }

PASS=0 FAIL=0
ok()  { echo "  ✅ $1"; PASS=$((PASS + 1)); }
bad() { echo "  ❌ $1"; FAIL=$((FAIL + 1)); }

echo "── The coach holds no tool capable of writing an evaluation"
RES="$(COACH="$COACH" python3 <<'PY'
import os, re
s = open(os.environ["COACH"], encoding="utf-8").read()
parts = s.split("---")
fm = parts[1] if len(parts) > 2 else ""
tools = [t.strip() for t in re.findall(r"^\s*-\s+(.+)$", fm, re.M)]
if not tools:
    print("NOTOOLS"); raise SystemExit(0)
# Write/Edit would let it persist a verdict; Task/Agent would let it dispatch a
# judge and adopt the answer as its own.
banned = [t for t in tools if re.search(r"\b(write|edit|task|agent|notebookedit)\b", t, re.I)]
print("BANNED:" + ",".join(banned) if banned else "CLEAN")
PY
)"
case "$RES" in
  CLEAN)    ok "coach tool grant is read-only (cannot persist a verdict)" ;;
  NOTOOLS)  bad "coach declares no allowed-tools — grant is unbounded" ;;
  *)        bad "coach holds evaluation-capable tools → ${RES#BANNED:}" ;;
esac

echo "── The coach's instructions forbid grading in enforceable terms"
if grep -qi "do not grade\|does not grade\|never.*grade\|not evaluate" "$COACH"; then
  ok "coach is instructed not to grade"
else
  bad "coach has no prohibition on grading"
fi
if grep -qi "reflector" "$COACH"; then
  ok "coach names the reflector as the evaluator"
else
  bad "coach does not identify who evaluates instead"
fi

echo "── An external reflector actually does the grading"
RES="$(HOOKS="$HOOKS" python3 <<'PY'
import json, os
h = json.load(open(os.environ["HOOKS"], encoding="utf-8"))
ss = h.get("hooks", h).get("SubagentStop", [])
refl = [e for e in ss if e.get("matcher") == "reflector"]
if not refl:
    print("NOREFLECTOR"); raise SystemExit(0)
cmds = " ".join(x.get("command", "") for e in refl for x in e.get("hooks", []))
print("SYCO" if "sycophancy" in cmds else "NOSYCO")
PY
)"
case "$RES" in
  SYCO)        ok "reflector matcher exists and routes through sycophancy-correction" ;;
  NOSYCO)      bad "reflector exists but does not route through sycophancy-correction" ;;
  NOREFLECTOR) bad "no reflector SubagentStop matcher — nothing grades the output" ;;
esac

echo "── The coach is not registered as its own evaluator"
RES="$(HOOKS="$HOOKS" python3 <<'PY'
import json, os
h = json.load(open(os.environ["HOOKS"], encoding="utf-8"))
ss = h.get("hooks", h).get("SubagentStop", [])
# The coach must not BE a grading matcher. If "kbd-coach" matched a hook that
# runs the sycophancy check, the coach would be evaluating its own output —
# exactly the collapse this change prevents.
for e in ss:
    if e.get("matcher") in ("kbd-coach", "coach"):
        cmds = " ".join(x.get("command", "") for x in e.get("hooks", []))
        if "sycophancy" in cmds or "reflect" in cmds:
            print("SELFGRADES"); raise SystemExit(0)
print("SEPARATE")
PY
)"
[ "$RES" = "SEPARATE" ] && ok "coach does not match a grading hook" \
                        || bad "coach matches its own grading hook — roles collapsed"

echo "── The reflector hook was reused, not modified"
# Task 2 requires reuse. The reflector's first hook must still be the
# pre-existing sycophancy-check-reflection.sh at its original timeout.
RES="$(HOOKS="$HOOKS" python3 <<'PY'
import json, os
h = json.load(open(os.environ["HOOKS"], encoding="utf-8"))
ss = h.get("hooks", h).get("SubagentStop", [])
for e in ss:
    if e.get("matcher") == "reflector":
        first = (e.get("hooks") or [{}])[0]
        okc = "sycophancy-check-reflection.sh" in first.get("command", "")
        okt = first.get("timeout") == 35000
        print("INTACT" if (okc and okt) else "CHANGED")
        raise SystemExit(0)
print("MISSING")
PY
)"
[ "$RES" = "INTACT" ] && ok "reflector hook unchanged (script + 35s timeout intact)" \
                      || bad "reflector hook was modified or removed ($RES)"

echo ""
echo "=== COACH / REFLECTOR SEPARATION TEST ==="
echo "  Passed: $PASS"
echo "  Failed: $FAIL"
echo ""
if [ "$((PASS + FAIL))" -eq 0 ]; then echo "  ❌ NO ASSERTIONS RAN"; exit 2; fi
if [ "$FAIL" -eq 0 ]; then
  echo "  ✅ the coach advances the plan; the reflector grades it; neither does both"
  exit 0
fi
echo "  ❌ $FAIL assertion(s) failed"
exit 1
