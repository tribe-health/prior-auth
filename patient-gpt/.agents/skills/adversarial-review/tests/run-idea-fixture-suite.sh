#!/usr/bin/env bash
# run-idea-fixture-suite.sh — prove the IDEA gate discriminates.
#
# The companion suite (run-fixture-suite.sh) proves the gate sorts flawed from
# clean SKILLS and AGENTS. This one proves it sorts weak from sound IDEAS, which
# is a harder claim: a weak idea is fluent, confident, and superficially
# reasonable. Nothing in its prose looks broken.
#
# The two fixtures therefore share a DOMAIN and a byte-identical stated intent —
# both propose an AI meeting-notes assistant. They differ only in rigor:
# named testable assumptions, a falsifier that could actually kill the idea, and
# engagement with the competitive reality. If the gate sorts them, it is reading
# the reasoning; if it sorted on topic or length, both would land the same way.
#
# Groups:
#   A  live judge — weak → BLOCK + verified-distinct; sound → PASS
#   B  structure  — the packet distinguishes them WITHOUT a judge call
#   C  bypass     — the commit-before-reveal gate (goal 3) cannot be walked around
#
# Only Group A calls a judge. See --help for the ceiling and why this suite is
# on-demand rather than per-commit.
#
# Exit: 0 all assertions held · 1 an assertion failed · 2 setup/preconditions
# bash 3.2 compatible.
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ADV="$(cd "$HERE/.." && pwd)"
FIXTURES="$HERE/fixtures"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/idea-fixture-suite.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

# NOT named GROUPS — that is a read-only bash builtin holding the caller's group
# IDs. Assigning to it is silently discarded; the companion suite shipped that
# bug and reported "the gate discriminates" after running zero assertions.
RUN_GROUPS="ABC"
while [ $# -gt 0 ]; do
  case "$1" in
    --groups) RUN_GROUPS="${2:-ABC}"; shift 2 ;;
    --help|-h) sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "usage: $0 [--groups ABC]" >&2; exit 2 ;;
  esac
done

command -v python3 >/dev/null 2>&1 || { echo "python3 required" >&2; exit 2; }
[ -f "$FIXTURES/weak-idea/decision.md" ]  || { echo "weak-idea fixture missing" >&2; exit 2; }
[ -f "$FIXTURES/sound-idea/decision.md" ] || { echo "sound-idea fixture missing" >&2; exit 2; }

PASS=0 FAIL=0
ok()   { echo "  ✅ $1"; PASS=$((PASS + 1)); }
bad()  { echo "  ❌ $1"; FAIL=$((FAIL + 1)); }
note() { echo "     $1"; }

jget() { python3 -c "
import json,sys
try: print(json.load(open(sys.argv[1])).get(sys.argv[2]) or '')
except Exception: print('')" "$1" "$2" 2>/dev/null; }

# ── Judge-call ceiling ───────────────────────────────────────────────────────
# 2 fixtures × 1 call = 2, with 2 spare for a retry. Enforced, not documented:
# a suite whose cost can creep is a suite someone disables, and a disabled gate
# proves nothing. Raise deliberately via the env var.
JUDGE_CALL_CEILING="${IDEA_FIXTURE_JUDGE_CEILING:-4}"
case "$JUDGE_CALL_CEILING" in ''|*[!0-9]*) JUDGE_CALL_CEILING=4 ;; esac
JUDGE_CALLS=0
judge_budget_ok() {
  if [ "$JUDGE_CALLS" -ge "$JUDGE_CALL_CEILING" ]; then return 1; fi
  JUDGE_CALLS=$((JUDGE_CALLS + 1)); return 0
}

build_packet() { # build_packet <fixture> <outdir>
  bash "$ADV/scripts/build-review-packet.sh" --mode decision \
    --target "$FIXTURES/$1/decision.md" --intent "$FIXTURES/$1/.intent.md" \
    --out "$2/packet.json" >"$2/packet.log" 2>&1
}

