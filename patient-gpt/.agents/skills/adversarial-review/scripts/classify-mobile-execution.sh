#!/usr/bin/env bash
# classify-mobile-execution.sh — assign every script-bearing skill a mobile
# execution verdict, derived from what its scripts actually invoke.
#
# Usage:
#   classify-mobile-execution.sh [--out <json>] [--check]
#
# Exit: 0 ok / check passed · 1 usage · 2 check FAILED (unclassified or drift)
#
# WHY DERIVED, NOT TYPED
# A hand-typed classification of 60 skills is a snapshot that is wrong the day
# someone adds a skill. This script recomputes from the tree every run, so
# `--check` fails on drift instead of quietly describing a repo that no longer
# exists.
#
# VERDICTS
#   E0  script is build/dev/CI tooling a phone never invokes → already portable
#   E1  portable as a Wasm component; `needs_capabilities` says whether it
#       requires kv-store/clock grants or is a pure function of its input
#   E2  needs a native binary or daemon on the device
#   R   needs the network or a host service → remote execution covers it
#
# The ordering is deliberate: E2 and R are claims that something CANNOT be
# ported, so they require positive evidence (a named binary, a network call).
#
# E1 WAS ONCE THE BARE RESIDUAL, AND THAT WAS WRONG. It described members as
# "pure text/JSON transformation" — and when change-msp-006 went looking for a
# pure one to port, ALL 18 turned out to touch the filesystem or clock. The
# residual had silently absorbed every skill no other rule matched. E1 is now
# split by `needs_capabilities`, so "portable" states what it costs.
#
# bash 3.2 compatible. No LLM calls.
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"
cd "$ROOT" || exit 1

OUT="" CHECK=0
while [ $# -gt 0 ]; do
  case "$1" in
    --out)   OUT="${2:-}"; shift 2 ;;
    --check) CHECK=1; shift ;;
    *) echo "usage: $0 [--out <json>] [--check]" >&2; exit 1 ;;
  esac
done
[ -n "$OUT" ] || OUT=".kbd-orchestrator/phases/mobile-skill-portability/mobile-classification.json"
command -v python3 >/dev/null 2>&1 || { echo "[classify] ERROR: python3 required" >&2; exit 1; }

TMP="$(mktemp -d "${TMPDIR:-/tmp}/classify.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

# Enumerate script-bearing skills. Nested copies (a skill vendored inside
# another skill's tree) are recorded but flagged: they are duplicates of an
# already-classified skill, not independent porting work.
find skills -name SKILL.md -not -path "*/tests/*" -not -path "*/fixtures/*" \
     -not -path "*/node_modules/*" -exec dirname {} \; 2>/dev/null | sort > "$TMP/all.txt"
: > "$TMP/bearing.txt"
while IFS= read -r d; do
  [ -d "$d/scripts" ] && printf '%s\n' "$d" >> "$TMP/bearing.txt"
done < "$TMP/all.txt"

TOTAL_SKILLS="$(grep -c . "$TMP/all.txt" | tr -d ' ')"
BEARING="$(grep -c . "$TMP/bearing.txt" | tr -d ' ')"

OUT="$OUT" TOTAL="$TOTAL_SKILLS" BEARING="$BEARING" LIST="$TMP/bearing.txt" \
CHECK="$CHECK" python3 - <<'PY'
import json, os, re, subprocess, sys, glob

out_path = os.environ["OUT"]
listfile = os.environ["LIST"]
check = os.environ["CHECK"] == "1"
skills = [l.strip() for l in open(listfile) if l.strip()]

# Positive-evidence markers. E2/R assert "cannot be ported", so each needs a
# concrete signal — never a default.
NATIVE = re.compile(r"\b(cargo|rustc|docker|kubectl|launchctl|systemctl|xcodebuild|"
                    r"gradle|npm|pnpm|node|go|make|cmake|brew|apt-get)\b")
NETWORK = re.compile(r"\b(curl|wget|gh |git clone|git push|git fetch|ssh|scp|"
                     r"nc |http://|https://)")
# Filesystem and clock access. A guest CAN do these — but only through granted
# capabilities (prometheus:component's kv-store and clock), never ambiently. So
# they are E1 with a capability requirement, not "pure". Verified empirically:
# when E1 was the bare residual, ALL 18 members touched the filesystem, so
# "pure transformation" described none of them.
FSCLOCK = re.compile(r"\b(mkdir|rmdir|touch|date\s|stat\s|find\s|ls\s)|"
                     r"\brm\s|\bcp\s|\bmv\s|>\s*\"?\$")
# Build/dev tooling: if a script only exists to validate, format, install, or
# release the pack itself, a phone has no reason to run it at all.
DEVTOOL = re.compile(r"(validate|lint|format|install|build|release|publish|"
                     r"generate|sync|register|check|test|smoke|doctor|update)",
                     re.I)

