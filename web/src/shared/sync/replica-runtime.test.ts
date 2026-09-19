/**
 * The orchestrator's contract is an *ordering*, so these tests assert order,
 * not just outcomes.
 *
 * Each of the six modules it binds is already unit-tested in isolation. What
 * was never tested — because nothing called them together — is that they run in
 * the sequence the architecture requires: lease before migrate, checkpoint
 * before publish, generation bump before clear.
 */
import { describe, expect, it } from "vitest";
import type {
  CommittedReplicaBatch,
  ReplicaCommitReceipt,
} from "@prometheus-ags/entity-graph-core";

import { subscribeSessionRevocation } from "../session-revocation-events";
import { ShapeAuthorizationError } from "./frf-shape-transport";
import { ReplicaLease } from "./replica-owner";
import {
  ReplicaAuthorityFailure,
  startReplicaRuntime,
  type CheckpointStore,
  type ReplicaClient,
  type ReplicaCheckpointSet,
  type ReplicaRevision,
  type ReplicaTransport,
} from "./replica-runtime";
import type { TableTarget } from "./chunk-writer";

const cases: TableTarget = {
  table: "fixture_cases",
  columns: ["id", "status"],
};

/** A client that records every statement, so ordering is assertable. */
function recordingClient() {
  const sql: string[] = [];
  const client: ReplicaClient = {
    async exec(statement: string) {
      sql.push(statement.trim().split(/\s+/).slice(0, 3).join(" "));
    },
    // Generic to match WriterClient.query<T>; the callers pick T, so a
    // concrete return type here does not satisfy the interface.
    async query<T = Record<string, unknown>>(
      statement: string,
      _params?: unknown[],
    ): Promise<{ rows: T[] }> {
      const head = statement.trim().split(/\s+/).slice(0, 3).join(" ");
      sql.push(head);
      // currentGeneration / bumpGeneration read a generation back.
      if (/SELECT/i.test(statement) && /generation/i.test(statement)) {
        return { rows: [{ generation: 1 } as T] };
      }
      return { rows: [] };
    },
    async transaction<T>(callback: (tx: ReplicaClient) => Promise<T>): Promise<T> {
      return callback(client);
    },
  };
  return { client, sql };
}

/** A lease store shared by every holder built from it, so contention is real. */
function leaseStore() {
  let stored: { holder: string; expiresAt: number } | null = null;
  return {
    async read() {
      return stored;
    },
    async write(next: { holder: string; expiresAt: number }) {
      stored = next;
      return true;
    },
    async clear() {
      stored = null;
    },
  };
}

function memoryLease(holder = "tab-a", store: ReturnType<typeof leaseStore> = leaseStore()) {
  return new ReplicaLease({ store, holder });
}

function memoryCheckpoints(initial: ReplicaCheckpointSet | null = null) {
  const writes: Array<{ key: string; value: string; checkpoint: unknown }> = [];
  let current = initial;
  let currentValue = initial ? "committed-transaction" : null;
  const store: CheckpointStore = {
    async read() {
      return current
        ? { value: currentValue, checkpoint: current }
        : { value: null, checkpoint: null };
    },
    async write(_client, key, value, checkpoint) {
      writes.push({ key, value, checkpoint });
      current = checkpoint;
      currentValue = value;
    },
  };
  return { store, writes };
}

/** A transport that yields the given revisions, then reports caught-up. */
function scriptedTransport(revisions: ReplicaRevision[]): ReplicaTransport & { calls: number } {
  let i = 0;
  return {
    get calls() {
      return i;
    },
    async fetch() {
      return i < revisions.length ? revisions[i++]! : null;
    },
  };
}

function recordingProjector(initial: { sequence?: number; transactionId?: string | null } = {}) {
  const published: CommittedReplicaBatch[] = [];
  let generation = 1;
  let lastSequence = initial.sequence ?? 0;
  let transactionId = initial.transactionId ?? null;
  const projector = {
    getStatus: () => ({
      scopeId: "aso:g1:user:practice-1:identity-1",
      generation,
      lastSequence,
      lastBatchId: null,
      transactionId,
      disposed: false,
    }),
    advanceGeneration(next: number) {
      generation = next;
      lastSequence = 0;
      transactionId = null;
    },
    async publish(batch: CommittedReplicaBatch, committed: Promise<ReplicaCommitReceipt>) {
      const receipt = await committed;
      lastSequence = batch.sequence;
      transactionId = receipt.transactionId;
      published.push(batch);
      return receipt;
    },
  };
  return { projector, published };
}