# ─────────────────────────────────────────────────────────────────────────────
# Group B — structural. NO judge calls.
#
# Runs first: if the packet cannot even distinguish the fixtures, a judge verdict
# tells us nothing about the gate, and Group A's cost is wasted.
group_B() {
  echo "── Group B — the packet distinguishes the fixtures (no judge calls)"

  for pair in "weak-idea absent" "sound-idea present"; do
    set -- $pair
    NAME="$1" WANT="$2"
    OUT="$WORK/$NAME"; mkdir -p "$OUT"
    if ! build_packet "$NAME" "$OUT"; then
      bad "$NAME: packet build failed"; note "$(tail -2 "$OUT/packet.log")"; continue
    fi

    # A decision that states no falsifier cannot be wrong about anything, which
    # is itself the defect. The packet must surface that without an LLM.
    GOT="$(python3 -c "
import json,sys
d=json.load(open(sys.argv[1])).get('decision_fields') or {}
print('present' if d.get('falsifier') else 'absent')" "$OUT/packet.json" 2>/dev/null)"
    [ "$GOT" = "$WANT" ] && ok "$NAME falsifier $GOT (expected $WANT)" \
                         || bad "$NAME falsifier $GOT, expected $WANT"
  done

  # The fixtures must be confusable on everything EXCEPT rigor. If their intents
  # differ, a judge could sort them on the prompt rather than the reasoning, and
  # the suite would prove nothing about the gate.
  if cmp -s "$FIXTURES/weak-idea/.intent.md" "$FIXTURES/sound-idea/.intent.md"; then
    ok "both fixtures state a byte-identical intent"
  else
    bad "fixture intents differ — a verdict could be sorting on the prompt"
  fi

  WA="$(python3 -c "
import json,sys
print(len((json.load(open(sys.argv[1])).get('decision_fields') or {}).get('assumptions') or []))" "$WORK/weak-idea/packet.json" 2>/dev/null)"
  SA="$(python3 -c "
import json,sys
print(len((json.load(open(sys.argv[1])).get('decision_fields') or {}).get('assumptions') or []))" "$WORK/sound-idea/packet.json" 2>/dev/null)"
  if [ "${SA:-0}" -gt "${WA:-0}" ] 2>/dev/null; then
    ok "sound idea names more assumptions than the weak one ($SA vs $WA)"
  else
    bad "assumption counts do not separate the fixtures ($SA vs $WA)"
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Group A — live judge. THE assertion this suite exists for.
group_A() {
  echo "── Group A — a different model sorts weak from sound (live judge)"

  if [ -z "${KBD_PRODUCER_MODEL:-}" ]; then
    bad "KBD_PRODUCER_MODEL is unset — Group A cannot prove judge != producer"
    note "export KBD_PRODUCER_MODEL to the model running this session, then re-run."
    return
  fi

  . "$ADV/../../../shared/scripts/lib/kbd-model-resolve.sh" 2>/dev/null || true
  GW="$(kbd_resolve_gateway 2>/dev/null)"
  if [ -z "$GW" ]; then
    bad "no judge gateway reachable — Group A skipped"
    note "Start openai-proxy (:8181) or liter-llm, then re-run."
    return
  fi
  note "gateway: $GW · judge role: $(kbd_resolve_role judge 2>/dev/null || echo '?')"

  for case in "weak-idea BLOCK" "sound-idea PASS"; do
    set -- $case
    NAME="$1" WANT="$2"
    OUT="$WORK/$NAME"; mkdir -p "$OUT"
    [ -f "$OUT/packet.json" ] || build_packet "$NAME" "$OUT" || {
      bad "$NAME: packet build failed"; continue; }

    if ! judge_budget_ok; then
      bad "$NAME: judge-call ceiling ($JUDGE_CALL_CEILING) reached — not dispatched"
      note "Raise IDEA_FIXTURE_JUDGE_CEILING deliberately, or reduce the fixture set."
      continue
    fi

    if ! bash "$ADV/scripts/dispatch-judge.sh" --mode decision \
           --packet "$OUT/packet.json" --out "$OUT/findings.json" \
           >"$OUT/judge.log" 2>&1; then
      bad "$NAME: judge dispatch failed"; note "$(tail -2 "$OUT/judge.log")"; continue
    fi

    GOT="$(jget "$OUT/findings.json" verdict)"
    XM="$(jget "$OUT/findings.json" cross_model_check)"

    # The inversion assertion. A weak idea that passes, or a sound one blocked,
    # means the gate is not reading the reasoning.
    if [ "$GOT" = "$WANT" ]; then
      ok "$NAME → $GOT (expected $WANT)"
    else
      bad "INVERSION — $NAME → $GOT, expected $WANT"
      note "judge: $(jget "$OUT/findings.json" judge_model) · $XM"
    fi

    # A verdict from a judge that WAS the producer proves nothing, whatever it says.
    if [ "$XM" = "verified-distinct" ]; then
      ok "$NAME cross_model_check = verified-distinct"
    else
      bad "$NAME cross_model_check = ${XM:-<missing>} (need verified-distinct)"
      note "judge=$(jget "$OUT/findings.json" judge_model) producer=$(jget "$OUT/findings.json" producer_model)"
    fi
  done
}

# ─────────────────────────────────────────────────────────────────────────────
# Group C — the goal-3 gate cannot be bypassed. NO judge calls.
group_C() {
  echo "── Group C — commit-before-reveal cannot be walked around (no judge calls)"
  GATE="$ADV/scripts/commit-before-reveal.sh"
  if [ ! -f "$GATE" ]; then bad "commit-before-reveal.sh missing"; return; fi

  S="$WORK/nogate"
  bash "$GATE" check --session "$S" >/dev/null 2>&1
  [ $? -eq 2 ] && ok "analysis withheld with no recorded judgement (exit 2)" \
               || bad "gate permitted reveal with no judgement recorded"

  # A caller forging the record to skip the prompt must still be refused.
  S="$WORK/forged"; mkdir -p "$S"
  printf '{"judgement":"ok","recorded_before_analysis":true}\n' > "$S/user-judgement.json"
  bash "$GATE" check --session "$S" >/dev/null 2>&1
  [ $? -eq 2 ] && ok "hand-forged short judgement refused" \
               || bad "hand-forged judgement accepted"

  # Ordering IS the mechanism: a judgement recorded after the analysis is not one.
  S="$WORK/after"; mkdir -p "$S"
  python3 -c "
import json,sys
json.dump({'judgement':'I think the wedge is real because tracker write-back is unbundled work.',
           'recorded_before_analysis':False}, open(sys.argv[1],'w'))" "$S/user-judgement.json"
  bash "$GATE" check --session "$S" >/dev/null 2>&1
  [ $? -eq 2 ] && ok "judgement recorded AFTER analysis refused" \
               || bad "post-analysis judgement accepted — ordering not enforced"

  S="$WORK/good"; mkdir -p "$S"
  printf 'I think the write-back wedge is real, because summarisation is already commoditised.\n' \
    | bash "$GATE" record --session "$S" --judgement - --confidence 60 >/dev/null 2>&1
  bash "$GATE" check --session "$S" >/dev/null 2>&1
  [ $? -eq 0 ] && ok "a genuine recorded judgement permits reveal" \
               || bad "gate refused a valid judgement"
}

case "$RUN_GROUPS" in *B*) group_B ;; esac
case "$RUN_GROUPS" in *A*) group_A ;; esac
case "$RUN_GROUPS" in *C*) group_C ;; esac

echo ""
echo "=== IDEA FIXTURE SUITE ==="
echo "  Passed:      $PASS"
echo "  Failed:      $FAIL"
echo "  Judge calls: $JUDGE_CALLS (ceiling $JUDGE_CALL_CEILING)"
echo ""

# Zero assertions is a HARD FAILURE, never a pass. This is exactly how the
# GROUPS builtin collision hid itself in the companion suite: it ran nothing and
# reported success. Refuse to claim a verdict we did not earn.
if [ "$((PASS + FAIL))" -eq 0 ]; then
  echo "  ❌ NO ASSERTIONS RAN — refusing to report success"
  exit 2
fi
if [ "$FAIL" -eq 0 ]; then
  echo "  ✅ the idea gate discriminates: weak ideas BLOCK, sound ideas PASS"
  exit 0
fi
echo "  ❌ $FAIL assertion(s) failed"
exit 1
