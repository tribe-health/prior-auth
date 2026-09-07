/**
 * Publish one database revision as one graph revision.
 *
 * ── The property this exists to hold ────────────────────────────────────────
 *
 * A subscriber must observe either the previous complete projection or the next
 * one — never a half-updated relationship where a citation points at a document
 * that has not arrived. ADR-009 is explicit that this must be shown by
 * *subscriber traces*, not by rendered screens: React batches its own renders,
 * but imperative subscribers read Zustand directly and see every intermediate
 * `set`.
 *
 * That is why this module exists at all. Writing rows table-by-table is fine —
 * SQL is not what subscribers watch. Publishing table-by-table is not: N tables
 * would mean N publications and N chances to observe a partial graph.
 *
 * ── Why one call, not a transaction ─────────────────────────────────────────
 *
 * PEM's `ingestFetchedList` is a single Zustand `set(...)` that commits the
 * primary entity batch, `sideBatches`, `lists` and view-backed `projections`
 * together. So coherence here is not achieved by wrapping anything — it is
 * achieved by *not splitting* what PEM already commits atomically. The whole
 * revision is folded into one call with the extra tables as `sideBatches`.
 *
 * ADR-009 G4 (flint-realtime-fabric).
 */

/** Rows materialized for one entity type in this revision. */
export interface PublishBatch {
  /** Entity type name in the graph (e.g. the catalog's declared type). */
  type: string;
  entries: Array<{ id: string; data: Record<string, unknown> }>;
}

/** The subset of PEM's graph store this needs. */
export interface PublishTarget {
  getState: () => {
    ingestFetchedList: (
      type: string,
      entries: Array<{ id: string; data: Record<string, unknown> }>,
      options?: {
        sideBatches?: Array<{
          type: string;
          entries: Array<{ id: string; data: Record<string, unknown> }>;
        }>;
      },
    ) => void;
  };
}

/**
 * Publish every batch of a revision in ONE store update.
 *
 * The first batch is the primary; the rest ride as `sideBatches`, which PEM
 * documents as "rows that must commit or fail with the primary batch". Order
 * among them does not matter — they land in the same `set`.
 *
 * An empty revision publishes nothing rather than an empty list: a publication
 * that changes no entity would still wake every subscriber for no reason.
 */
export function publishRevision(target: PublishTarget, batches: readonly PublishBatch[]): void {
  const nonEmpty = batches.filter((b) => b.entries.length > 0);
  if (nonEmpty.length === 0) return;

  const [primary, ...rest] = nonEmpty;
  // Exactly one call. Splitting this loop into per-batch calls is the defect
  // this module exists to prevent — see the subscriber-trace test.
  target.getState().ingestFetchedList(
    primary.type,
    primary.entries,
    rest.length > 0 ? { sideBatches: rest.map((b) => ({ type: b.type, entries: b.entries })) } : {},
  );
}

/**
 * Turn written rows into publishable batches.
 *
 * Kept separate from `publishRevision` so the shape of a revision can be
 * inspected and asserted without a store, and so the mapping from "rows I
 * wrote" to "entities the graph holds" is one visible step rather than being
 * buried in the publish call.
 */
export function toBatches(
  written: ReadonlyArray<{ type: string; rows: ReadonlyArray<Record<string, unknown>>; idColumn?: string }>,
): PublishBatch[] {
  return written.map(({ type, rows, idColumn = "id" }) => ({
    type,
    entries: rows.map((row) => ({ id: String(row[idColumn]), data: { ...row } })),
  }));
}
