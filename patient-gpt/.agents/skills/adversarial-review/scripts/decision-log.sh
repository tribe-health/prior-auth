#!/usr/bin/env bash
# decision-log.sh — persist decisions AND their outcomes in the pk wiki.
#
# Usage:
#   decision-log.sh record  --decision <file> [--wiki <dir>] [--id <slug>]
#   decision-log.sh outcome --id <slug> --result <text|-> [--wiki <dir>]
#   decision-log.sh revisit --topic <text> [--wiki <dir>]
#
# Exit: 0 ok · 1 usage · 2 refused (duplicate, or unknown id on outcome)
#
# WHY OUTCOMES, NOT JUST DECISIONS
# Of 21 commercial idea-validation tools surveyed for this phase, ZERO track
# outcomes over time. Every one is a report vending machine: it scores an idea
# and the session ends.
#
# That gap is not cosmetic. Si, Hashimoto & Yang (2025) showed idea rankings
# FLIP after execution — so a score recorded at decision time is, on the best
# available evidence, measuring the wrong thing. The only way it becomes
# meaningful is if the decision is later checked against what actually happened.
# Writing decisions alone reproduces the competitor behaviour; the outcome loop
# is the differentiator.
#
# Entries are OKF v0.1: a non-empty `type` is the only hard requirement, so
# `type: Decision` is purely additive to the existing wiki.
#
# bash 3.2 compatible. No LLM calls.
set -uo pipefail

CMD="${1:-}"; shift 2>/dev/null || true
DECISION="" WIKI="" ID="" RESULT="" TOPIC=""
while [ $# -gt 0 ]; do
  case "$1" in
    --decision) DECISION="${2:-}"; shift 2 ;;
    --wiki)     WIKI="${2:-}";     shift 2 ;;
    --id)       ID="${2:-}";       shift 2 ;;
    --result)   RESULT="${2:-}";   shift 2 ;;
    --topic)    TOPIC="${2:-}";    shift 2 ;;
    *) echo "usage: $0 record|outcome|revisit ..." >&2; exit 1 ;;
  esac
done
case "$CMD" in record|outcome|revisit) ;; *) echo "usage: $0 record|outcome|revisit ..." >&2; exit 1 ;; esac
command -v python3 >/dev/null 2>&1 || { echo "[decision-log] ERROR: python3 required" >&2; exit 1; }

# Default to the project wiki; fall back to the shared one.
if [ -z "$WIKI" ]; then
  for c in ".prometheus/knowledge/wiki" "$HOME/.prometheus/knowledge/shared/wiki"; do
    [ -d "$c" ] && { WIKI="$c"; break; }
  done
fi
[ -n "$WIKI" ] || { echo "[decision-log] ERROR: no wiki directory found; pass --wiki" >&2; exit 1; }
mkdir -p "$WIKI" 2>/dev/null || true

slugify() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' \
    | sed -e 's/[^a-z0-9]\{1,\}/-/g' -e 's/^-//' -e 's/-$//' | cut -c1-72
}

# ---------------------------------------------------------------- record ----
if [ "$CMD" = "record" ]; then
  [ -n "$DECISION" ] || { echo "[decision-log] ERROR: --decision <file> is required" >&2; exit 1; }
  [ -f "$DECISION" ] || { echo "[decision-log] ERROR: decision file not found: $DECISION" >&2; exit 1; }

  if [ -z "$ID" ]; then
    TITLE_LINE="$(grep -m1 '^# ' "$DECISION" 2>/dev/null | sed 's/^# *//')"
    [ -n "$TITLE_LINE" ] || TITLE_LINE="$(basename "$DECISION" | sed 's/\.[^.]*$//')"
    ID="$(slugify "$TITLE_LINE")"
  fi
  ENTRY="$WIKI/$ID.md"

  # De-duplicate. The Stop hook in this very repo generated 12 near-identical
  # wiki entries in one session; a decision type that inherits that behaviour
  # produces noise, not memory — and a knowledge base full of duplicates is
  # worse than none, because `revisit` can no longer tell you what you decided.
  if [ -f "$ENTRY" ]; then
    echo "[decision-log] REFUSED: a decision entry already exists: $ENTRY" >&2
    echo "[decision-log]   Re-recording would duplicate it. To record what happened," >&2
    echo "[decision-log]   use:  $0 outcome --id $ID --result -" >&2
    exit 2
  fi

  DEC_ID="$ID" DEC_SRC="$DECISION" python3 - "$ENTRY" <<'PY' || exit 1
import os, re, sys, time

src = open(os.environ["DEC_SRC"], encoding="utf-8", errors="replace").read()
eid = os.environ["DEC_ID"]

def section(*names):
    for n in names:
        m = re.search(r"^#{1,6}\s*%s\s*$\n(.*?)(?=^#{1,6}\s|\Z)" % n, src, re.M | re.I | re.S)
        if m and m.group(1).strip():
            return m.group(1).strip()
    return None

title = (re.search(r"^#\s+(.+)$", src, re.M) or [None, eid])[1] if re.search(r"^#\s+", src, re.M) else eid

# A colon in a title makes YAML read it as a nested mapping, so the entry

# fails to parse and pk SILENTLY SKIPS it. Seven entries were lost this way

# before an adversarial review caught it. Always emit a quoted scalar.

