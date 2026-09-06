#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# Architecture audit. Fails the build on a boundary violation.
#
#   bash scripts/audit.sh
#
# These are the rules that stop being true the moment nothing checks them.
# Each check names WHY it exists, because a rule whose reason is lost gets
# deleted the first time it is inconvenient.
# ═══════════════════════════════════════════════════════════════════════════
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FAIL=0

fail() { echo "  ✗ $1"; FAIL=1; }
pass() { echo "  ✓ $1"; }

echo "── 1. React filenames are kebab-case ──────────────────────────────────"
# One casing convention, mechanically checked. Mixed casing breaks
# case-insensitive filesystems in ways that only appear on someone else's
# machine.
# Skip dotfiles: .DS_Store and friends split to an empty basename and would
# report as a violation with no name attached, which is worse than useless.
BAD=$(find "$ROOT/web/src" -type f -not -name '.*' 2>/dev/null | sed 's|.*/||' \
      | awk -F. '{print $1}' | grep -vE '^[a-z0-9]+(-[a-z0-9]+)*$' || true)
if [ -z "$BAD" ]; then
  pass "all filenames kebab-case"
else
  while read -r f; do fail "not kebab-case: $f"; done <<< "$BAD"
fi

echo "── 2. No query cache ──────────────────────────────────────────────────"
# A query cache models REQUESTS; a local-first app models DATA. The sync engine
# already owns staleness — a cache on top re-answers that in the wrong layer
# with a second source of truth that drifts. See adr-001.
if grep -rqE '"@tanstack/react-query"|"swr"|"@apollo/client"' "$ROOT/web/package.json" 2>/dev/null; then
  fail "a query cache is declared in web/package.json (see docs/architecture/adr-001-no-query-cache.md)"
else
  pass "no query cache dependency"
fi

echo "── 3. Components do not call the network directly ─────────────────────"
# Components import feature hooks. A component that reaches for fetch or invoke
# has skipped two layers and is no longer testable in isolation.
# Two refinements the first version needed:
#   * `(^|[^A-Za-z0-9_])` so onAffirm( does not match invoke(
#   * strip comments first, so a file DOCUMENTING the prohibition does not
#     trip it. The original flagged its own example component for the crime of
#     explaining the rule in a code comment.
BADC=$(for f in "$ROOT/web/src/features"/*/components/*.tsx; do
  [ -f "$f" ] || continue
  sed -E 's|//.*$||; s|/\*.*\*/||' "$f" \
    | grep -qE '(^|[^A-Za-z0-9_])(fetch|invoke)\(' && echo "$f"
done || true)
if [ -z "$BADC" ]; then
  pass "no direct network calls in components"
else
  while read -r f; do fail "network call in component: ${f#$ROOT/}"; done <<< "$BADC"
fi

echo "── 4. The host crate names no shell ───────────────────────────────────"
# aso-host must not depend on Axum, Tauri or Flutter. The moment the shared
# core knows which shell it is inside, it stops being shared.
if grep -qE '^\s*(axum|tauri|flutter_rust_bridge)' "$ROOT/crates/aso-host/Cargo.toml" 2>/dev/null; then
  fail "aso-host depends on a shell framework — it must stay host-neutral"
else
  pass "aso-host is host-neutral"
fi

echo "── 5. Generated theme files are not hand-edited ───────────────────────"
# tokens.toml is the source. A hand-edit to an output is reverted by the next
# generator run, silently.
BANNER_OK=1
for g in "$ROOT/web/src/theme.css" "$ROOT/mobile/lib/core/theme/tokens.dart"; do
  if [ -f "$g" ] && ! head -3 "$g" | grep -q "DO NOT EDIT"; then
    fail "missing generated banner: ${g#$ROOT/}"; BANNER_OK=0
  fi
done
[ "$BANNER_OK" -eq 1 ] && pass "generated files carry their banner"

echo "── 6. Three evidence states, never two ────────────────────────────────"
# `void` is not a weak `gap`. If a union ever loses it, the product has started
# telling coordinators to argue a document that does not exist.
if grep -q "'void'" "$ROOT/web/src/shared/model/evidence-state.ts" 2>/dev/null \
   && grep -q "Void" "$ROOT/crates/aso-host/src/domain/mod.rs" 2>/dev/null; then
  pass "the void state survives on both surfaces"
else
  fail "an evidence state is missing — met/gap/void are all three required"
fi

echo
[ "$FAIL" -eq 0 ] && echo "audit: PASS" || echo "audit: FAIL"
exit "$FAIL"
