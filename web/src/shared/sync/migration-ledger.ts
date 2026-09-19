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

import type { ReplicaLease } from "./replica-owner";

/** The PGlite surface this needs. Structural, to avoid a hard dependency. */
export interface LedgerClient {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<unknown>;
}

export interface TransactionalLedgerClient extends LedgerClient {
  transaction<T>(callback: (tx: LedgerClient) => Promise<T>): Promise<T>;
}

export interface AppliedMigration {
  id: string;
  checksum: string | null;
  logicalVersion: number;
  sequence: number | null;
  appliedAt: string;
}

export interface ReplicaMigration {
  id: string;
  sql: string;
  /** SHA-256 of the exact UTF-8 migration SQL. */
  checksum: string;
  /** Logical schema version introduced by this migration. */
  logicalVersion: number;
  /** This migration discards synchronized rows and must fence every older cursor first. */
  startsNewGeneration?: boolean;
}

export interface ReplicaSchemaPlan {
  logicalVersion: number;
  generation: number;
  migrations: readonly ReplicaMigration[];
}

export type RecoveryReason =
  | "invalid-plan-checksum"
  | "invalid-migration-plan"
  | "checksum-drift"
  | "newer-schema"
  | "newer-generation"
  | "migration-failed"
  | "storage-failed"
  | "ownership-required";

export type MigrationOutcome =
  | {
      status: "ready";
      logicalVersion: number;
      generation: number;
      applied: readonly string[];
    }
  | {
      status: "recovery-required";
      reason: RecoveryReason;
      migrationId?: string;
      diagnostic?: string;
    };

class MigrationApplicationError extends Error {
  readonly migrationId: string;

  constructor(migrationId: string, cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "MigrationApplicationError";
    this.migrationId = migrationId;
  }
}

const LEDGER_TABLE = "_replica_migrations";
const META_TABLE = "_replica_meta";

/**
 * Create the ledger's own tables.
 *
 * These are bookkeeping, not replica data, so they sit outside
 * `PGLITE_TABLES` — the declared-table exclusion test in `pglite-schema.test.ts`
 * asserts what *syncs*, and nothing here does.
 */
