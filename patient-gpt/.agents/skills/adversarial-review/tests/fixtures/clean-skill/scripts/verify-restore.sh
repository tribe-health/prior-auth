#!/usr/bin/env bash
# verify-restore.sh — restore a pg_dump archive into a scratch database and
# print per-table row counts. Refuses any target without a scratch_ prefix.
#
# Exit codes: 0 ok · 2 archive unreadable · 3 restore failed · 4 unsafe target
set -uo pipefail

ARCHIVE="" TARGET=""
while [ $# -gt 0 ]; do
  case "$1" in
    --archive) ARCHIVE="${2:-}"; shift 2 ;;
    --target)  TARGET="${2:-}";  shift 2 ;;
    *) echo "usage: $0 --archive <path> --target scratch_<name>" >&2; exit 2 ;;
  esac
done

[ -r "$ARCHIVE" ] || { echo "verify-restore: archive unreadable: $ARCHIVE" >&2; exit 2; }

# Guard before any destructive call: this script drops the target database, so
# a non-scratch name must fail here rather than after the drop.
case "$TARGET" in
  scratch_*) ;;
  *) echo "verify-restore: refusing non-scratch target: '$TARGET'" >&2; exit 4 ;;
esac

command -v psql       >/dev/null 2>&1 || { echo "verify-restore: psql not found" >&2; exit 2; }
command -v pg_restore >/dev/null 2>&1 || { echo "verify-restore: pg_restore not found" >&2; exit 2; }

psql -qAt -c "DROP DATABASE IF EXISTS \"$TARGET\";"  postgres >/dev/null || exit 3
psql -qAt -c "CREATE DATABASE \"$TARGET\";"          postgres >/dev/null || exit 3
pg_restore --dbname "$TARGET" --no-owner "$ARCHIVE"  >/dev/null 2>&1     || exit 3

# Exact counts, not pg_stat_user_tables estimates — see count-rows.sh for why a
# planner estimate can certify a lossy restore as complete.
exec bash "$(dirname "$0")/count-rows.sh" --database "$TARGET"
