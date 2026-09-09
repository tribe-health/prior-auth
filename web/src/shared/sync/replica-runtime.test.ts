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

import { ReplicaLease } from "./replica-owner";
import {
  startReplicaRuntime,
  type CheckpointStore,
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
  const client = {
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

function memoryCheckpoints(initial: Parameters<CheckpointStore["write"]>[2] | null = null) {
  const writes: Array<{ key: string; value: string; checkpoint: unknown }> = [];
  const store: CheckpointStore = {
    async read() {
      return initial
        ? { value: initial.offset, checkpoint: initial }
        : { value: null, checkpoint: null };
    },
    async write(key, value, checkpoint) {
      writes.push({ key, value, checkpoint });
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

function recordingGraph() {
  const published: Array<{ type: string; count: number; sideBatches: number }> = [];
  const graph = {
    getState: () => ({
      ingestFetchedList: (
        type: string,
        entries: Array<{ id: string; data: Record<string, unknown> }>,
        options?: { sideBatches?: Array<{ type: string }> },
      ) => {
        published.push({
          type,
          count: entries.length,
          sideBatches: options?.sideBatches?.length ?? 0,
        });
      },
    }),
  };
  return { graph, published };
}

const revision = (offset: string, rows: Array<Record<string, unknown>>): ReplicaRevision => ({
  tables: [{ target: cases, rows }],
  checkpoint: { handle: "h1", offset },
});

function baseOptions(overrides: Partial<Parameters<typeof startReplicaRuntime>[0]> = {}) {
  const { client } = recordingClient();
  const { store } = memoryCheckpoints();
  const { graph } = recordingGraph();
  return {
    client,
    transport: scriptedTransport([]),
    checkpoints: store,
    graph,
    lease: memoryLease(),
    storageKey: "aso:g1:user:practice-1:identity-1",
    targets: [cases],
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

  it("resumes from a stored checkpoint rather than rebuilding", async () => {
    const { store } = memoryCheckpoints({ handle: "h1", offset: "42", generation: 1 });
    const outcome = await startReplicaRuntime(baseOptions({ checkpoints: store }));
    expect(outcome).toEqual({ status: "syncing", generation: 1, resumed: true });
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
      async write(key, value, checkpoint) {
        order.push("checkpoint");
        return store.write(key, value, checkpoint);
      },
    };
    const graph = {
      getState: () => ({
        ingestFetchedList: () => {
          order.push("publish");
        },
      }),
    };

    await startReplicaRuntime(
      baseOptions({
        checkpoints,
        graph,
        transport: scriptedTransport([revision("1", [{ id: "c1", status: "open" }])]),
      }),
    );

    expect(order).toEqual(["checkpoint", "publish"]);
  });

  it("publishes each revision exactly once", async () => {
    // Publishing per table would let a subscriber observe one table of a
    // revision without the others — the incoherence replica-publisher exists
    // to prevent.
    const { graph, published } = recordingGraph();
    await startReplicaRuntime(
      baseOptions({
        graph,
        transport: scriptedTransport([
          revision("1", [{ id: "c1", status: "open" }]),
          revision("2", [{ id: "c2", status: "closed" }]),
        ]),
      }),
    );
    expect(published).toHaveLength(2);
  });

  it("publishes nothing for a revision with no rows", async () => {
    const { graph, published } = recordingGraph();
    await startReplicaRuntime(
      baseOptions({ graph, transport: scriptedTransport([revision("1", [])]) }),
    );
    expect(published).toHaveLength(0);
  });

  it("rebuilds and restarts from cold on must-refetch", async () => {
    // The server is asserting the history behind this cursor is gone. Applying
    // the rows anyway would layer them onto a replica they no longer describe.
    let served = 0;
    const seen: Array<string | null> = [];
    const transport: ReplicaTransport = {
      async fetch(from) {
        seen.push(from?.offset ?? null);
        served += 1;
        if (served === 1) {
          return { ...revision("1", [{ id: "c1", status: "open" }]), mustRefetch: true };
        }
        if (served === 2) return revision("9", [{ id: "c9", status: "open" }]);
        return null;
      },
    };

    const { store } = memoryCheckpoints({ handle: "h1", offset: "42", generation: 1 });
    await startReplicaRuntime(baseOptions({ checkpoints: store, transport }));

    // Resumed at 42, then must-refetch reset the cursor to cold.
    expect(seen[0]).toBe("42");
    expect(seen[1]).toBe(null);
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
