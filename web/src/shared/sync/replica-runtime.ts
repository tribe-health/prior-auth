/**
 * The replica runtime — the consumer that binds the sync modules together.
 *
 * Everything under `shared/sync` was written as an independently testable
 * piece: a lease, a ledger, a chunk writer, a publisher, a rebuild. None of
 * them called each other, so none of them ran. This is the missing orchestrator
 * that turns them into a data path.
 *
 * The sequence it enforces, and why each step is where it is:
 *
 *   1. **Acquire the lease.** Two tabs hold handles to the same database and
 *      both will apply migrations. Exactly one may. A caller that cannot take
 *      the lease is not an error — it is a passenger tab, and it reads without
 *      syncing (ADR-009: blocking reads would make a background tab appear
 *      broken for no safety gain).
 *   2. **Migrate under that lease**, never before it.
 *   3. **Evaluate the stored checkpoint** with PEM's `evaluateResume`. It
 *      answers resume-or-rebuild; this module does not re-derive that decision.
 *   4. **Rebuild if refused**, which bumps the generation *before* clearing.
 *   5. **Fetch, write, checkpoint, publish** — per revision, in that order.
 *
 * ## What this module deliberately does not do
 *
 * It does not know how rows are fetched. `ReplicaTransport` is a port: an
 * Electric `ShapeStream` today, an FRF `/v1/shape` client if ASO adopts the
 * facade, a fixture in a test. That choice is an architecture decision that has
 * not been made, and hard-coding either one here would quietly make it.
 *
 * It does not decide what is PHI. The column boundary lives in
 * `pglite-schema.ts` and `writeChunk`'s projection; this module passes targets
 * through and never widens them.
 */

import {
  evaluateResume,
  type ReplicaCheckpoint,
  type ResumeDecision,
} from "@prometheus-ags/entity-graph-core";

import {
  writeChunk,
  type ChunkRow,
  type TableTarget,
  type WriterClient,
} from "./chunk-writer";
import {
  applyMigration,
  currentGeneration,
  ensureLedger,
  type LedgerClient,
} from "./migration-ledger";
import {
  publishRevision,
  toBatches,
  type PublishTarget,
} from "./replica-publisher";
import { rebuildGeneration, rebuildTrigger, type RebuildResult } from "./replica-rebuild";
import type { ReplicaLease } from "./replica-owner";

/** The database surface this runtime needs. PGlite satisfies it. */
export type ReplicaClient = WriterClient & LedgerClient;

/**
 * One unit of data from upstream.
 *
 * `mustRefetch` is the server saying the history this cursor points into is
 * gone. It is carried on the revision rather than thrown, because it is a
 * routine control signal, not a failure.
 */
export interface ReplicaRevision {
  /** Rows per table, already column-projected upstream. */
  tables: ReadonlyArray<{ target: TableTarget; rows: readonly ChunkRow[] }>;
  /** Cursor to persist once the rows above are committed. */
  checkpoint: { handle: string; offset: string };
  /** Server signalled the shape history is gone; rebuild rather than resume. */
  mustRefetch?: boolean;
}

/**
 * How rows arrive.
 *
 * Deliberately a port, not an implementation. ASO reads Electric directly
 * today; ADR-009 targets an authorized FRF facade. Both satisfy this shape, so
 * adopting the facade is a change of adapter, not of runtime.
 */
export interface ReplicaTransport {
  /**
   * Fetch the next revision, or `null` when caught up.
   *
   * `from` is the checkpoint to resume at, or `null` for a cold start.
   */
  fetch(from: ReplicaCheckpoint | null): Promise<ReplicaRevision | null>;
}

/** Where the resume checkpoint is stored between sessions. */
export interface CheckpointStore {
  read(key: string): Promise<{ value: string | null; checkpoint: ReplicaCheckpoint | null }>;
  /** Must commit the value and its checkpoint together, or neither. */
  write(key: string, value: string, checkpoint: ReplicaCheckpoint): Promise<void>;
}

export interface ReplicaRuntimeOptions {
  client: ReplicaClient;
  transport: ReplicaTransport;
  checkpoints: CheckpointStore;
  /** PEM graph store. Each revision publishes into it exactly once. */
  graph: PublishTarget;
  lease: ReplicaLease;
  /** Namespaced per principal + practice + identity — see `graphStorageKey`. */
  storageKey: string;
  /** The tables this replica syncs. The PHI boundary, passed through unchanged. */
  targets: readonly TableTarget[];
  /** Entity type name per table, for the graph projection. */
  entityTypeFor: (table: string) => string;
  /** Schema migrations, applied under the lease before any sync. */
  migrations?: ReadonlyArray<{ id: string; sql: string }>;
  /** Called on each published revision — status surfacing, not control flow. */
  onRevision?: (summary: RevisionSummary) => void;
}