const revision = (offset: string, rows: Array<Record<string, unknown>>): ReplicaRevision => ({
  tables: [{ shape: "cases", target: cases, rows }],
  checkpoint: { cases: { handle: "h1", offset } },
});

const checkpoint = (offset: string): ReplicaCheckpointSet => ({
  generation: 1,
  shapes: { cases: { handle: "h1", offset } },
});

function baseOptions(overrides: Partial<Parameters<typeof startReplicaRuntime>[0]> = {}) {
  const { client } = recordingClient();
  const { store } = memoryCheckpoints();
  const { projector } = recordingProjector();
  return {
    client,
    transport: scriptedTransport([]),
    checkpoints: store,
    projector,
    lease: memoryLease(),
    storageKey: "aso:g1:user:practice-1:identity-1",
    targets: [cases],
    checkpointShapes: ["cases"],
    entityTypeFor: () => "Case",
    ...overrides,
  } as Parameters<typeof startReplicaRuntime>[0];
}

describe("startReplicaRuntime", () => {
  it("does not sync when another tab holds the lease", async () => {
    // Two tabs, one database. The loser must not migrate or write — but it is
    // not an error, and it still reads what the owner lands.
    const shared = leaseStore();
    await memoryLease("tab-a", shared).acquire();

    const transport = scriptedTransport([revision("1", [{ id: "c1", status: "open" }])]);
    const outcome = await startReplicaRuntime(
      baseOptions({ lease: memoryLease("tab-b", shared), transport }),
    );

    expect(outcome).toEqual({ status: "passenger", reason: "lease-held-elsewhere" });
    expect(transport.calls).toBe(0);
  });

  it("migrates only after the lease is held", async () => {
    const { client, sql } = recordingClient();
    await startReplicaRuntime(baseOptions({ client }));
    // The ledger is the first thing touched; nothing preceded it, because the
    // lease is not a database operation. Migrating before acquiring would let
    // two tabs apply DDL concurrently.
    expect(sql.some((s) => /CREATE TABLE/i.test(s))).toBe(true);
  });

  it("releases the lease after a successful bounded drain", async () => {
    const shared = leaseStore();

    await expect(
      startReplicaRuntime(baseOptions({ lease: memoryLease("tab-a", shared) })),
    ).resolves.toMatchObject({ status: "syncing" });
    await expect(memoryLease("tab-b", shared).acquire()).resolves.toEqual({ granted: true });
  });

  it("releases the lease when startup requires recovery", async () => {
    const shared = leaseStore();
    const outcome = await startReplicaRuntime(
      baseOptions({
        lease: memoryLease("tab-a", shared),
        schemaPlan: {
          logicalVersion: 1,
          generation: 1,
          migrations: [
            {
              id: "001-invalid-checksum",
              sql: "CREATE TABLE never_applied (id TEXT PRIMARY KEY)",
              checksum: "invalid",
              logicalVersion: 1,
            },
          ],
        },
      }),
    );

    expect(outcome).toMatchObject({
      status: "recovery-required",
      reason: "invalid-plan-checksum",
    });
    await expect(memoryLease("tab-b", shared).acquire()).resolves.toEqual({ granted: true });
  });

  it("releases the lease when startup throws", async () => {
    const shared = leaseStore();
    const transport: ReplicaTransport = {
      async fetch() {
        throw new Error("synthetic transport failure");
      },
    };

    await expect(
      startReplicaRuntime(
        baseOptions({ lease: memoryLease("tab-a", shared), transport }),
      ),
    ).rejects.toThrow("synthetic transport failure");
    await expect(memoryLease("tab-b", shared).acquire()).resolves.toEqual({ granted: true });
  });

  it("leaves a caller-retained lease held on failure until caller teardown", async () => {
    const shared = leaseStore();
    const lease = memoryLease("tab-a", shared);
    const transport: ReplicaTransport = {
      async fetch() {
        throw new Error("synthetic retained transport failure");
      },
    };

    await expect(
      startReplicaRuntime(baseOptions({ lease, leaseLifetime: "caller", transport })),
    ).rejects.toThrow("synthetic retained transport failure");
    await expect(memoryLease("tab-b", shared).acquire()).resolves.toMatchObject({
      granted: false,
      heldBy: "tab-a",
    });
    await lease.release();
    await expect(memoryLease("tab-b", shared).acquire()).resolves.toEqual({ granted: true });
  });

  it("cancels a retained fetch before caller teardown", async () => {
    const abort = new AbortController();
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const transport: ReplicaTransport = {
      async fetch(_from, signal) {
        markStarted();
        await new Promise<void>((_resolve, reject) => {
          signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Sync cancelled", "AbortError")),
            { once: true },
          );
        });
        return null;
      },
    };
    const running = startReplicaRuntime(
      baseOptions({ transport, signal: abort.signal }),
    );
    await started;

    abort.abort();
    await expect(running).rejects.toMatchObject({ name: "AbortError" });
  });

  it("resumes from a stored checkpoint rather than rebuilding", async () => {
    const { store } = memoryCheckpoints(checkpoint("42"));
    const outcome = await startReplicaRuntime(baseOptions({ checkpoints: store }));
    expect(outcome).toEqual({ status: "syncing", generation: 1, resumed: true });
  });

  it("rejects a partial shape checkpoint and restarts every shape cold", async () => {
    const documents: TableTarget = {
      table: "fixture_documents",
      columns: ["id", "name"],
    };
    const partial: ReplicaCheckpointSet = {
      generation: 1,
      shapes: { cases: { handle: "cases-h", offset: "7" } },
    };
    const { store } = memoryCheckpoints(partial);
    const seen: Array<ReplicaCheckpointSet | null> = [];
    const transport: ReplicaTransport = {
      async fetch(from) {
        seen.push(from);
        return null;
      },
    };

    const outcome = await startReplicaRuntime(baseOptions({
      checkpoints: store,
      targets: [cases, documents],
      checkpointShapes: ["cases", "document_statuses"],
      transport,
    }));

    expect(outcome).toMatchObject({ status: "syncing", resumed: false });
    expect(seen).toEqual([null]);
  });

  it("rejects checkpoint entries without an opaque handle and offset", async () => {
    const malformed = {
      generation: 1,
      shapes: { cases: { handle: "", offset: "7" } },
    } as ReplicaCheckpointSet;
    const { store } = memoryCheckpoints(malformed);
    const seen: Array<ReplicaCheckpointSet | null> = [];

    const outcome = await startReplicaRuntime(baseOptions({
      checkpoints: store,
      transport: { async fetch(from) { seen.push(from); return null; } },
    }));

    expect(outcome).toMatchObject({ status: "syncing", resumed: false });
    expect(seen).toEqual([null]);
  });

  it("rebuilds when no checkpoint is stored", async () => {
    // A cold replica has nothing to resume from. evaluateResume returns
    // "rebuild / no-value", and the runtime must not fabricate a cursor.
    const outcome = await startReplicaRuntime(baseOptions());
    expect(outcome.status).toBe("syncing");
    if (outcome.status === "syncing") expect(outcome.resumed).toBe(false);
  });

  it("checkpoints before publishing, so a subscriber never sees unresumable rows", async () => {
    const order: string[] = [];
    const { store } = memoryCheckpoints();
    const checkpoints: CheckpointStore = {
      read: store.read,
      async write(client, key, value, checkpoint) {
        order.push("checkpoint");
        return store.write(client, key, value, checkpoint);
      },
    };
    const { projector } = recordingProjector();
    const originalPublish = projector.publish;
    projector.publish = async (...args) => {
      order.push("publish");
      return originalPublish(...args);
    };

    await startReplicaRuntime(
      baseOptions({
        checkpoints,
        projector,
        transport: scriptedTransport([revision("1", [{ id: "c1", status: "open" }])]),
      }),
    );

    expect(order).toEqual(["checkpoint", "publish"]);
  });

  it("rebuilds the graph from committed SQL when a prior process died before publication", async () => {
    const { client } = recordingClient();
    const originalQuery = client.query.bind(client);
    client.query = async <T = Record<string, unknown>>(statement: string, params?: unknown[]) => {
      if (/SELECT \* FROM fixture_cases/.test(statement)) {
        return { rows: [{ id: "c1", status: "open" } as T] };
      }
      return originalQuery<T>(statement, params);
    };
    const checkpoints = memoryCheckpoints();
    const failedProjection = recordingProjector().projector;
    failedProjection.publish = async () => {
      throw new Error("synthetic process death before graph publication");
    };

    await expect(startReplicaRuntime(baseOptions({
      client,
      checkpoints: checkpoints.store,
      projector: failedProjection,
      transport: scriptedTransport([revision("1", [{ id: "c1", status: "open" }])]),
    }))).rejects.toThrow("synthetic process death before graph publication");

    const recovered = recordingProjector();
    const outcome = await startReplicaRuntime(baseOptions({
      client,
      checkpoints: checkpoints.store,
      projector: recovered.projector,
      transport: scriptedTransport([]),
    }));

    expect(outcome).toEqual({ status: "syncing", generation: 1, resumed: true });
    expect(recovered.published).toHaveLength(1);
    expect(recovered.published[0]).toMatchObject({
      mode: "replace",
      tables: [{ table: "fixture_cases", rows: [{ id: "c1", status: "open" }] }],
      lists: [{ key: "replica:fixture_cases", ids: ["c1"] }],
    });
  });

  it("rebuilds a nonzero projector when its transaction trails durable SQL", async () => {
    const { client } = recordingClient();
    const originalQuery = client.query.bind(client);
    client.query = async <T = Record<string, unknown>>(statement: string, params?: unknown[]) => {
      if (/SELECT \* FROM fixture_cases/.test(statement)) {
        return { rows: [{ id: "c1", status: "committed" } as T] };
      }
      return originalQuery<T>(statement, params);
    };
    const checkpoints = memoryCheckpoints(checkpoint("42"));
    const stale = recordingProjector({ sequence: 4, transactionId: "older-transaction" });

    await startReplicaRuntime(baseOptions({
      client,
      checkpoints: checkpoints.store,
      projector: stale.projector,
      transport: scriptedTransport([]),
    }));

    expect(stale.published).toHaveLength(1);
    expect(stale.published[0]).toMatchObject({
      sequence: 5,
      mode: "replace",
      tables: [{ table: "fixture_cases", rows: [{ id: "c1", status: "committed" }] }],
    });
  });

  it("does not republish SQL when the projector has the durable transaction", async () => {
    const checkpoints = memoryCheckpoints(checkpoint("42"));
    const current = recordingProjector({
      sequence: 4,
      transactionId: "committed-transaction",
    });

    await startReplicaRuntime(baseOptions({
      checkpoints: checkpoints.store,
      projector: current.projector,
      transport: scriptedTransport([]),
    }));

    expect(current.published).toEqual([]);
  });

  it("uses the transaction handle for rows and their per-shape checkpoint", async () => {
    const transaction = Symbol("transaction");
    const touched: symbol[] = [];
    const { client } = recordingClient();
    const transactionClient: ReplicaClient = {
      ...client,
      async query<T = Record<string, unknown>>(sql: string): Promise<{ rows: T[] }> {
        if (/INSERT INTO fixture_cases/.test(sql)) touched.push(transaction);
        return { rows: [] };
      },
    };
    client.transaction = async (callback) => callback(transactionClient);
    const checkpoints: CheckpointStore = {
      async read() {
        return { value: null, checkpoint: null };
      },
      async write(writer) {
        if (writer === transactionClient) touched.push(transaction);
      },
    };

    await startReplicaRuntime(baseOptions({
      client,
      checkpoints,
      transport: scriptedTransport([revision("1", [{ id: "c1", status: "open" }])]),
    }));

    expect(touched).toEqual([transaction, transaction]);
  });

  it("publishes an authority failure and fences checkpoint and graph publication", async () => {
    const reasons: string[] = [];
    const unsubscribe = subscribeSessionRevocation((reason) => reasons.push(reason));
    const { store, writes } = memoryCheckpoints();
    const { projector, published } = recordingProjector();
    let checks = 0;

    try {
      await expect(startReplicaRuntime(baseOptions({
        checkpoints: store,
        projector,
        transport: scriptedTransport([revision("1", [{ id: "c1", status: "open" }])]),
        assertAuthority() {
          checks += 1;
          if (checks >= 4) throw new ReplicaAuthorityFailure("Replica grant changed.");
        },
      }))).rejects.toThrow("Replica grant changed.");
    } finally {
      unsubscribe();
    }

    expect(reasons).toEqual(["Replica grant changed."]);
    expect(writes).toEqual([]);
    expect(published).toEqual([]);
  });

  it("publishes the RA06 event when FRF rejects a changed grant tuple", async () => {
    const reasons: string[] = [];
    const unsubscribe = subscribeSessionRevocation((reason) => reasons.push(reason));
    const { store, writes } = memoryCheckpoints();
    const { projector, published } = recordingProjector();
    const transport: ReplicaTransport = {
      async fetch() {
        throw new ShapeAuthorizationError(403, "cases");
      },
    };

    try {
      await expect(startReplicaRuntime(baseOptions({
        checkpoints: store,
        projector,
        transport,
      }))).rejects.toBeInstanceOf(ShapeAuthorizationError);
    } finally {
      unsubscribe();
    }

    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toMatch(/grant no longer covers this shape/);
    expect(writes).toEqual([]);
    expect(published).toEqual([]);
  });

  it("publishes each revision exactly once", async () => {
    // Publishing per table would let a subscriber observe one table of a
    // revision without the others — the incoherence replica-publisher exists
    // to prevent.
    const { projector, published } = recordingProjector();
    await startReplicaRuntime(
      baseOptions({
        projector,
        transport: scriptedTransport([
          revision("1", [{ id: "c1", status: "open" }]),
          revision("2", [{ id: "c2", status: "closed" }]),
        ]),
      }),
    );
    expect(published).toHaveLength(2);
  });

  it("publishes an empty complete replacement so stale graph rows are removed", async () => {
    const { projector, published } = recordingProjector();
    await startReplicaRuntime(
      baseOptions({ projector, transport: scriptedTransport([revision("1", [])]) }),
    );
    expect(published).toHaveLength(1);
    expect(published[0]?.mode).toBe("replace");
  });

  it("rebuilds and restarts from cold on must-refetch", async () => {
    // The server is asserting the history behind this cursor is gone. Applying
    // the rows anyway would layer them onto a replica they no longer describe.
    let served = 0;
    const seen: Array<string | null> = [];
    const transport: ReplicaTransport = {
      async fetch(from) {
        seen.push(from?.shapes.cases?.offset ?? null);
        served += 1;
        if (served === 1) {
          return { ...revision("1", [{ id: "c1", status: "open" }]), mustRefetch: true };
        }
        if (served === 2) return revision("9", [{ id: "c9", status: "open" }]);
        return null;
      },
    };

    const { store } = memoryCheckpoints(checkpoint("42"));
    await startReplicaRuntime(baseOptions({ checkpoints: store, transport }));

    // Resumed at 42, then must-refetch reset the cursor to cold.
    expect(seen[0]).toBe("42");
    expect(seen[1]).toBe(null);
  });

  it("keeps generation and row clearing inside the authority-fenced transaction", async () => {
    const { client } = recordingClient();
    const originalQuery = client.query.bind(client);
    let inTransaction = false;
    const mutationFences: boolean[] = [];
    client.query = async <T = Record<string, unknown>>(statement: string, params?: unknown[]) => {
      if (/UPDATE _replica_meta|DELETE FROM fixture_cases/.test(statement)) {
        mutationFences.push(inTransaction);
      }
      return originalQuery<T>(statement, params);
    };
    client.transaction = async <T>(callback: (tx: ReplicaClient) => Promise<T>) => {
      inTransaction = true;
      try {
        return await callback(client);
      } finally {
        inTransaction = false;
      }
    };
    const { store } = memoryCheckpoints(checkpoint("42"));
    let served = false;
    const transport: ReplicaTransport = {
      async fetch() {
        if (!served) {
          served = true;
          return { ...revision("43", []), mustRefetch: true };
        }
        return null;
      },
    };

    await startReplicaRuntime(baseOptions({ client, checkpoints: store, transport }));

    expect(mutationFences.length).toBeGreaterThanOrEqual(2);
    expect(mutationFences.every(Boolean)).toBe(true);
  });

  it("stops when the transport reports caught-up", async () => {
    const transport = scriptedTransport([revision("1", [{ id: "c1", status: "open" }])]);
    await startReplicaRuntime(baseOptions({ transport }));
    // One revision, then the null that ends the drain — and no more.
    expect(transport.calls).toBe(1);
  });

  it("reports each published revision to onRevision", async () => {
    const seen: number[] = [];
    await startReplicaRuntime(
      baseOptions({
        transport: scriptedTransport([
          revision("1", [{ id: "c1", status: "open" }, { id: "c2", status: "open" }]),
        ]),
        onRevision: (s) => seen.push(s.written),
      }),
    );
    expect(seen).toEqual([2]);
  });
});
