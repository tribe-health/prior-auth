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
 *   3. **Evaluate the stored checkpoint set.** Every authorized shape must
 *      retain its own opaque handle and offset for the current generation.
 *   4. **Rebuild if refused**, which bumps the generation *before* clearing.
 *   5. **Fetch, write, checkpoint, publish** — per revision, in that order.
 *
 * ## What this module deliberately does not do
 *
 * It does not know how rows are fetched. `ReplicaTransport` is a port. The
 * production composition supplies the authorized FRF `/v1/shape` adapter; unit
 * tests supply deterministic transports without changing materialization.
 *
 * It does not decide what is PHI. The column boundary lives in
 * `pglite-schema.ts` and `writeChunk`'s projection; this module passes targets
 * through and never widens them.
 */

import {
  type CommittedReplicaBatch,
  type ReplicaCommitReceipt,
  type ReplicaProjectionStatus,
} from "@prometheus-ags/entity-graph-core";

import {
  validateTarget,
  writeChunkInTransaction,
  type ChunkRow,
  type TableTarget,
  type WriterClient,
} from "./chunk-writer";
import {
  currentGeneration,
  migrateReplicaSchema,
  type ReplicaSchemaPlan,
  type TransactionalLedgerClient,
} from "./migration-ledger";
import { rebuildGeneration, rebuildTrigger, type RebuildResult } from "./replica-rebuild";
import type { ReplicaLease } from "./replica-owner";
import { publishReplicaRevalidationFailure } from "../session-revocation-events";

/** The database surface this runtime needs. PGlite satisfies it. */
export type ReplicaClient = WriterClient & TransactionalLedgerClient;

/**
 * One unit of data from upstream.
 *
 * `mustRefetch` is the server saying the history this cursor points into is
 * gone. It is carried on the revision rather than thrown, because it is a
 * routine control signal, not a failure.
 */
export interface ShapeCheckpoint {
  readonly handle: string;
  readonly offset: string;
}

/** Every shape has an independent opaque position in Electric's log. */
export interface ReplicaCheckpointSet {
  readonly generation: number;
  readonly shapes: Readonly<Record<string, ShapeCheckpoint>>;
}

export interface ReplicaTableRevision {
  readonly shape: string;
  readonly target: TableTarget;
  readonly rows: readonly ChunkRow[];
}

export interface ReplicaRevision {
  /** Rows per table, already column-projected upstream. */
  tables: ReadonlyArray<ReplicaTableRevision>;
  /** Per-shape cursors to persist once the rows above are committed. */
  checkpoint: Readonly<Record<string, ShapeCheckpoint>>;
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
  fetch(from: ReplicaCheckpointSet | null, signal?: AbortSignal): Promise<ReplicaRevision | null>;
}

/** Where the resume checkpoint is stored between sessions. */
export interface CheckpointStore {
  read(key: string): Promise<{ value: string | null; checkpoint: ReplicaCheckpointSet | null }>;
  /** Called with the transaction handle that is applying the described rows. */
  write(
    client: WriterClient,
    key: string,
    value: string,
    checkpoint: ReplicaCheckpointSet,
  ): Promise<void>;
}

/** The adopted PEM projector surface owned by this materializer. */
export interface ReplicaProjector {
  getStatus(): Readonly<ReplicaProjectionStatus>;
  advanceGeneration(generation: number): void;
  publish(
    batch: CommittedReplicaBatch,
    committed: Promise<ReplicaCommitReceipt>,
  ): Promise<ReplicaCommitReceipt>;
}

/** A terminal authority result. The runtime publishes it into the RA06 fence. */
export class ReplicaAuthorityFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReplicaAuthorityFailure";
  }
}

export interface ReplicaRuntimeOptions {
  client: ReplicaClient;
  transport: ReplicaTransport;
  checkpoints: CheckpointStore;
  /** PEM committed projector. Each SQL transaction publishes through it once. */
  projector: ReplicaProjector;
  lease: ReplicaLease;
  /** The RA11b owner has already acquired and migrated this resource. */
  ownership?: "acquire" | "held";
  /** Whether this bounded drain releases the lease or its caller retains it. */
  leaseLifetime?: "drain" | "caller";
  /** Cancels a retained fetch loop before database teardown. */
  signal?: AbortSignal;
  /** Namespaced per principal + practice + identity — see `graphStorageKey`. */
  storageKey: string;
  /** The tables this replica syncs. The PHI boundary, passed through unchanged. */
  targets: readonly TableTarget[];
  /** Shape identifiers required for a checkpoint to be complete. */
  checkpointShapes: readonly string[];
  /** Entity type name per table, for the graph projection. */
  entityTypeFor: (table: string) => string;
  /** Checksummed logical schema and generation. */
  schemaPlan?: ReplicaSchemaPlan;
  /** Called on each published revision — status surfacing, not control flow. */
  onRevision?: (summary: RevisionSummary) => void;
  /** Called after transport catch-up and the final committed publication. */
  onCaughtUp?: () => void;
  /** Verifies the captured session/grant tuple before durable or visible work. */
  assertAuthority?: () => void;
}

