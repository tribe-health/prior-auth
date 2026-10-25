#!/usr/bin/env bash
# test-research-target.sh — the research packet carries what the judge needs,
# refuses what it cannot judge, and records when it cut something.
#
# The assertion that matters is not "a packet was written". It is that the three
# files a report cannot be judged without (report.md, the provenance sidecar,
# plan.md) are PRESENT as separate fields, that a package missing any one of them
# is REFUSED (exit 2) rather than packed thin, and that truncation is recorded
# so a judge can never return PASS on material it did not receive.
#
# No judge calls. Runs anywhere with jq and python3.
#
# Exit: 0 all assertions held · 1 an assertion failed · 2 preconditions
# bash 3.2 compatible.
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
BUILD="$HERE/../scripts/build-review-packet.sh"
FIXTURE="$HERE/../../../research/deep-research/tests/fixtures/package-labelled"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/research-target-test.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

[ -f "$BUILD" ] || { echo "build-review-packet.sh not found" >&2; exit 2; }
[ -d "$FIXTURE" ] || { echo "labelled fixture package not found: $FIXTURE" >&2; exit 2; }
command -v jq >/dev/null 2>&1 || { echo "jq required" >&2; exit 2; }
command -v python3 >/dev/null 2>&1 || { echo "python3 required" >&2; exit 2; }

PASS=0 FAIL=0
ok()  { echo "  ✅ $1"; PASS=$((PASS + 1)); }
bad() { echo "  ❌ $1"; FAIL=$((FAIL + 1)); }

export KBD_PRODUCER_MODEL="fixture/producer"

# ── 1. The labelled fixture packs the three files as separate fields ─────────
if bash "$BUILD" --mode artifact --target research --package "$FIXTURE" --out "$WORK/packet.json" 2>"$WORK/build.log"; then
  ok "packet builds for the labelled fixture (no --phase needed)"
else
  bad "packet build failed: $(tail -1 "$WORK/build.log")"
fi
for key in research_report research_provenance research_plan; do
  if jq -e --arg k "$key" '.[$k] | type == "string" and length > 0' "$WORK/packet.json" >/dev/null 2>&1; then
    ok "$key present and non-empty"
  else
    bad "$key missing or empty"
  fi
done
if jq -e '.target == "research" and .mode == "artifact"' "$WORK/packet.json" >/dev/null 2>&1; then ok "mode artifact, target research"; else bad "mode/target wrong"; fi
if jq -e '.research_provenance | test("Verification:")' "$WORK/packet.json" >/dev/null 2>&1; then ok "provenance field is the sidecar (carries the Verification line)"; else bad "provenance field is not the sidecar"; fi
if jq -e '.goals | test("labelled fixture query") and test("- Q1")' "$WORK/packet.json" >/dev/null 2>&1; then ok "goals carry the query and the sub-questions from plan.md"; else bad "goals lack the query or sub-questions"; fi
if jq -e '.review_focus | type == "string" and length > 0' "$WORK/packet.json" >/dev/null 2>&1; then ok "review_focus present"; else bad "review_focus missing"; fi
if jq -e '.truncation.any_truncated == false and (.truncation.cap_bytes_per_field | type == "number")' "$WORK/packet.json" >/dev/null 2>&1; then
  ok "truncation block present and reports nothing cut at the default cap"
else
  bad "truncation block missing or wrong at the default cap"
fi
if jq -e 'has("artifact") | not' "$WORK/packet.json" >/dev/null 2>&1; then ok "no duplicate artifact field (cap applies once per file)"; else bad "duplicate artifact field present"; fi

# ── 2. Truncation is recorded, per field, when a cap is exceeded ─────────────
if PACKET_FIELD_CAP_BYTES=1000 bash "$BUILD" --mode artifact --target research --package "$FIXTURE" --out "$WORK/small.json" 2>"$WORK/small.log"; then
  if jq -e '.truncation.any_truncated == true and (.truncation.fields | length) > 0 and all(.truncation.fields[]; .omitted_bytes > 0)' "$WORK/small.json" >/dev/null 2>&1; then
    ok "a 1000-byte cap records every truncated field with its omitted byte count"
  else
    bad "truncation not recorded under a small cap"
  fi
  if jq -r '.truncation.fields[].field' "$WORK/small.json" | xargs -I{} jq -e --arg k {} '.[$k] | test("\\[TRUNCATED by build-review-packet.sh")' "$WORK/small.json" >/dev/null 2>&1; then
    ok "every truncated field carries the inline TRUNCATED marker the judge reads"
  else
    bad "a truncated field lacks the inline marker"
  fi
else
  bad "packet build failed under a small cap"
fi

# ── 3. A package missing any of the three files is refused, not packed thin ──
for missing in report.md plan.md provenance; do
  rm -rf "$WORK/thin"; cp -R "$FIXTURE" "$WORK/thin"
  case "$missing" in
    provenance) rm -f "$WORK/thin"/*.provenance.md ;;
    *) rm -f "$WORK/thin/$missing" ;;
  esac
  bash "$BUILD" --mode artifact --target research --package "$WORK/thin" --out "$WORK/thin.json" >/dev/null 2>"$WORK/thin.log"; rc=$?
  if [ "$rc" -eq 2 ] && [ ! -f "$WORK/thin.json" ]; then
    ok "missing $missing → exit 2 and no packet written"
  else
    bad "missing $missing → exit $rc (expected 2, no packet)"
  fi
done

# ── 4. Usage errors fail closed ──────────────────────────────────────────────
bash "$BUILD" --mode artifact --target research --out "$WORK/nopkg.json" >/dev/null 2>&1; rc=$?
if [ "$rc" -eq 1 ]; then ok "--target research without --package → exit 1"; else bad "no --package → exit $rc (expected 1)"; fi
bash "$BUILD" --mode artifact --target research --package "$WORK/does-not-exist" >/dev/null 2>&1; rc=$?
if [ "$rc" -eq 2 ]; then ok "nonexistent --package → exit 2"; else bad "nonexistent package → exit $rc (expected 2)"; fi

echo ""
echo "=== research-target: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
