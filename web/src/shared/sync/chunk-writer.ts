/**
 * Materialize shape chunks into local tables.
 *
 * ── Schema-agnostic on purpose ──────────────────────────────────────────────
 *
 * **No clinical table or column name appears in this file.** The target comes
 * in as data — a table name and a column list supplied by the caller from the
 * shape catalog — so this module cannot silently widen the PHI boundary that
 * `pglite-schema.ts` and `electric-shapes.ts` define. Adding a column here
 * would be impossible; adding one to `SYNC_COLUMNS` is a decision with a test
 * behind it.
 *
 * That also means this ships without waiting on anything: it is exercised
 * against a fixture schema in tests, and bound to real tables by a separate
 * change.
 *
 * ── What it does not do ─────────────────────────────────────────────────────
 *
 * It does not publish to the entity graph. Writing rows and publishing a
 * coherent revision are different concerns with different failure modes, so
 * publication lives in `replica-publisher.ts` and consumes what this returns.
 *
 * ADR-009 G4 (flint-realtime-fabric).
 */

/** The PGlite surface this needs. Structural, to avoid a hard dependency. */
export interface WriterClient {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<unknown>;
}

/** Where rows go, as data rather than code. */
export interface TableTarget {
  /** Local table name. Validated as an identifier before interpolation. */
  table: string;
  /** Columns to write, in order. Rows are projected onto exactly these. */
  columns: readonly string[];
  /** Primary key column, for upsert. Defaults to `id`. */
  idColumn?: string;
}

/** One row as delivered by the transport. */
export type ChunkRow = Record<string, unknown>;

export interface WriteResult {
  table: string;
  written: number;
  /** Ids written, in order — the publisher turns these into a list projection. */
  ids: string[];
}

/** Postgres identifiers: letters, digits, underscore; not starting with a digit. */
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

function assertIdentifier(name: string, what: string): void {
  if (!IDENTIFIER.test(name)) {
    throw new Error(`chunk-writer: invalid ${what} "${name}"`);
  }
}

/**
 * Validate a target once, before it is used repeatedly.
 *
 * Identifiers reach SQL by interpolation — parameters cannot bind a table or
 * column name — so they are checked against a strict pattern rather than
 * trusted. The catalog is server-supplied, but a mistake there should fail
 * loudly here rather than become an injection.
 */
export function validateTarget(target: TableTarget): void {
  assertIdentifier(target.table, "table name");
  if (target.columns.length === 0) {
    throw new Error(`chunk-writer: target "${target.table}" declares no columns`);
  }
  for (const column of target.columns) assertIdentifier(column, "column name");
  const id = target.idColumn ?? "id";
  assertIdentifier(id, "id column");
  if (!target.columns.includes(id)) {
    throw new Error(
      `chunk-writer: target "${target.table}" omits its id column "${id}" from columns`,
    );
  }
}

/**
 * Upsert `rows` into `target`.
 *
 * Each row is **projected onto the declared columns**: a value the transport
 * sent for an undeclared column is dropped here rather than written. That makes
 * the column list an enforced boundary rather than a description of one — if a
 * shape request were ever mis-projected upstream, the extra field still does not
 * land in local storage.
 *
 * A declared column the row does **not** carry is omitted from the statement
 * rather than written as NULL. Electric update frames carry only the columns
 * that changed, so padding to the full column list would null out everything the
 * frame did not mention.
 *
 * Runs inside one transaction so a chunk lands whole or not at all; a partially
 * applied chunk would leave the caller unable to say what its checkpoint means.
 */
export async function writeChunk(
  client: WriterClient,
  target: TableTarget,
  rows: readonly ChunkRow[],
): Promise<WriteResult> {
  validateTarget(target);
  const idColumn = target.idColumn ?? "id";
  if (rows.length === 0) return { table: target.table, written: 0, ids: [] };

  const ids: string[] = [];
  await client.exec("BEGIN");
  try {
    for (const row of rows) {
      // Projection AND presence: a declared column the row does not carry is
      // omitted from the statement entirely, not written as NULL.
      //
      // Electric update frames carry only the columns that changed. Padding the
      // row out to every declared column would write NULL over every column the
      // frame did not mention — silently destroying data on the first update
      // after a snapshot. Undeclared columns are still dropped, so the column
      // list remains an enforced boundary.
      const present = target.columns.filter((c) =>
        Object.prototype.hasOwnProperty.call(row, c),
      );
      if (!present.includes(idColumn)) {
        throw new Error(
          `chunk row for ${target.table} has no ${idColumn}; cannot upsert without the conflict key`,
        );
      }

      const values = present.map((c) => row[c] ?? null);
      const placeholders = present.map((_, i) => `$${i + 1}`).join(", ");
      const updates = present
        .filter((c) => c !== idColumn)
        .map((c) => `${c} = EXCLUDED.${c}`)
        .join(", ");
      // An id-only frame is a no-op rather than a conflict with nothing to set.
      const onConflict = updates
        ? `DO UPDATE SET ${updates}`
        : "DO NOTHING";

      await client.query(
        `INSERT INTO ${target.table} (${present.join(", ")})
         VALUES (${placeholders})
         ON CONFLICT (${idColumn}) ${onConflict}`,
        values,
      );
      ids.push(String(row[idColumn]));
    }
    await client.exec("COMMIT");
  } catch (cause) {
    // Roll back before rethrowing, or the connection is left in a failed
    // transaction and every later statement errors with a misleading message.
    await client.exec("ROLLBACK").catch(() => undefined);
    throw cause;
  }

  return { table: target.table, written: ids.length, ids };
}

/**
 * Delete every row of `target`.
 *
 * Used by a rebuild. Deliberately **not** a merge: Electric's must-refetch means
 * the previous generation is untrustworthy, and merging a fresh snapshot into it
 * would leave rows no longer present upstream sitting in local storage
 * indefinitely. ADR-009 requires removal, not reconciliation.
 */
export async function truncateTarget(
  client: WriterClient,
  target: TableTarget,
): Promise<void> {
  validateTarget(target);
  await client.query(`DELETE FROM ${target.table}`);
}