export interface RevisionSummary {
  written: number;
  tables: readonly string[];
  checkpoint: ReplicaCheckpointSet;
  sequence: number;
  mode: "replace" | "delta";
}

export type StartOutcome =
  | { status: "syncing"; generation: number; resumed: boolean }
  | { status: "passenger"; reason: "lease-held-elsewhere" }
  | {
      status: "recovery-required";
      reason:
        | "invalid-plan-checksum"
        | "invalid-migration-plan"
        | "checksum-drift"
        | "newer-schema"
        | "newer-generation"
        | "migration-failed"
        | "storage-failed"
        | "ownership-required";
      migrationId?: string;
      diagnostic?: string;
    };

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
  const acquiredHere = opts.ownership !== "held";

  // 1. One writer. A passenger tab still reads the database it does not own.
  if (acquiredHere) {
    const acquired = await lease.acquire();
    if (!acquired.granted) {
      return { status: "passenger", reason: "lease-held-elsewhere" };
    }
  }

  try {
    // 2. Migrate under the lease, never before it.
    if (acquiredHere) {
      const migrated = await migrateReplicaSchema(
        client,
        opts.schemaPlan ?? { logicalVersion: 0, generation: 1, migrations: [] },
        lease,
      );
      if (migrated.status === "recovery-required") {
        return {
          status: "recovery-required",
          reason: migrated.reason,
          migrationId: migrated.migrationId,
          diagnostic: migrated.diagnostic,
        };
      }
    }

    // 3. Resume only a complete checkpoint set from this generation. A single
    //    handle/offset cannot describe several independently advancing shapes.
    const generation = await currentGeneration(client);
    const stored = await checkpoints.read(storageKey);

    let from: ReplicaCheckpointSet | null = null;
    let activeGeneration = generation;

    if (
      stored.value !== null
      && isCompleteCheckpoint(stored.checkpoint, generation, opts.checkpointShapes)
    ) {
      from = stored.checkpoint;
    } else {
      // 4. Refused. Rebuild bumps the generation *before* clearing, so a crash
      //    mid-rebuild leaves a replica that rebuilds again rather than one that
      //    looks complete.
      const rebuilt = await rebuildFor(opts, "resume-rejected");
      activeGeneration = rebuilt.generation;
    }

    const resumed = from !== null;
    await drain(opts, from, activeGeneration, from === null ? null : stored.value);
    assertActive(opts);
    opts.onCaughtUp?.();
    return { status: "syncing", generation: activeGeneration, resumed };
  } catch (cause) {
    if (cause instanceof ReplicaAuthorityFailure) {
      publishReplicaRevalidationFailure(cause.message);
    }
    throw cause;
  } finally {
    if (acquiredHere && opts.leaseLifetime !== "caller") {
      await lease.release();
    }
  }
}

/**
 * Pull revisions until the transport reports it is caught up.
 *
 * Each revision is committed, checkpointed, then published — in that order, so
 * a subscriber never observes rows the replica cannot resume from.
 */
