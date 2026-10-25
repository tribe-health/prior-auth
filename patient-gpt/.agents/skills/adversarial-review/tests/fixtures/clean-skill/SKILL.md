---
name: clean-skill
description: Verifies that a PostgreSQL dump restores into a scratch database and reports row counts per table
license: MIT
metadata:
  author: fixture
  version: '1.0.0'
  category: testing
  tags: [fixture, testing, postgres, backup]
---

# clean-skill

Verifies one thing: that a `pg_dump` archive actually restores. A backup that has
never been restored is an untested assumption, and the failure is usually
discovered at the worst possible time.

## When to use

- After creating a `pg_dump` archive, before relying on it.
- On a schedule, to catch archives that silently stopped being valid.

## When NOT to use

- To create backups — this skill only verifies existing archives.
- Against a production database. The restore target must be a scratch database;
  the script refuses to run if the target name lacks a `scratch_` prefix.
- For MySQL, SQLite, or any non-PostgreSQL dump.

## Prerequisites

- `psql` and `pg_restore` on `PATH` (PostgreSQL 14 or newer).
- `PGHOST`, `PGUSER`, and `PGPASSWORD` set in the environment. These point at the
  server holding **both** the source database and the scratch target.
- A scratch database the current user may drop and recreate.
- An archive in `pg_dump` **custom** or **directory** format (`-Fc` or `-Fd`).
  `pg_restore` cannot read a plain-SQL dump; for those, use `psql -f` instead —
  this skill does not cover that case.

## Instructions

1. Verify the archive restores and collect per-table row counts:

   ```bash
   bash scripts/verify-restore.sh --archive <path/to/dump.dump> --target scratch_verify
   ```

   The script drops and recreates `scratch_verify`, restores the archive into
   it, then prints one `table<TAB>row_count` line per table, sorted by name.

2. Read the exit code:

   | Exit | Meaning | Action |
   |---|---|---|
   | 0 | restore succeeded, counts printed | archive is good |
   | 2 | archive unreadable or not a `pg_dump` file | re-create the backup |
   | 3 | restore failed partway | archive is corrupt; do not rely on it |
   | 4 | target name lacks the `scratch_` prefix | pass a scratch target |

3. Collect exact counts from the source database and diff them:

   ```bash
   bash scripts/count-rows.sh --database <source_db>      > /tmp/source-counts.txt
   bash scripts/count-rows.sh --database scratch_verify   > /tmp/restored-counts.txt

   diff /tmp/source-counts.txt /tmp/restored-counts.txt
   ```

   An empty diff means the restore is complete. A table present in the source but
   absent from the restored output means the dump is incomplete, even when the
   restore itself reports success.

   `count-rows.sh` issues a real `SELECT count(*)` per table. It deliberately does
   **not** read `pg_stat_user_tables.n_live_tup`: that column is a planner
   estimate refreshed by autovacuum, so comparing estimates can report a match
   for a dump that lost rows — certifying a bad archive, which is the one outcome
   this skill exists to prevent. Exact counts cost a full scan per table; that is
   the intended trade.

## Failure modes

- **Restore succeeds, counts are zero.** The archive holds schema but no data —
  usually `pg_dump --schema-only` was used by mistake.
- **`psql` missing.** Exit 2 with a message naming the missing binary; nothing
  is dropped.
- **Target database is in use.** The drop fails and the script exits 3 without
  touching the archive; disconnect other sessions and retry.
- **Interrupted mid-restore.** The scratch database is left partially populated.
  Re-running the script drops and recreates it, so no manual cleanup is needed.