export interface RevisionSummary {
  written: number;
  tables: readonly string[];
  checkpoint: ReplicaCheckpoint;
}

export type StartOutcome =
  | { status: "syncing"; generation: number; resumed: boolean }
  | { status: "passenger"; reason: "lease-held-elsewhere" };

/**
 * Bring the replica up and sync until caught up.
 *
 * Returns `passenger` when another tab owns the lease — a normal outcome, not
 * an error. That tab syncs; this one reads what lands.
 */
export async function startReplicaRuntime(
  opts: ReplicaRuntimeOptions,
): Promise<StartOutcome> {
  const { client, checkpoints, lease, storageKey } = opts;

  // 1. One writer. A passenger tab still reads the database it does not own.
  const acquired = await lease.acquire();
  if (!acquired.granted) {
    return { status: "passenger", reason: "lease-held-elsewhere" };
  }

  // 2. Migrate under the lease, never before it.
  await ensureLedger(client);
  for (const migration of opts.migrations ?? []) {
    await applyMigration(client, migration.id, migration.sql);
  }

  // 3. Ask PEM whether the stored checkpoint may be resumed. This module does
  //    not re-implement that judgement — a second opinion would be a second
  //    place for it to be wrong.
  const generation = await currentGeneration(client);
  const stored = await checkpoints.read(storageKey);
  const decision: ResumeDecision = evaluateResume(stored, { generation });

  let from: ReplicaCheckpoint | null = null;
  let activeGeneration = generation;

  if (decision.action === "resume") {
    from = decision.checkpoint;
  } else {
    // 4. Refused. Rebuild bumps the generation *before* clearing, so a crash
    //    mid-rebuild leaves a replica that rebuilds again rather than one that
    //    looks complete.
    const rebuilt = await rebuildFor(opts, "resume-rejected");
    activeGeneration = rebuilt.generation;
  }

  const resumed = from !== null;
  await drain(opts, from, activeGeneration);
  return { status: "syncing", generation: activeGeneration, resumed };
}

/**
 * Pull revisions until the transport reports it is caught up.
 *
 * Each revision is committed, checkpointed, then published — in that order, so
 * a subscriber never observes rows the replica cannot resume from.
 */
async function drain(
  opts: ReplicaRuntimeOptions,
  from: ReplicaCheckpoint | null,
  generation: number,
): Promise<void> {
  let cursor = from;
  let activeGeneration = generation;

  for (;;) {
    const revision = await opts.transport.fetch(cursor);
    if (revision === null) return;

    // A must-refetch is the server saying this cursor's history is gone. Start
    // over from cold rather than applying rows onto a replica it no longer
    // describes.
    const trigger = rebuildTrigger({ mustRefetch: revision.mustRefetch });
    if (trigger !== null) {
      const rebuilt = await rebuildFor(opts, trigger);
      activeGeneration = rebuilt.generation;
      cursor = null;
      continue;
    }

    cursor = await applyRevision(opts, revision, activeGeneration);
  }
}

/**
 * Commit one revision: rows, then checkpoint, then a single publication.
 *
 * The order is the contract. Publishing before the checkpoint is durable would
 * let a subscriber render data the replica would lose on restart.
 */
async function applyRevision(
  opts: ReplicaRuntimeOptions,
  revision: ReplicaRevision,
  generation: number,
): Promise<ReplicaCheckpoint> {
  const written: Array<{ type: string; rows: Record<string, unknown>[] }> = [];
  let total = 0;

  for (const { target, rows } of revision.tables) {
    if (rows.length === 0) continue;
    const result = await writeChunk(opts.client, target, rows);
    total += result.written;
    written.push({
      type: opts.entityTypeFor(target.table),
      rows: rows as Record<string, unknown>[],
    });
  }

  const checkpoint: ReplicaCheckpoint = {
    handle: revision.checkpoint.handle,
    offset: revision.checkpoint.offset,
    generation,
  };
  await opts.checkpoints.write(opts.storageKey, revision.checkpoint.offset, checkpoint);

  // Exactly one publication per revision. Splitting it per table is the defect
  // replica-publisher exists to prevent: a subscriber would observe a citation
  // pointing at a document that had not arrived.
  publishRevision(opts.graph, toBatches(written));

  opts.onRevision?.({
    written: total,
    tables: written.map((w) => w.type),
    checkpoint,
  });

  return checkpoint;
}

/** Rebuild every target, returning the new generation. */
async function rebuildFor(
  opts: ReplicaRuntimeOptions,
  trigger: Exclude<ReturnType<typeof rebuildTrigger>, null>,
): Promise<RebuildResult> {
  return rebuildGeneration(opts.client, opts.targets, trigger);
}