async function drain(
  opts: ReplicaRuntimeOptions,
  from: ReplicaCheckpointSet | null,
  generation: number,
  resumeTransactionId: string | null,
): Promise<void> {
  let cursor = from;
  let activeGeneration = generation;

  for (;;) {
    assertActive(opts);
    const revision = await opts.transport.fetch(cursor, opts.signal);
    if (revision === null) {
      // The transport has just completed an authorized pass. If a prior
      // process committed SQL/checkpoint and died before graph publication,
      // rebuild the new projector only now, after server revalidation.
      if (
        cursor !== null
        && resumeTransactionId !== null
        && opts.projector.getStatus().transactionId !== resumeTransactionId
      ) {
        await publishCommittedResume(opts, activeGeneration, resumeTransactionId);
      }
      return;
    }

    // A must-refetch is the server saying this cursor's history is gone. Start
    // over from cold rather than applying rows onto a replica it no longer
    // describes.
    const trigger = rebuildTrigger({ mustRefetch: revision.mustRefetch });
    if (trigger !== null) {
      const rebuilt = await rebuildFor(opts, trigger);
      activeGeneration = rebuilt.generation;
      cursor = null;
      resumeTransactionId = null;
      continue;
    }

    if (
      cursor !== null
      && resumeTransactionId !== null
      && opts.projector.getStatus().transactionId !== resumeTransactionId
    ) {
      await publishCommittedResume(opts, activeGeneration, resumeTransactionId);
    }
    resumeTransactionId = null;

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
): Promise<ReplicaCheckpointSet> {
  const checkpoint: ReplicaCheckpointSet = {
    generation,
    shapes: revision.checkpoint,
  };
  const transactionId = crypto.randomUUID();
  const sequence = opts.projector.getStatus().lastSequence + 1;
  const mode = sequence === 1 ? "replace" : "delta";
  const batchId = `${generation}:${sequence}:${transactionId}`;

  assertActive(opts);
  const commit = opts.client.transaction(async (transactionClient) => {
    let total = 0;
    assertActive(opts);
    for (const { target, rows } of revision.tables) {
      if (rows.length === 0) continue;
      const result = await writeChunkInTransaction(transactionClient, target, rows);
      total += result.written;
    }
    assertActive(opts);
    await opts.checkpoints.write(
      transactionClient,
      opts.storageKey,
      transactionId,
      checkpoint,
    );
    assertActive(opts);
    const selected = mode === "replace"
      ? opts.targets
      : revision.tables.map(({ target }) => target);
    const { tables, lists } = await readProjection(transactionClient, selected);
    assertActive(opts);
    const receipt: ReplicaCommitReceipt = {
      scopeId: opts.storageKey,
      generation,
      batchId,
      sequence,
      transactionId,
    };
    return { receipt, tables, lists, total };
  });
  const committed = await commit;

  assertActive(opts);
  await opts.projector.publish(
    {
      scopeId: opts.storageKey,
      generation,
      batchId,
      sequence,
      mode,
      tables: committed.tables,
      lists: committed.lists,
    },
    commit.then(({ receipt }) => receipt),
  );

  opts.onRevision?.({
    written: committed.total,
    tables: committed.tables.map(({ table }) => opts.entityTypeFor(table)),
    checkpoint,
    sequence,
    mode,
  });

  return checkpoint;
}

async function publishCommittedResume(
  opts: ReplicaRuntimeOptions,
  generation: number,
  transactionId: string,
): Promise<void> {
  assertActive(opts);
  const { tables, lists } = await readProjection(opts.client, opts.targets);
  assertActive(opts);
  const sequence = opts.projector.getStatus().lastSequence + 1;
  const batchId = `resume:${generation}:${sequence}:${transactionId}`;
  const receipt: ReplicaCommitReceipt = {
    scopeId: opts.storageKey,
    generation,
    batchId,
    sequence,
    transactionId,
  };
  await opts.projector.publish(
    {
      scopeId: opts.storageKey,
      generation,
      batchId,
      sequence,
      mode: "replace",
      tables,
      lists,
    },
    Promise.resolve(receipt),
  );
  assertActive(opts);
}

async function readProjection(
  client: WriterClient,
  selected: readonly TableTarget[],
): Promise<{
  tables: CommittedReplicaBatch["tables"];
  lists: CommittedReplicaBatch["lists"];
}> {
  const uniqueTargets = [...new Map(selected.map((target) => [target.table, target])).values()];
  const tables: CommittedReplicaBatch["tables"][number][] = [];
  const lists: CommittedReplicaBatch["lists"][number][] = [];
  for (const target of uniqueTargets) {
    validateTarget(target);
    const idColumn = target.idColumn ?? "id";
    const rows: Record<string, unknown>[] = [];
    let afterId: string | undefined;
    for (;;) {
      const page = await client.query<Record<string, unknown>>(
        afterId === undefined
          ? `SELECT * FROM ${target.table} ORDER BY ${idColumn} LIMIT 500`
          : `SELECT * FROM ${target.table} WHERE ${idColumn} > $1 ORDER BY ${idColumn} LIMIT 500`,
        afterId === undefined ? undefined : [afterId],
      );
      rows.push(...page.rows);
      if (page.rows.length < 500) break;
      afterId = String(page.rows[page.rows.length - 1]![idColumn]);
    }
    tables.push({ table: target.table, rows });
    lists.push({
      key: `replica:${target.table}`,
      ids: rows.map((row) => String(row[idColumn])),
    });
  }
  return { tables, lists };
}

function assertActive(opts: ReplicaRuntimeOptions): void {
  opts.signal?.throwIfAborted();
  opts.assertAuthority?.();
}

/** Rebuild every target, returning the new generation. */
async function rebuildFor(
  opts: ReplicaRuntimeOptions,
  trigger: Exclude<ReturnType<typeof rebuildTrigger>, null>,
): Promise<RebuildResult> {
  assertActive(opts);
  const rebuilt = await opts.client.transaction(async (transactionClient) => {
    assertActive(opts);
    return rebuildGeneration(
      transactionClient,
      opts.targets,
      trigger,
      () => assertActive(opts),
    );
  });
  assertActive(opts);
  opts.projector.advanceGeneration(rebuilt.generation);
  return rebuilt;
}

function isCompleteCheckpoint(
  checkpoint: ReplicaCheckpointSet | null,
  generation: number,
  expectedShapes: readonly string[],
): checkpoint is ReplicaCheckpointSet {
  if (
    checkpoint === null
    || !Number.isSafeInteger(checkpoint.generation)
    || checkpoint.generation !== generation
    || checkpoint.shapes === null
    || typeof checkpoint.shapes !== "object"
  ) {
    return false;
  }
  const shapeNames = Object.keys(checkpoint.shapes);
  if (shapeNames.length !== expectedShapes.length) return false;
  return expectedShapes.every((shape) => {
    if (!Object.prototype.hasOwnProperty.call(checkpoint.shapes, shape)) return false;
    const cursor = checkpoint.shapes[shape];
    return cursor !== null
      && typeof cursor === "object"
      && typeof cursor.handle === "string"
      && cursor.handle.length > 0
      && typeof cursor.offset === "string"
      && cursor.offset.length > 0;
  });
}