export async function ensureLedger(client: LedgerClient): Promise<void> {
  await client.exec(
    `CREATE TABLE IF NOT EXISTS ${LEDGER_TABLE} (
       id         TEXT PRIMARY KEY,
       checksum   TEXT,
       logical_version INTEGER NOT NULL DEFAULT 0,
       sequence INTEGER,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
  );
  await client.exec(
    `ALTER TABLE ${LEDGER_TABLE} ADD COLUMN IF NOT EXISTS checksum TEXT;
     ALTER TABLE ${LEDGER_TABLE} ADD COLUMN IF NOT EXISTS logical_version INTEGER NOT NULL DEFAULT 0;`,
  );
  await client.exec(
    `ALTER TABLE ${LEDGER_TABLE} ADD COLUMN IF NOT EXISTS sequence INTEGER;`,
  );
  await client.exec(
    `CREATE TABLE IF NOT EXISTS ${META_TABLE} (
       id         INTEGER PRIMARY KEY CHECK (id = 1),
       generation INTEGER NOT NULL DEFAULT 1,
       logical_version INTEGER NOT NULL DEFAULT 0
     )`,
  );
  await client.exec(
    `ALTER TABLE ${META_TABLE} ADD COLUMN IF NOT EXISTS logical_version INTEGER NOT NULL DEFAULT 0;`,
  );
  // Seed the singleton row. ON CONFLICT so a second call is a no-op.
  await client.query(
    `INSERT INTO ${META_TABLE} (id, generation) VALUES (1, 1)
     ON CONFLICT (id) DO NOTHING`,
  );
}

/** Migrations already applied, oldest first. */
export async function appliedMigrations(client: LedgerClient): Promise<AppliedMigration[]> {
  const result = await client.query<{
    id: string;
    checksum: string | null;
    logical_version: number;
    sequence: number | null;
    applied_at: string;
  }>(
    `SELECT id, checksum, logical_version, sequence, applied_at
       FROM ${LEDGER_TABLE} ORDER BY sequence ASC NULLS FIRST, applied_at ASC, id ASC`,
  );
  return result.rows.map((r) => ({
    id: r.id,
    checksum: r.checksum,
    logicalVersion: r.logical_version,
    sequence: r.sequence,
    appliedAt: r.applied_at,
  }));
}

/** SHA-256 used by both build-time migration manifests and runtime validation. */
export async function migrationChecksum(sql: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(sql));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Validate and apply a complete schema plan in one database transaction.
 *
 * A returned recovery outcome makes no schema-data or generation change. A
 * thrown DDL failure is caught after PGlite rolls the transaction back and is
 * converted to the same explicit recovery state.
 */
export async function migrateReplicaSchema(
  client: TransactionalLedgerClient,
  plan: ReplicaSchemaPlan,
  ownership: ReplicaLease,
): Promise<MigrationOutcome> {
  if (!ownership.held) {
    return { status: "recovery-required", reason: "ownership-required" };
  }
  for (const migration of plan.migrations) {
    if ((await migrationChecksum(migration.sql)) !== migration.checksum) {
      return {
        status: "recovery-required",
        reason: "invalid-plan-checksum",
        migrationId: migration.id,
      };
    }
  }
  const migrationIds = new Set<string>();
  for (let index = 0; index < plan.migrations.length; index += 1) {
    const migration = plan.migrations[index]!;
    const previous = plan.migrations[index - 1];
    if (
      migrationIds.has(migration.id) ||
      migration.logicalVersion > plan.logicalVersion ||
      migration.logicalVersion < 1 ||
      (previous && previous.logicalVersion > migration.logicalVersion)
    ) {
      return {
        status: "recovery-required",
        reason: "invalid-migration-plan",
        migrationId: migration.id,
      };
    }
    migrationIds.add(migration.id);
  }

  try {
    return await client.transaction(async (tx) => {
      await ensureLedger(tx);
      const meta = await tx.query<{ generation: number; logical_version: number }>(
        `SELECT generation, logical_version FROM ${META_TABLE} WHERE id = 1 FOR UPDATE`,
      );
      const current = meta.rows[0] ?? { generation: 1, logical_version: 0 };

      if (current.logical_version > plan.logicalVersion) {
        return { status: "recovery-required", reason: "newer-schema" } as const;
      }
      const recorded = await appliedMigrations(tx);
      for (let index = 0; index < recorded.length; index += 1) {
        const migration = recorded[index]!;
        const candidate = plan.migrations[index];
        if (
          !candidate ||
          migration.id !== candidate.id ||
          migration.checksum !== candidate.checksum ||
          migration.logicalVersion !== candidate.logicalVersion ||
          migration.sequence !== index + 1
        ) {
          return {
            status: "recovery-required",
            reason: "checksum-drift",
            migrationId: migration.id,
          } as const;
        }
      }

      const seen = new Set(recorded.map((migration) => migration.id));
      if (
        current.logical_version === plan.logicalVersion &&
        plan.migrations.some((migration) => !seen.has(migration.id))
      ) {
        return { status: "recovery-required", reason: "checksum-drift" } as const;
      }
      const applied: string[] = [];
      let generation = Math.max(current.generation, plan.generation);
      for (const migration of plan.migrations) {
        if (seen.has(migration.id)) continue;
        if (migration.startsNewGeneration) {
          generation = Math.max(current.generation + 1, plan.generation, generation);
          await tx.query(
            `UPDATE ${META_TABLE} SET generation = $1 WHERE id = 1`,
            [generation],
          );
        }
        try {
          await tx.exec(migration.sql);
        } catch (error) {
          throw new MigrationApplicationError(migration.id, error);
        }
        await tx.query(
          `INSERT INTO ${LEDGER_TABLE} (id, checksum, logical_version, sequence)
           VALUES ($1, $2, $3, $4)`,
          [migration.id, migration.checksum, migration.logicalVersion, applied.length + seen.size + 1],
        );
        applied.push(migration.id);
      }

      await tx.query(
        `UPDATE ${META_TABLE}
            SET generation = $1, logical_version = $2
          WHERE id = 1`,
        [generation, plan.logicalVersion],
      );
      return {
        status: "ready",
        logicalVersion: plan.logicalVersion,
        generation,
        applied,
      } as const;
    });
  } catch (error) {
    if (error instanceof MigrationApplicationError) {
      return {
        status: "recovery-required",
        reason: "migration-failed",
        migrationId: error.migrationId,
        diagnostic: error.message,
      };
    }
    return {
      status: "recovery-required",
      reason: "storage-failed",
      diagnostic: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    };
  }
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
