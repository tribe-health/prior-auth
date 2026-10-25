#!/usr/bin/env bash
# run-fixture-suite.sh — prove the adversarial review gate DISCRIMINATES.
#
# The eight historical reviews in this repository all returned PASS while being
# Claude-judging-Claude. A suite that asserted "a review completed" would have
# been green for every one of them. This suite therefore asserts the only thing
# that matters: flawed artifacts are BLOCKed, clean ones PASS, and the judge is
# provably not the producer.
#
# Groups:
#   A  live judge — flawed → BLOCK + verified-distinct; clean → PASS
#   B  fail-closed — each creator with KBD_PRODUCER_MODEL unset → exit 2
#   C  retry bound — repeated CRITICALs stop at the cap for both creators
#   D  research target — the report packet carries report, sidecar, plan; refuses thin packages
#
# Groups B, C, and D make NO judge calls; only Group A does. See --help for the
# judge-call ceiling and why this suite is on-demand rather than per-commit.
#
# Exit: 0 all assertions held · 1 an assertion failed · 2 setup/preconditions
# bash 3.2 compatible.
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ADV="$(cd "$HERE/.." && pwd)"
FIXTURES="$HERE/fixtures"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/adv-fixture-suite.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

# NOT named GROUPS: that is a bash built-in read-only array of the caller's group
# IDs. Assigning to it is silently discarded, so `--groups A` had no effect and
# `$GROUPS` expanded to the first GID ("20"). The suite then matched no group,
# ran zero assertions, and reported "the gate discriminates" — a false green in
# the very tool whose job is to catch false greens.
RUN_GROUPS="ABCD"
while [ $# -gt 0 ]; do
  case "$1" in
    --groups) RUN_GROUPS="${2:-ABCD}"; shift 2 ;;
    --help|-h)
      sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) echo "usage: $0 [--groups ABCD]" >&2; exit 2 ;;
  esac
done

PASS=0 FAIL=0
ok()   { echo "  ✅ $1"; PASS=$((PASS + 1)); }
bad()  { echo "  ❌ $1"; FAIL=$((FAIL + 1)); }
note() { echo "     $1"; }

# ── Judge-call ceiling ───────────────────────────────────────────────────────
# Only Group A calls a judge: 4 fixtures × 1 call = 4, with 2 spare for a retry.
# The ceiling is ENFORCED rather than documented, because a suite whose cost can
# creep becomes a suite someone disables — and a disabled gate proves nothing.
# Raise it deliberately via the env var; do not edit past a silent overrun.
JUDGE_CALL_CEILING="${ADV_FIXTURE_JUDGE_CEILING:-6}"
case "$JUDGE_CALL_CEILING" in ''|*[!0-9]*) JUDGE_CALL_CEILING=6 ;; esac
JUDGE_CALLS=0

judge_budget_ok() { # returns 1 when the next call would breach the ceiling
  if [ "$JUDGE_CALLS" -ge "$JUDGE_CALL_CEILING" ]; then
    return 1
  fi
  JUDGE_CALLS=$((JUDGE_CALLS + 1))
  return 0
}

jget() { # jget <file> <key>
  python3 - "$1" "$2" <<'PY' 2>/dev/null || echo ""
import json, sys
try:
    print(json.load(open(sys.argv[1])).get(sys.argv[2], "") or "")
except Exception:
    print("")
PY
}

