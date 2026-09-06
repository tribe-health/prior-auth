#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# Load the ASO schema into the flint-forge Postgres instance.
#
# Runs from /docker-entrypoint-initdb.d on FIRST START ONLY. If the data volume
# already exists, Postgres skips this directory entirely — that is Postgres
# behaviour, not a bug here, and it is why `docker compose down -v` is the way
# to re-bootstrap.
#
# Ordering is load-bearing:
#   schema.sql        49 tables in schema `aso`; pgcrypto, citext, pg_trgm
#   schema-ai.sql     vector + btree_gist; embedding registry, corpora, chunks
#   *-checks.sql      executable assertions — they must run AFTER what they check
#
# ── Why the checks do NOT run under ON_ERROR_STOP ──────────────────────────
#
# The check files are NEGATIVE tests. schema-checks.sql:12-14 states the
# contract: "T1, T4, T5, T7 and T9 raise an ERROR ... a missing ERROR on
# T1/T4/T5/T7/T9 is a regression." Each provokes a refusal deliberately and
# recovers with SAVEPOINT / ROLLBACK TO.
#
# `psql -v ON_ERROR_STOP=1` aborts the session on ANY error, including an
# intended one, so it never reaches the ROLLBACK and the bootstrap dies on a
# test that was PASSING. Observed 2026-09-05: T1 (administrator refused the
# surgeon gate — ADR-002 working exactly as designed) killed the whole run and
# 20-electric-sync-views.sql never executed.
#
# So the checks run WITHOUT ON_ERROR_STOP, and this script asserts the
# contract instead: every expected refusal must appear. A check file that
# stops erroring is the regression, and that is what gets caught.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

SCHEMA_DIR=/schema
PSQL=(psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB")

echo "── ASO bootstrap ──────────────────────────────────────────────────────"

# Schema load: a failure here IS fatal. Nothing downstream is meaningful
# without the tables.
for f in schema.sql schema-ai.sql; do
  echo "  loading $f"
  "${PSQL[@]}" -v ON_ERROR_STOP=1 -f "$SCHEMA_DIR/$f"
done

# ── Assertions ────────────────────────────────────────────────────────────
# Expected-refusal counts come from each file's own header.
assert_checks() {
  local file="$1" expected="$2" out errors
  echo "  asserting $file (expecting $expected refusals)"

  out="$("${PSQL[@]}" -f "$SCHEMA_DIR/$file" 2>&1)" || true
  errors="$(printf '%s\n' "$out" | grep -c '^psql:.*ERROR:' || true)"

  printf '%s\n' "$out" | grep -E '^(===|RESULT|psql:.*ERROR:)' | sed 's/^/    /'

  if [ "$errors" -ne "$expected" ]; then
    echo "  ✗ $file: expected $expected refusals, observed $errors" >&2
    echo "    A MISSING refusal means a guard stopped working. Full output:" >&2
    printf '%s\n' "$out" >&2
    exit 1
  fi
  echo "    ✓ $errors/$expected expected refusals observed"
}

# schema-checks.sql:12  — T1, T4, T5, T7, T9
assert_checks schema-checks.sql 5
# schema-ai-checks.sql:12 — RESULT on A11 A13 A14 A15; the rest refuse
assert_checks schema-ai-checks.sql "${ASO_AI_EXPECTED_REFUSALS:-11}"

echo "  ✓ schema loaded and its own checks passed"
