import { afterEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import {
  createCommittedReplicaProjector,
  createPGlitePersistenceAdapter,
  startScopedLocalFirstGraph,
} from "@prometheus-ags/entity-graph-core";
import { createGraphStore } from "@prometheus-ags/entity-graph-react";

import { migrationChecksum, type ReplicaSchemaPlan } from "./migration-ledger";
import { ReplicaLease, createMemoryLeaseStore } from "./replica-owner";
import { startReplicaRuntime, type ReplicaRevision } from "./replica-runtime";
import { CHECKPOINT_SCHEMA_SQL, createPGliteCheckpointStore } from "./replica-wiring";

const target = { table: "fixture_cases", columns: ["id", "status"] } as const;
const openClients: PGlite[] = [];

afterEach(async () => {
  await Promise.allSettled(openClients.splice(0).map((client) => client.close()));
});

async function fixture() {
  const client = new PGlite();
  openClients.push(client);
  await client.waitReady;
  const schemaSql = `
CREATE TABLE IF NOT EXISTS fixture_cases (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL
);
${CHECKPOINT_SCHEMA_SQL}`;
  const schemaPlan: ReplicaSchemaPlan = {
    logicalVersion: 1,
    generation: 1,
    migrations: [{
      id: "001-fixture",
      sql: schemaSql,
      checksum: await migrationChecksum(schemaSql),
      logicalVersion: 1,
    }],
  };
  const persistence = await createPGlitePersistenceAdapter(client);
  const store = createGraphStore();
  const graph = startScopedLocalFirstGraph({
    store,
    key: "scope-1",
    storage: { ...persistence, close: async () => undefined },
    onlineSource: { getIsOnline: () => true, subscribe: () => () => undefined },
  });
  await graph.ready;
  const projector = await createCommittedReplicaProjector({
    runtime: graph,
    scopeId: "scope-1",
    generation: 1,
    tables: [{ table: target.table, type: "Case", primaryKey: "id" }],
    lists: [{ key: "replica:fixture_cases", table: target.table }],
  });
  const lease = new ReplicaLease({
    store: createMemoryLeaseStore(),
    holder: "fixture-owner",
  });
  return { client, graph, lease, projector, schemaPlan, store };
}

function oneRevision(rows: readonly Record<string, unknown>[]): ReplicaRevision {
  return {
    tables: [{ shape: "fixture_cases", target, rows }],
    checkpoint: { fixture_cases: { handle: "fixture-handle", offset: "7" } },
  };
}

describe("owned SQL materializer with committed PEM projection", () => {
  it("commits rows and checkpoint before one complete replacement becomes ready", async () => {
    const runtime = await fixture();
    runtime.store.getState().ingestFetchedList("Case", [
      { id: "stale", data: { id: "stale", status: "old" } },
    ]);
    let caughtUp = false;
    let served = false;

    await startReplicaRuntime({
      client: runtime.client,
      transport: {
        async fetch() {
          if (served) return null;
          served = true;
          return oneRevision([{ id: "case-1", status: "open" }]);
        },
      },
      checkpoints: createPGliteCheckpointStore(runtime.client),
      projector: runtime.projector,
      lease: runtime.lease,
      storageKey: "scope-1",
      targets: [target],
      checkpointShapes: ["fixture_cases"],
      entityTypeFor: () => "Case",
      schemaPlan: runtime.schemaPlan,
      onCaughtUp: () => {
        caughtUp = true;
        runtime.graph.markServerCaughtUp();
      },
    });

    const state = runtime.store.getState();
    expect(state.entities.Case?.stale).toBeUndefined();
    expect(state.entities.Case?.["case-1"]).toMatchObject({ status: "open" });
    expect(state.lists["replica:fixture_cases"]?.ids).toEqual(["case-1"]);
    expect(runtime.projector.getStatus()).toMatchObject({ generation: 2, lastSequence: 1 });
    expect(runtime.graph.getStatus()).toMatchObject({ phase: "ready", isSynced: true });
    expect(caughtUp).toBe(true);

    const checkpoint = await createPGliteCheckpointStore(runtime.client).read("scope-1");
    expect(checkpoint.checkpoint).toEqual({
      generation: 2,
      shapes: { fixture_cases: { handle: "fixture-handle", offset: "7" } },
    });
    await runtime.graph.dispose();
  });

  it("rolls the row back when checkpoint persistence fails", async () => {
    const runtime = await fixture();
    let served = false;
    const durable = createPGliteCheckpointStore(runtime.client);

    await expect(startReplicaRuntime({
      client: runtime.client,
      transport: {
        async fetch() {
          if (served) return null;
          served = true;
          return oneRevision([{ id: "case-rollback", status: "open" }]);
        },
      },
      checkpoints: {
        read: durable.read,
        async write() {
          throw new Error("synthetic checkpoint failure");
        },
      },
      projector: runtime.projector,
      lease: runtime.lease,
      storageKey: "scope-1",
      targets: [target],
      checkpointShapes: ["fixture_cases"],
      entityTypeFor: () => "Case",
      schemaPlan: runtime.schemaPlan,
    })).rejects.toThrow("synthetic checkpoint failure");

    const rows = await runtime.client.query("SELECT id FROM fixture_cases");
    expect(rows.rows).toEqual([]);
    expect(runtime.store.getState().entities.Case?.["case-rollback"]).toBeUndefined();
    await runtime.graph.dispose();
  });
});