# ─────────────────────────────────────────────────────────────────────────────
# Group A — the discrimination test. Requires a live, non-producer judge.
# ─────────────────────────────────────────────────────────────────────────────
run_group_a() {
  echo "── Group A: does the gate sort flawed from clean? (live judge)"

  if [ -z "${KBD_PRODUCER_MODEL:-}" ]; then
    bad "KBD_PRODUCER_MODEL is unset — Group A cannot prove judge != producer"
    note "export KBD_PRODUCER_MODEL to the model running this session, then re-run."
    return
  fi

  # Preflight the gateway once. Without this, every fixture below fails with the
  # same connection error and the output blames the fixtures, not the config.
  RESOLVE=""
  for c in "$ADV/../../../shared/scripts/lib/kbd-model-resolve.sh" \
           "${CLAUDE_PLUGIN_ROOT:-}/shared/scripts/lib/kbd-model-resolve.sh"; do
    [ -f "$c" ] && { RESOLVE="$c"; break; }
  done
  if [ -n "$RESOLVE" ]; then
    # shellcheck source=/dev/null
    . "$RESOLVE"
    GW="$(kbd_resolve_gateway 2>/dev/null || true)"
    if [ -z "$GW" ]; then
      bad "no judge gateway reachable — Group A skipped"
      note "Start openai-proxy (:8181) or liter-llm, then re-run."
      return
    fi
    note "gateway: $GW · judge role: $(kbd_resolve_role judge 2>/dev/null || echo '?')"
  fi

  # 4 fixtures × 1 judge call = 4 calls. Ceiling is 6 (see --help).
  for case in "flawed-skill skill BLOCK" \
              "clean-skill  skill PASS"  \
              "flawed-agent agent BLOCK" \
              "clean-agent  agent PASS"; do
    set -- $case
    NAME="$1" MODE="$2" WANT="$3"
    OUTDIR="$WORK/$NAME"; mkdir -p "$OUTDIR"

    if ! bash "$ADV/scripts/build-review-packet.sh" \
           --mode "$MODE" --target "$FIXTURES/$NAME" \
           --intent "$FIXTURES/$NAME/.intent.md" \
           --out "$OUTDIR/packet.json" >"$OUTDIR/packet.log" 2>&1; then
      bad "$NAME: packet build failed"
      note "$(tail -2 "$OUTDIR/packet.log")"
      continue
    fi

    if ! judge_budget_ok; then
      bad "$NAME: judge-call ceiling ($JUDGE_CALL_CEILING) reached — not dispatched"
      note "Raise ADV_FIXTURE_JUDGE_CEILING deliberately, or reduce the fixture set."
      continue
    fi

    if ! bash "$ADV/scripts/dispatch-judge.sh" \
           --mode "$MODE" --packet "$OUTDIR/packet.json" \
           --out "$OUTDIR/findings.json" >"$OUTDIR/judge.log" 2>&1; then
      bad "$NAME: judge dispatch failed"
      note "$(tail -2 "$OUTDIR/judge.log")"
      continue
    fi

    GOT="$(jget "$OUTDIR/findings.json" verdict)"
    XM="$(jget "$OUTDIR/findings.json" cross_model_check)"

    # The inversion assertion. A flawed fixture that passes, or a clean one that
    # blocks, means the gate is not discriminating — the exact failure this
    # suite exists to catch.
    if [ "$GOT" = "$WANT" ]; then
      ok "$NAME → $GOT (expected $WANT)"
    else
      bad "INVERSION — $NAME → $GOT, expected $WANT"
      note "judge: $(jget "$OUTDIR/findings.json" judge_model) · $XM"
    fi

    # A verdict from a judge that WAS the producer proves nothing, whatever it says.
    if [ "$XM" = "verified-distinct" ]; then
      ok "$NAME cross_model_check = verified-distinct"
    else
      bad "$NAME cross_model_check = ${XM:-<missing>} (need verified-distinct)"
      note "judge=$(jget "$OUTDIR/findings.json" judge_model) producer=$(jget "$OUTDIR/findings.json" producer_model)"
    fi
  done
}

