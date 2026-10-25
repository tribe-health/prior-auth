#!/usr/bin/env bash
# count-rows.sh — print an exact "table<TAB>count" line per user table, sorted.
#
# Uses a real SELECT count(*) per table rather than pg_stat_user_tables.n_live_tup.
# That column is a planner estimate refreshed by autovacuum, so two databases can
# report identical estimates while holding different data — which would certify a
# lossy restore as complete. Exact counts cost a sequential scan per table; for a
# backup-verification tool that is the correct trade.
#
# Exit codes: 0 ok · 2 usage or psql missing · 3 query failed
set -uo pipefail

DB=""
while [ $# -gt 0 ]; do
  case "$1" in
    --database) DB="${2:-}"; shift 2 ;;
    *) echo "usage: $0 --database <name>" >&2; exit 2 ;;
  esac
done
[ -n "$DB" ] || { echo "count-rows: --database is required" >&2; exit 2; }
command -v psql >/dev/null 2>&1 || { echo "count-rows: psql not found" >&2; exit 2; }

# Build one UNION ALL query over every user table, so the counts come from a
# single snapshot instead of drifting across separate statements.
QUERY="$(psql -qAt -d "$DB" -c "
  SELECT string_agg(
           format('SELECT %L AS t, count(*) AS c FROM %I.%I',
                  c.relname, n.nspname, c.relname),
           ' UNION ALL ' ORDER BY c.relname)
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind = 'r'
    AND n.nspname NOT IN ('pg_catalog', 'information_schema');")" || exit 3

# No user tables is a valid result, not an error: an empty database restores fine.
[ -n "$QUERY" ] || exit 0

psql -qAt -F '	' -d "$DB" -c "SELECT t, c FROM ($QUERY) s ORDER BY t;" || exit 3