rows = []
for d in skills:
    scripts = sorted(glob.glob(os.path.join(d, "scripts", "*")))
    scripts = [s for s in scripts if os.path.isfile(s)]
    blob = ""
    for s in scripts:
        try:
            blob += open(s, encoding="utf-8", errors="replace").read()
        except Exception:
            pass
    names = " ".join(os.path.basename(s) for s in scripts)

    # A skill vendored inside another skill's tree — under ANY harness dotdir
    # (.claude, .codex, .cursor, .agents, …) or a nested skills/ — is a copy of
    # something already classified. Matching only `.claude` missed 8 of them and
    # counted the same skill as porting work up to five times.
    nested = bool(re.search(r"/\.[A-Za-z0-9_-]+/skills/|/skills/.+/skills/", d))
    has_native = bool(NATIVE.search(blob))
    has_net = bool(NETWORK.search(blob))
    devtool = bool(DEVTOOL.search(names))

    if nested:
        verdict, why = "E0", "nested duplicate of an already-classified skill; not independent porting work"
    elif devtool and not has_net:
        verdict, why = "E0", "scripts are build/validation tooling for the pack itself; a phone never invokes them"
    elif has_net:
        verdict, why = "R", "scripts make network or host-service calls; remote execution covers this"
    elif has_native:
        verdict, why = "E2", "scripts shell out to a native toolchain or daemon that must exist on the device"
    elif FSCLOCK.search(blob):
        verdict, why = "E1", "transformation plus filesystem/clock access; portable as a Wasm component ONLY with the kv-store and clock capabilities granted"
    else:
        verdict, why = "E1", "pure text/JSON transformation; portable as a Wasm component with no capabilities"

    rows.append({"skill": d, "scripts": len(scripts), "verdict": verdict,
                 "rationale": why, "nested_duplicate": nested,
                 "needs_capabilities": verdict == "E1" and bool(FSCLOCK.search(blob))})

counts = {}
for r in rows:
    counts[r["verdict"]] = counts.get(r["verdict"], 0) + 1

doc = {
    "generated_by": "skills/process/adversarial-review/scripts/classify-mobile-execution.sh",
    "derived": True,
    "total_skills": int(os.environ["TOTAL"]),
    "script_bearing": int(os.environ["BEARING"]),
    "manifest_only": int(os.environ["TOTAL"]) - int(os.environ["BEARING"]),
    "counts": counts,
    "verdict_meanings": {
        "E0": "build/dev tooling or nested duplicate — already portable, no work",
        "E1": "portable as a Wasm component; see rationale for whether capabilities are required",
        "E2": "needs a native binary or daemon on the device",
        "R":  "needs network or a host service — remote execution covers it",
    },
    "skills": rows,
}

unclassified = [r["skill"] for r in rows if r["verdict"] not in ("E0", "E1", "E2", "R")]

if check:
    prev = None
    try:
        prev = json.load(open(out_path))
    except Exception:
        print("[classify] CHECK FAILED: %s is missing or unreadable" % out_path, file=sys.stderr)
        raise SystemExit(2)
    if unclassified:
        print("[classify] CHECK FAILED: unclassified: %s" % ", ".join(unclassified), file=sys.stderr)
        raise SystemExit(2)
    # Drift: the committed file must match what the tree produces now.
    if prev.get("script_bearing") != doc["script_bearing"]:
        print("[classify] CHECK FAILED: script_bearing drifted %s -> %s. Re-run without --check."
              % (prev.get("script_bearing"), doc["script_bearing"]), file=sys.stderr)
        raise SystemExit(2)
    prev_map = {r["skill"]: r["verdict"] for r in prev.get("skills", [])}
    now_map = {r["skill"]: r["verdict"] for r in rows}
    if prev_map != now_map:
        added = sorted(set(now_map) - set(prev_map))
        removed = sorted(set(prev_map) - set(now_map))
        changed = sorted(k for k in set(now_map) & set(prev_map) if now_map[k] != prev_map[k])
        print("[classify] CHECK FAILED: classification drifted.", file=sys.stderr)
        for label, items in (("added", added), ("removed", removed), ("changed", changed)):
            if items:
                print("  %s: %s" % (label, ", ".join(items[:5])), file=sys.stderr)
        raise SystemExit(2)
    print("[classify] CHECK PASSED: %d script-bearing skills, all classified, no drift" % doc["script_bearing"])
    raise SystemExit(0)

if unclassified:
    print("[classify] ERROR: unclassified skills: %s" % ", ".join(unclassified), file=sys.stderr)
    raise SystemExit(2)

os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
json.dump(doc, open(out_path, "w"), indent=2, sort_keys=False)
open(out_path, "a").write("\n")
print("[classify] wrote %s" % out_path)
print("  total skills:   %d" % doc["total_skills"])
print("  manifest-only:  %d (portable today)" % doc["manifest_only"])
print("  script-bearing: %d" % doc["script_bearing"])
for v in ("E0", "E1", "E2", "R"):
    print("    %-3s %d" % (v, counts.get(v, 0)))
PY