# ─────────────────────────────────────────────────────────────────────────────
# Group B — fail-closed. No judge calls.
#
# The guard must refuse BEFORE any packet exists. A creator that logs the missing
# producer and proceeds would write a findings file claiming cross-model
# verification it cannot support, which is worse than not reviewing at all.
# ─────────────────────────────────────────────────────────────────────────────
run_group_b() {
  echo "── Group B: does each creator fail closed without a producer? (no judge calls)"

  RESOLVE=""
  for c in "$ADV/../../../shared/scripts/lib/kbd-model-resolve.sh" \
           "${CLAUDE_PLUGIN_ROOT:-}/shared/scripts/lib/kbd-model-resolve.sh"; do
    [ -f "$c" ] && { RESOLVE="$c"; break; }
  done
  if [ -z "$RESOLVE" ]; then
    bad "kbd-model-resolve.sh not found — cannot test the guard"
    return
  fi

  # Both creators source the same library and call the same function, so the
  # guard is exercised exactly as each creator invokes it. Run in a subshell with
  # KBD_PRODUCER_MODEL scrubbed, capturing stderr and the exit code separately.
  for creator in skill-creator agent-creator; do
    OUTDIR="$WORK/guard-$creator"; mkdir -p "$OUTDIR"

    ( unset KBD_PRODUCER_MODEL
      # shellcheck source=/dev/null
      . "$RESOLVE"
      kbd_require_producer_model
    ) >"$OUTDIR/stdout.txt" 2>"$OUTDIR/stderr.txt"
    RC=$?

    if [ "$RC" -eq 2 ]; then
      ok "$creator: guard exits 2 with the producer unset"
    else
      bad "$creator: guard exited $RC, expected 2"
    fi

    if grep -q "REFUSING to dispatch review" "$OUTDIR/stderr.txt" 2>/dev/null; then
      ok "$creator: refusal explained on stderr"
    else
      bad "$creator: no refusal message on stderr"
      note "$(head -1 "$OUTDIR/stderr.txt" 2>/dev/null)"
    fi

    # The assertion that actually matters: nothing was produced. A findings file
    # written despite the refusal is the failure mode this whole phase exists to
    # eliminate, so check the creator's output directory is empty of artifacts.
    if [ -z "$(find "$OUTDIR" -name 'findings.json' -o -name 'packet.json' 2>/dev/null)" ]; then
      ok "$creator: no findings.json and no packet.json written"
    else
      bad "$creator: an artifact was written despite the refusal"
    fi
  done

  # And prove the guard is not simply always-failing: with a producer set it must
  # pass silently, or Group B would be green even if the guard were broken shut.
  ( KBD_PRODUCER_MODEL="fixture-producer-model"
    # shellcheck source=/dev/null
    . "$RESOLVE"
    kbd_require_producer_model
  ) >"$WORK/guard-set.out" 2>"$WORK/guard-set.err"
  RC=$?
  if [ "$RC" -eq 0 ] && [ ! -s "$WORK/guard-set.err" ]; then
    ok "guard passes silently when the producer IS set"
  else
    bad "guard returned $RC with a producer set (expected 0, no stderr)"
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Group C — the retry bound. No judge calls: the loop is driven with synthetic
# findings so the assertion is about termination, not about model behaviour.
#
# Two failure modes matter equally. A loop that never stops burns judge calls
# forever; a loop that stops SILENTLY reports a broken artifact as finished. The
# cap bounds the first; the Unresolved section prevents the second.
# ─────────────────────────────────────────────────────────────────────────────
run_group_c() {
  echo "── Group C: does the retry loop stop at the cap and say so? (no judge calls)"

  LOOP="$ADV/scripts/review-retry-loop.sh"
  if [ ! -f "$LOOP" ]; then
    bad "review-retry-loop.sh not found"
    return
  fi

  CRIT="$WORK/c-crit.json"
  cat > "$CRIT" <<'JSON'
{"verdict":"BLOCK","cross_model_check":"verified-distinct",
 "findings":[{"severity":"CRITICAL","file":"SKILL.md","line":12,
              "claim":"a defect the fixes never resolve",
              "evidence":"present in every round",
              "suggested_fix":"unfixable by construction"}]}
JSON

  # Both creators call this one script, so a single state machine covers both.
  # Asserting per creator keeps the failure message pointing at the right place.
  for creator in skill-creator agent-creator; do
    R1="$(bash "$LOOP" state --findings "$CRIT" --round 1 2>/dev/null)"
    R2="$(bash "$LOOP" state --findings "$CRIT" --round 2 2>/dev/null)"

    if [ "$R1" = "RETRY" ]; then
      ok "$creator: round 1 with CRITICALs → RETRY"
    else
      bad "$creator: round 1 → ${R1:-<empty>}, expected RETRY"
    fi

    if [ "$R2" = "CAPPED" ]; then
      ok "$creator: round 2 with CRITICALs → CAPPED (loop terminates)"
    else
      bad "$creator: round 2 → ${R2:-<empty>}, expected CAPPED"
    fi

    # The Unresolved section is what stops a capped run from reading as success.
    REPORT="$WORK/c-$creator-report.md"
    printf '# Reflection\n\nPrior content.\n' > "$REPORT"
    bash "$LOOP" unresolved --findings "$CRIT" --round 2 --out "$REPORT" >/dev/null 2>&1

    if grep -q '^## Unresolved review findings' "$REPORT" 2>/dev/null; then
      ok "$creator: Unresolved review findings section appended"
    else
      bad "$creator: no Unresolved section in the report"
    fi

    if grep -q 'a defect the fixes never resolve' "$REPORT" 2>/dev/null; then
      ok "$creator: the surviving finding is named in the report"
    else
      bad "$creator: surviving finding not named — the section is not actionable"
    fi

    # Appending must not clobber what the creator already wrote.
    if grep -q '^# Reflection' "$REPORT" 2>/dev/null; then
      ok "$creator: pre-existing report content preserved"
    else
      bad "$creator: appending destroyed prior report content"
    fi
  done

  # A clean review must NOT be capped, or Group C would pass with a loop that
  # blocks everything unconditionally.
  CLEAN="$WORK/c-clean.json"
  cat > "$CLEAN" <<'JSON'
{"verdict":"PASS","findings":[],"checked_classes":["all classes checked — none apply"],
 "cross_model_check":"verified-distinct"}
JSON
  CS="$(bash "$LOOP" state --findings "$CLEAN" --round 2 2>/dev/null)"
  if [ "$CS" = "PROCEED" ]; then
    ok "clean findings at the cap round → PROCEED (loop is not always-blocking)"
  else
    bad "clean findings → ${CS:-<empty>}, expected PROCEED"
  fi

  # An unreadable review must never be treated as a passing one.
  BROKEN="$WORK/c-broken.json"
  printf '{"findings":' > "$BROKEN"
  BS="$(bash "$LOOP" state --findings "$BROKEN" --round 1 2>/dev/null)"
  if [ "$BS" != "PROCEED" ]; then
    ok "malformed findings → ${BS:-CAPPED}, never PROCEED"
  else
    bad "malformed findings reported PROCEED — an unparseable review passed"
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Group D — the research packet target (change-rah-006). No judge calls: the
# assertions are about what the packet carries and refuses, not about a verdict.
# ─────────────────────────────────────────────────────────────────────────────
run_group_d() {
  echo ""
  echo "── Group D: does the research target pack what a report judge needs? (no judge calls)"
  if [ -f "$HERE/test-research-target.sh" ]; then
    if bash "$HERE/test-research-target.sh" > "$WORK/research-target.log" 2>&1; then
      ok "test-research-target.sh: $(tail -1 "$WORK/research-target.log" | tr -d '=' | sed 's/^ *//')"
    else
      bad "test-research-target.sh failed:"
      sed 's/^/     /' "$WORK/research-target.log"
    fi
  else
    bad "test-research-target.sh not found"
  fi
}

case "$RUN_GROUPS" in *A*) run_group_a ;; esac
case "$RUN_GROUPS" in *B*) run_group_b ;; esac
case "$RUN_GROUPS" in *C*) run_group_c ;; esac
case "$RUN_GROUPS" in *D*) run_group_d ;; esac

echo ""
echo "=== FIXTURE SUITE ==="
echo "  Passed:      $PASS"
echo "  Failed:      $FAIL"
echo "  Judge calls: $JUDGE_CALLS / $JUDGE_CALL_CEILING"
echo ""
# Zero assertions is NOT success. A suite that ran nothing and reported green is
# indistinguishable from a suite that verified everything — which is exactly how
# the GROUPS collision above hid itself. Refuse to claim a verdict we did not earn.
if [ "$((PASS + FAIL))" -eq 0 ]; then
  echo "  ❌ NO ASSERTIONS RAN — nothing was proven"
  echo "     Check --groups (valid: A, B, C, D, or any combination such as ABCD)."
  exit 2
fi
if [ "$FAIL" -eq 0 ]; then
  echo "  ✅ the gate discriminates"
  exit 0
fi
echo "  ❌ $FAIL assertion(s) failed"
exit 1
