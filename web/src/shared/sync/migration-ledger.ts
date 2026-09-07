/**
 * What has been applied to the local replica, and which generation it is on.
 *
 * ── Why a ledger rather than "run the DDL again" ────────────────────────────
 *
 * `pglite-schema.ts` is idempotent (`CREATE TABLE IF NOT EXISTS`), so re-running
 * it is harmless *today*. That stops being true the moment a migration drops a
 * column or backfills a value: idempotence is a property of the current SQL, not
 * a guarantee of the mechanism. The ledger makes "has this already run?" a
 * recorded fact instead of an inference from the DDL's shape.
 *
 * ── Generations ─────────────────────────────────────────────────────────────
 *
 * The generation counter is the other half of ADR-009 G3's resume validation.
 * `evaluateResume` in PEM refuses a checkpoint whose generation predates the
 * caller's — so a rebuild must *increment* something for that check to fire, and
 * this is what it increments. A rebuild that left the generation alone would
 * produce a checkpoint indistinguishable from the pre-rebuild one.
 *
 * ADR-009 G3/G4 (flint-realtime-fabric).
 */

/** The PGlite surface this needs. Structural, to avoid a hard dependency. */
export interface LedgerClient {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<unknown>;
}

export interface AppliedMigration {
  id: string;
  appliedAt: string;
}

const LEDGER_TABLE = "_replica_migrations";
const META_TABLE = "_replica_meta";

/**
 * Create the ledger's own tables.
 *
 * These are bookkeeping, not replica data, so they sit outside
 * `PGLITE_TABLES` — the five-table exclusion test in `pglite-schema.test.ts`
 * asserts what *syncs*, and nothing here does.
 */
export async function ensureLedger(client: LedgerClient): Promise<void> {
  await client.exec(
    `CREATE TABLE IF NOT EXISTS ${LEDGER_TABLE} (
       id         TEXT PRIMARY KEY,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
  );
  await client.exec(
    `CREATE TABLE IF NOT EXISTS ${META_TABLE} (
       id         INTEGER PRIMARY KEY CHECK (id = 1),
       generation INTEGER NOT NULL DEFAULT 1
     )`,
  );
  // Seed the singleton row. ON CONFLICT so a second call is a no-op.
  await client.query(
    `INSERT INTO ${META_TABLE} (id, generation) VALUES (1, 1)
     ON CONFLICT (id) DO NOTHING`,
  );
}

/** Migrations already applied, oldest first. */
export async function appliedMigrations(client: LedgerClient): Promise<AppliedMigration[]> {
  const result = await client.query<{ id: string; applied_at: string }>(
    `SELECT id, applied_at FROM ${LEDGER_TABLE} ORDER BY applied_at ASC`,
  );
  return result.rows.map((r) => ({ id: r.id, appliedAt: r.applied_at }));
}

/**
 * Apply `sql` and record it, or do nothing if it has already run.
 *
 * The DDL and the ledger insert are **one statement each**, not one
 * transaction — PGlite's exec cannot mix DDL and parameterised DML in a single
 * call. A crash between them re-runs the DDL next time, which is safe precisely
 * because every migration here must be idempotent. That requirement is a
 * constraint on migration authors, stated so it is not discovered later.
 */
export async function applyMigration(
  client: LedgerClient,
  id: string,
  sql: string,
): Promise<{ applied: boolean }> {
  const seen = await client.query<{ id: string }>(
    `SELECT id FROM ${LEDGER_TABLE} WHERE id = $1`,
    [id],
  );
  if (seen.rows.length > 0) return { applied: false };

  await client.exec(sql);
  await client.query(
    `INSERT INTO ${LEDGER_TABLE} (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
    [id],
  );
  return { applied: true };
}

/** The replica's current generation. */
export async function currentGeneration(client: LedgerClient): Promise<number> {
  const result = await client.query<{ generation: number }>(
    `SELECT generation FROM ${META_TABLE} WHERE id = 1`,
  );
  return result.rows[0]?.generation ?? 1;
}

/**
 * Start a new generation.
 *
 * Called when a rebuild discards the replica's contents — Electric's
 * must-refetch, or a resume that `evaluateResume` rejected. Incrementing is what
 * makes every checkpoint written before this point recognisably stale.
 */
export async function bumpGeneration(client: LedgerClient): Promise<number> {
  const result = await client.query<{ generation: number }>(
    `UPDATE ${META_TABLE} SET generation = generation + 1 WHERE id = 1
     RETURNING generation`,
  );
  return result.rows[0]?.generation ?? 1;
}
