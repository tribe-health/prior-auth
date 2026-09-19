/**
 * Assembles the replica runtime's inputs from the declarations that already
 * exist.
 *
 * These derivations are small, but they belong in one place rather than inline
 * in the provider: every one of them restates part of the PHI boundary, and a
 * boundary restated in two files is a boundary that drifts.
 *
 * `SYNC_COLUMNS` is the single source for what each table may hold — the same
 * list the FRF catalog is asserted against by `catalog-conformance.test.ts`.
 */

import { ENTITY_TYPES, SYNC_COLUMNS } from "./electric-shapes";
import { PGLITE_TABLES, type PGliteTable } from "./pglite-schema";
import type { TableTarget } from "./chunk-writer";
import type { CheckpointStore, ReplicaCheckpointSet } from "./replica-runtime";
import type {
  ReplicaListBinding,
  ReplicaTableBinding,
} from "@prometheus-ags/entity-graph-core";

/** The write target for each synced table, columns taken from the boundary. */
export const REPLICA_TARGETS: readonly TableTarget[] = PGLITE_TABLES.map((table) => ({
  table,
  columns: SYNC_COLUMNS[table],
  // evidence_states is reference data keyed by `key`, not a UUID `id`.
  idColumn: table === "evidence_states" ? "key" : "id",
}));

/**
 * Shape id → local target.
 *
 * The catalog's shape ids are the table names, which the conformance test
 * asserts. Ordering follows `PGLITE_TABLES`, so reference data and parents are
 * fetched before the rows that cite them.
 */
export const REPLICA_SHAPES: ReadonlyArray<{ shape: string; target: TableTarget }> =
  REPLICA_TARGETS.map((target) => ({ shape: target.table, target }));

/** Explicit SQL table → graph type/key bindings consumed by PEM. */
export const REPLICA_TABLE_BINDINGS: readonly ReplicaTableBinding[] =
  REPLICA_TARGETS.map((target) => ({
    table: target.table,
    type: entityTypeFor(target.table),
    primaryKey: target.idColumn ?? "id",
  }));

/** Stable ordered memberships; lists contain identifiers only. */
export const REPLICA_LIST_BINDINGS: readonly ReplicaListBinding[] =
  REPLICA_TARGETS.map((target) => ({
    key: `replica:${target.table}`,
    table: target.table,
  }));

/** Graph entity type for a table. */
export function entityTypeFor(table: string): string {
  return ENTITY_TYPES[table as PGliteTable] ?? table;
}

/**
 * A checkpoint store backed by the replica's own `_replica_meta` row.
 *
 * The checkpoint lives in the same database as the rows it describes, so a
 * restore that loses the rows loses the checkpoint with them. Keeping it
 * elsewhere — `localStorage`, say — would let a cleared IndexedDB leave behind
 * a checkpoint claiming data that is gone.
 */
export function createPGliteCheckpointStore(client: {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<unknown>;
}): CheckpointStore {
  return {
    async read(key) {
      const { rows } = await client.query<{ value: string | null; checkpoint: string | null }>(
        `SELECT value, checkpoint FROM _replica_checkpoints WHERE key = $1`,
        [key],
      );
      const row = rows[0];
      if (!row) return { value: null, checkpoint: null };
      return {
        value: row.value,
        checkpoint: parseCheckpoint(row.checkpoint),
      };
    },

    async write(transactionClient, key, value, checkpoint) {
      // One statement, so the value and the checkpoint describing it commit
      // together. Two statements could be interrupted between them, leaving a
      // checkpoint that does not match what is stored.
      await transactionClient.query(
        `INSERT INTO _replica_checkpoints (key, value, checkpoint)
         VALUES ($1, $2, $3)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, checkpoint = EXCLUDED.checkpoint`,
        [key, value, JSON.stringify(checkpoint)],
      );
    },
  };
}

function parseCheckpoint(serialized: string | null): ReplicaCheckpointSet | null {
  if (!serialized) return null;
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (parsed === null || typeof parsed !== "object") return null;
    const candidate = parsed as { generation?: unknown; shapes?: unknown };
    if (!Number.isSafeInteger(candidate.generation)) return null;
    if (candidate.shapes === null || typeof candidate.shapes !== "object") return null;
    const validShapes = Object.values(candidate.shapes).every((value) => {
      if (value === null || typeof value !== "object") return false;
      const cursor = value as { handle?: unknown; offset?: unknown };
      return typeof cursor.handle === "string"
        && cursor.handle.length > 0
        && typeof cursor.offset === "string"
        && cursor.offset.length > 0;
    });
    return validShapes ? parsed as ReplicaCheckpointSet : null;
  } catch {
    return null;
  }
}

/** DDL for the checkpoint table. Applied alongside the replica schema. */
export const CHECKPOINT_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS _replica_checkpoints (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  checkpoint TEXT
);
`;