title_yaml = '"' + str(title).replace('\\', '\\\\').replace('"', '\\"') + '"'
decision = section("decision", "the decision") or "(not stated)"
assumptions = section("assumptions?", "what this rests on") or "(none stated)"
falsifier = section("falsifier", "what would falsify (?:this|it)",
                    "what would prove (?:this|me) wrong") or "(none stated)"

now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
out = f"""---
type: Decision
id: {eid}
title: {title_yaml}
tags:
- decision
- outcome-pending
outcome_status: pending
decided_at: {now}
links: []
sources: []
---

# {title}

## Decision

{decision}

## Assumptions

{assumptions}

## Falsifier

{falsifier}

## Outcome

**Status: pending.** Nothing has been recorded yet.

A decision without a recorded outcome cannot be checked against what actually
happened — and idea rankings are known to flip after execution, so the judgement
made here is exactly the thing that needs checking later.

Record it with:

```
decision-log.sh outcome --id {eid} --result -
```
"""
open(sys.argv[1], "w", encoding="utf-8").write(out)
PY
  echo "[decision-log] recorded $ENTRY (outcome_status: pending)" >&2
  exit 0
fi

# --------------------------------------------------------------- outcome ----
if [ "$CMD" = "outcome" ]; then
  [ -n "$ID" ] || { echo "[decision-log] ERROR: --id is required" >&2; exit 1; }
  ENTRY="$WIKI/$ID.md"
  if [ ! -f "$ENTRY" ]; then
    echo "[decision-log] REFUSED: no decision entry with id '$ID' in $WIKI." >&2
    echo "[decision-log]   An outcome with no decision to attach to is not a record." >&2
    exit 2
  fi
  [ -n "$RESULT" ] || { echo "[decision-log] ERROR: --result <text|-> is required" >&2; exit 1; }
  if [ "$RESULT" = "-" ]; then TEXT="$(cat)"; else TEXT="$RESULT"; fi
  STRIPPED="$(printf '%s' "$TEXT" | tr -d '[:space:]')"
  [ "${#STRIPPED}" -ge 10 ] || {
    echo "[decision-log] REFUSED: the outcome text is empty or too short." >&2; exit 2; }

  OUT_TEXT="$TEXT" python3 - "$ENTRY" <<'PY' || exit 1
import os, re, sys, time
p = sys.argv[1]
s = open(p, encoding="utf-8", errors="replace").read()
now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
text = os.environ["OUT_TEXT"].strip()

s = s.replace("outcome_status: pending", "outcome_status: recorded", 1)
s = s.replace("- outcome-pending", "- outcome-recorded", 1)
if "outcome_recorded_at:" not in s:
    s = s.replace("outcome_status: recorded",
                  "outcome_status: recorded\noutcome_recorded_at: %s" % now, 1)

# Replace the whole pending Outcome section — leaving the "pending" prose in
# place beneath a recorded outcome would make the entry contradict itself.
s = re.sub(r"^## Outcome\n.*\Z",
           "## Outcome\n\n**Status: recorded** (%s)\n\n%s\n" % (now, text),
           s, flags=re.M | re.S)
open(p, "w", encoding="utf-8").write(s)
PY
  echo "[decision-log] outcome recorded for $ID" >&2
  exit 0
fi

# --------------------------------------------------------------- revisit ----
[ -n "$TOPIC" ] || { echo "[decision-log] ERROR: --topic is required" >&2; exit 1; }

WIKI="$WIKI" TOPIC="$TOPIC" python3 <<'PY'
import glob, os, re

wiki, topic = os.environ["WIKI"], os.environ["TOPIC"].lower()
keys = [w for w in re.findall(r"[a-z0-9]{3,}", topic)]
rows = []

for p in sorted(glob.glob(os.path.join(wiki, "*.md"))):
    s = open(p, encoding="utf-8", errors="replace").read()
    if not re.search(r"^type:\s*Decision\s*$", s, re.M):
        continue
    low = s.lower()
    if keys and not any(k in low for k in keys):
        continue
    eid = (re.search(r"^id:\s*(.+)$", s, re.M) or [None, os.path.basename(p)])[1].strip()
    title = (re.search(r"^title:\s*(.+)$", s, re.M) or [None, eid])[1].strip()
    status = (re.search(r"^outcome_status:\s*(\S+)", s, re.M) or [None, "unknown"])[1]
    when = (re.search(r"^decided_at:\s*(\S+)", s, re.M) or [None, "?"])[1]
    m = re.search(r"^## Outcome\n\n\*\*Status: recorded\*\*[^\n]*\n\n(.*?)(?=\n#|\Z)", s, re.M | re.S)
    outcome = m.group(1).strip() if m else None
    rows.append((eid, title, status, when, outcome))

if not rows:
    print("No prior decisions found for: %s" % os.environ["TOPIC"])
    raise SystemExit(0)

print("Prior decisions on '%s':\n" % os.environ["TOPIC"])
for eid, title, status, when, outcome in rows:
    print("- %s  [%s]  decided %s" % (title, status, when))
    print("  id: %s" % eid)
    if outcome:
        # BOTH halves, always. Returning the decision without the outcome is
        # the failure this command exists to fix.
        print("  outcome: %s" % " ".join(outcome.split())[:300])
    else:
        print("  outcome: PENDING — this decision has never been checked against reality.")
    print()
PY
exit 0
