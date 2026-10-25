#!/usr/bin/env bash
# test-decision-log.sh — decisions persist WITH their outcomes.
#
# The assertion that matters is that `revisit` returns the outcome, not just the
# decision. Persisting decisions alone is what all 21 surveyed competitors
# already do; the outcome loop is the differentiator, and a test that only
# checked "an entry was written" would pass without it.
#
# No judge calls. Runs anywhere.
#
# Exit: 0 all assertions held · 1 an assertion failed · 2 preconditions
# bash 3.2 compatible.
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
LOG="$HERE/../scripts/decision-log.sh"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/decision-log-test.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
W="$WORK/wiki"; mkdir -p "$W"

[ -f "$LOG" ] || { echo "decision-log.sh not found" >&2; exit 2; }
command -v python3 >/dev/null 2>&1 || { echo "python3 required" >&2; exit 2; }

PASS=0 FAIL=0
ok()  { echo "  ✅ $1"; PASS=$((PASS + 1)); }
bad() { echo "  ❌ $1"; FAIL=$((FAIL + 1)); }

cat > "$WORK/dec.md" <<'MD'
# Adopt relay-first transport

## Decision
Use a relay as the primary path; treat direct P2P as an optimisation.

## Assumptions
- Cellular CGNAT makes hole-punching unreliable

## Falsifier
Measured relay fallback under 20% on our own handsets.
MD

ID="adopt-relay-first-transport"

echo "── A decision is recorded as an OKF Decision entry, pending"
bash "$LOG" record --decision "$WORK/dec.md" --wiki "$W" >/dev/null 2>&1
ENTRY="$W/$ID.md"
if [ -f "$ENTRY" ]; then ok "entry written"; else bad "entry not written"; fi
grep -q "^type: Decision$"        "$ENTRY" 2>/dev/null && ok "type: Decision"        || bad "type is not Decision"
grep -q "^outcome_status: pending$" "$ENTRY" 2>/dev/null && ok "outcome_status: pending" || bad "outcome_status not pending"

echo "── Re-recording the same decision is refused (no duplicates)"
bash "$LOG" record --decision "$WORK/dec.md" --wiki "$W" >/dev/null 2>&1
[ $? -eq 2 ] && ok "duplicate record refused (exit 2)" || bad "duplicate record was not refused"
N="$(ls "$W"/*.md 2>/dev/null | wc -l | tr -d ' ')"
[ "$N" = "1" ] && ok "still exactly 1 entry" || bad "$N entries after re-record"

echo "── Before an outcome, revisit says PENDING rather than implying success"
OUT="$(bash "$LOG" revisit --topic relay --wiki "$W" 2>&1)"
printf '%s' "$OUT" | grep -q "PENDING" && ok "pending decision marked PENDING" || bad "pending state not surfaced"

echo "── An outcome attaches to the decision"
printf 'Measured 71 percent relay fallback over three weeks; relay-first held.\n' \
  | bash "$LOG" outcome --id "$ID" --result - --wiki "$W" >/dev/null 2>&1
grep -q "^outcome_status: recorded$" "$ENTRY" 2>/dev/null && ok "outcome_status becomes recorded" || bad "outcome_status did not update"
grep -q "^outcome_recorded_at:"      "$ENTRY" 2>/dev/null && ok "outcome timestamp written"       || bad "no outcome timestamp"
# A recorded outcome sitting under "Status: pending" prose would make the entry
# contradict itself — the section is replaced, not appended to.
grep -q "Status: pending" "$ENTRY" 2>/dev/null && bad "stale pending prose remains" || ok "pending prose replaced"

echo "── Revisit returns BOTH the decision and its outcome"
OUT="$(bash "$LOG" revisit --topic relay --wiki "$W" 2>&1)"
printf '%s' "$OUT" | grep -q "Adopt relay-first transport" && ok "decision returned" || bad "decision missing"
printf '%s' "$OUT" | grep -q "71 percent relay fallback"    && ok "outcome returned"  || bad "outcome missing — the loop is not closed"
printf '%s' "$OUT" | grep -q "\[recorded\]"                  && ok "status shown"      || bad "status not shown"

echo "── Error paths fail closed"
bash "$LOG" outcome --id does-not-exist --result "something happened here" --wiki "$W" >/dev/null 2>&1
[ $? -eq 2 ] && ok "outcome for unknown decision refused" || bad "outcome for unknown id was accepted"
echo "ok" | bash "$LOG" outcome --id "$ID" --result - --wiki "$W" >/dev/null 2>&1
[ $? -eq 2 ] && ok "too-short outcome refused" || bad "too-short outcome accepted"
OUT="$(bash "$LOG" revisit --topic zzqqxxnothing --wiki "$W" 2>&1)"
printf '%s' "$OUT" | grep -q "No prior decisions" && ok "no-match revisit says so plainly" || bad "no-match revisit unclear"

echo ""
echo "=== DECISION LOG TEST ==="
echo "  Passed: $PASS"
echo "  Failed: $FAIL"
echo ""
if [ "$((PASS + FAIL))" -eq 0 ]; then echo "  ❌ NO ASSERTIONS RAN"; exit 2; fi
if [ "$FAIL" -eq 0 ]; then
  echo "  ✅ decisions persist with their outcomes, and revisit returns both"
  exit 0
fi
echo "  ❌ $FAIL assertion(s) failed"
exit 1
