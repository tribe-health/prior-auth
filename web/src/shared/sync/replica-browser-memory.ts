import {
  createCommittedReplicaProjector,
  createGraphStore,
  createPGlitePersistenceAdapter,
  startScopedLocalFirstGraph,
} from "@prometheus-ags/entity-graph-core";

import { createFrfShapeTransport } from "./frf-shape-transport";
import {
  currentGeneration,
  migrateReplicaSchema,
  migrationChecksum,
  type ReplicaSchemaPlan,
} from "./migration-ledger";
import { openPGliteReplica } from "./pglite-bootstrap";
import {
  PGLITE_ANNOTATION_TYPES_SQL,
  PGLITE_CASE_SUMMARY_SQL,
  PGLITE_CASE_DISPLAY_LABELS_SQL,
  PGLITE_DOCUMENT_STATUS_SQL,
  PGLITE_DOCUMENT_TASK_STATUS_SQL,
  PGLITE_SCHEMA_SQL,
  PGLITE_SOURCE_HASH_SQL,
  type PGliteTable,
} from "./pglite-schema";
import { ReplicaLease, createMemoryLeaseStore } from "./replica-owner";
import { startReplicaRuntime } from "./replica-runtime";
import {
  CHECKPOINT_SCHEMA_SQL,
  REPLICA_LIST_BINDINGS,
  REPLICA_SHAPES,
  REPLICA_TABLE_BINDINGS,
  REPLICA_TARGETS,
  createPGliteCheckpointStore,
  entityTypeFor,
} from "./replica-wiring";
import type { BrowserQualificationConfig } from "./replica-browser-lifecycle";
type BrowserCampaignConfig = BrowserQualificationConfig;

interface HeapSample {
  totalBytes: number;
  usedBytes: number;
}

interface BrowserCampaignResult {
  result: "Passed" | "Failed";
  counts: Record<PGliteTable, number>;
  graphCounts: Record<PGliteTable, number>;
  checkpointShapes: string[];
  generation: number;
  liveBodyInterruption: {
    bytes: number;
    injected: boolean;
    upstreamStatus: number;
  };
  runtime: {
    crossOriginIsolated: boolean;
    userAgent: string;
  };
  heap: {
    baseline: HeapSample;
    peak: HeapSample;
    deltaBytes: number;
    peakStage: string;
    stages: Record<string, HeapSample>;
  };
  checks: {
    authorizedColdRetryCompleted: boolean;
    completeCheckpoint: boolean;
    graphParity: boolean;
    heapAvailable: boolean;
    heapWithinBudget: boolean;
    interruptedBodyLeftCheckpointEmpty: boolean;
    interruptedBodyLeftGraphEmpty: boolean;
    interruptedBodyLeftSqlEmpty: boolean;
    interruptedBodyRejected: boolean;
    sqlParity: boolean;
  };
}

interface ChromiumPerformance extends Performance {
  memory?: {
    totalJSHeapSize: number;
    usedJSHeapSize: number;
  };
}

declare global {
  interface Window {
    __RA11C_CONFIG__?: BrowserCampaignConfig;
    __RA11C_ERROR__?: string;
    __RA11C_READY__?: boolean;
    __RA11C_RESULT__?: BrowserCampaignResult;
    __RA11C_STAGE__?: string;
    __RA11C_START__?: () => void;
  }
}

const EXPECTED_COUNTS: Readonly<Record<PGliteTable, number>> = {
  annotation_types: 4,
  annotations: 0,
  cases: 360,
  case_evidence: 4_320,
  document_statuses: 2_880,
  document_task_statuses: 0,
  evidence_citations: 8_640,
  evidence_states: 3,
};
const STORAGE_KEY = "ra11c-browser-memory";

function readHeap(): HeapSample {
  const memory = (performance as ChromiumPerformance).memory;
  if (!memory) return { totalBytes: -1, usedBytes: -1 };
  return {
    totalBytes: memory.totalJSHeapSize,
    usedBytes: memory.usedJSHeapSize,
  };
}

function trackHeap() {
  const baseline = readHeap();
  let peak = baseline;
  let peakStage = "baseline";
  const stages: Record<string, HeapSample> = { baseline };
  const sample = (stage = window.__RA11C_STAGE__ ?? "unknown") => {
    const current = readHeap();
    stages[stage] = current;
    if (current.usedBytes >= peak.usedBytes) {
      peak = current;
      peakStage = stage;
    }
  };
  const interval = window.setInterval(() => sample(), 10);
  return {
    enter(stage: string) {
      window.__RA11C_STAGE__ = stage;
      sample(stage);
    },
    finish() {
      window.clearInterval(interval);
      sample("final");
      return {
        baseline,
        peak,
        deltaBytes: peak.usedBytes - baseline.usedBytes,
        peakStage,
        stages,
      };
    },
  };
}

async function schemaPlan(): Promise<ReplicaSchemaPlan> {
  const schemaSql = `${PGLITE_SCHEMA_SQL}\n${CHECKPOINT_SCHEMA_SQL}`;
  return {
    logicalVersion: 9,
    generation: 6,
    migrations: [
      {
        id: "001-replica-schema",
        sql: schemaSql,
        checksum: await migrationChecksum(schemaSql),
        logicalVersion: 3,
      },
      {
        id: "002-annotation-types",
        sql: PGLITE_ANNOTATION_TYPES_SQL,
        checksum: await migrationChecksum(PGLITE_ANNOTATION_TYPES_SQL),
        logicalVersion: 4,
      },
      {
        id: "003-source-hash-wire-format",
        sql: PGLITE_SOURCE_HASH_SQL,
        checksum: await migrationChecksum(PGLITE_SOURCE_HASH_SQL),
        logicalVersion: 5,
      },
      {
        id: "004-case-summary-publication",
        sql: PGLITE_CASE_SUMMARY_SQL,
        checksum: await migrationChecksum(PGLITE_CASE_SUMMARY_SQL),
        logicalVersion: 6,
        startsNewGeneration: true,
      },
      {
        id: "005-document-status-projection",
        sql: PGLITE_DOCUMENT_STATUS_SQL,
        checksum: await migrationChecksum(PGLITE_DOCUMENT_STATUS_SQL),
        logicalVersion: 7,
      },
      {
        id: "006-document-task-status-projection",
        sql: PGLITE_DOCUMENT_TASK_STATUS_SQL,
        checksum: await migrationChecksum(PGLITE_DOCUMENT_TASK_STATUS_SQL),
        logicalVersion: 8,
      },
      {
        id: "007-case-display-labels",
        sql: PGLITE_CASE_DISPLAY_LABELS_SQL,
        checksum: await migrationChecksum(PGLITE_CASE_DISPLAY_LABELS_SQL),
        logicalVersion: 9,
        startsNewGeneration: true,
      },
    ],
  };
}

async function tableCounts(client: {
  query<T>(sql: string): Promise<{ rows: T[] }>;
}): Promise<Record<PGliteTable, number>> {
  const entries = await Promise.all(REPLICA_TARGETS.map(async ({ table }) => {
    const response = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM ${table}`,
    );
    return [table, response.rows[0]?.count ?? -1] as const;
  }));
  return Object.fromEntries(entries) as Record<PGliteTable, number>;
}

async function runCampaign(): Promise<BrowserCampaignResult> {
  const config = window.__RA11C_CONFIG__;
  if (!config?.sessionToken) throw new Error("browser campaign config is missing");
  const heapTracker = trackHeap();
  heapTracker.enter("pglite-opening");
  const client = await openPGliteReplica({
    mode: "memory",
    reason: "explicit-memory",
    misconfigured: false,
  }, STORAGE_KEY);
  const lease = new ReplicaLease({
    store: createMemoryLeaseStore(),
    holder: crypto.randomUUID(),
  });
  let graph: ReturnType<typeof startScopedLocalFirstGraph> | undefined;
  try {
    await client.waitReady;
    heapTracker.enter("pglite-open");
    const acquired = await lease.acquire();
    if (!acquired.granted) throw new Error("browser campaign could not acquire replica lease");
    const migrated = await migrateReplicaSchema(client, await schemaPlan(), lease);
    if (migrated.status !== "ready") {
      throw new Error(`browser schema migration failed: ${migrated.reason}`);
    }
    heapTracker.enter("schema-ready");
    const persistence = await createPGlitePersistenceAdapter(client);
    const store = createGraphStore();
    graph = startScopedLocalFirstGraph({
      store,
      key: STORAGE_KEY,
      storage: { ...persistence, close: async () => undefined },
      onlineSource: { getIsOnline: () => true, subscribe: () => () => undefined },
      persistDebounceMs: 60_000,
      persistence: "disabled",
    });
    await graph.ready;
    heapTracker.enter("graph-ready");
    const generation = await currentGeneration(client);
    const projector = await createCommittedReplicaProjector({
      runtime: graph,
      scopeId: STORAGE_KEY,
      generation,
      tables: REPLICA_TABLE_BINDINGS,
      lists: REPLICA_LIST_BINDINGS,
    });
    heapTracker.enter("projector-ready");
    const liveBodyInterruption = { bytes: 0, injected: false, upstreamStatus: 0 };
    const transport = createFrfShapeTransport({
      gateUrl: window.location.origin,
      shapes: REPLICA_SHAPES,
      fetchImpl: async (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set("authorization", `Bearer ${config.sessionToken}`);
        const response = await fetch(input, { ...init, headers });
        const url = new URL(input instanceof Request ? input.url : String(input));
        if (liveBodyInterruption.injected || url.searchParams.get("shape") !== "cases") {
          return response;
        }
        const reader = response.body?.getReader();
        const first = await reader?.read();
        const chunk = first?.value?.slice(0, 256) ?? new Uint8Array();
        await reader?.cancel("PRI c015 live browser body interruption");
        liveBodyInterruption.bytes = chunk.byteLength;
        liveBodyInterruption.injected = true;
        liveBodyInterruption.upstreamStatus = response.status;
        return new Response(new ReadableStream<Uint8Array>({
          start(controller) {
            if (chunk.byteLength > 0) controller.enqueue(chunk);
            controller.error(new Error("PRI c015 live browser body interruption"));
          },
        }), {
          headers: response.headers,
          status: response.status,
          statusText: response.statusText,
        });
      },
    });
    heapTracker.enter("live-body-interruption");
    let interruptedBodyRejected = false;
    try {
      await transport.fetch(null);
    } catch {
      interruptedBodyRejected = true;
    }
    const interruptedCounts = await tableCounts(client);
    const interruptedCheckpoint = await createPGliteCheckpointStore(client).read(STORAGE_KEY);
    const interruptedGraph = store.getState();
    const interruptedBodyLeftSqlEmpty = Object.values(interruptedCounts).every(
      (count) => count === 0,
    );
    const interruptedBodyLeftCheckpointEmpty = interruptedCheckpoint.checkpoint === null;
    const interruptedBodyLeftGraphEmpty = REPLICA_TARGETS.every(
      ({ table }) => Object.keys(interruptedGraph.entities[entityTypeFor(table)] ?? {}).length === 0,
    );
    if (
      !interruptedBodyRejected
      || !interruptedBodyLeftSqlEmpty
      || !interruptedBodyLeftCheckpointEmpty
      || !interruptedBodyLeftGraphEmpty
    ) {
      throw new Error("interrupted live shape body crossed the committed replica boundary");
    }
    heapTracker.enter("cold-fold");
    let pendingRevision = await transport.fetch(null);
    if (!pendingRevision || pendingRevision.mustRefetch) {
      throw new Error("browser cold fold did not produce a complete revision");
    }
    heapTracker.enter("cold-fold-complete");
    const capturedTransport = {
      async fetch() {
        const revision = pendingRevision;
        pendingRevision = null;
        return revision;
      },
    };
    let revisions = 0;
    heapTracker.enter("sql-checkpoint-graph");
    const outcome = await startReplicaRuntime({
      client,
      transport: capturedTransport,
      checkpoints: createPGliteCheckpointStore(client),
      projector,
      lease,
      ownership: "held",
      leaseLifetime: "caller",
      storageKey: STORAGE_KEY,
      targets: REPLICA_TARGETS,
      checkpointShapes: REPLICA_SHAPES.map(({ shape }) => shape),
      entityTypeFor,
      onRevision: () => {
        revisions += 1;
        heapTracker.enter(`revision-${revisions}`);
      },
      onCaughtUp: () => graph?.markServerCaughtUp(),
    });
    if (outcome.status !== "syncing") {
      throw new Error(`browser materializer stopped: ${outcome.status}`);
    }
    heapTracker.enter("materialized");
    const counts = await tableCounts(client);
    const state = store.getState();
    const graphCounts = Object.fromEntries(REPLICA_TARGETS.map(({ table }) => [
      table,
      Object.keys(state.entities[entityTypeFor(table)] ?? {}).length,
    ])) as Record<PGliteTable, number>;
    const checkpoint = await createPGliteCheckpointStore(client).read(STORAGE_KEY);
    const checkpointShapes = Object.keys(checkpoint.checkpoint?.shapes ?? {}).sort();
    const expectedShapes = REPLICA_SHAPES.map(({ shape }) => shape).sort();
    const sqlParity = Object.entries(EXPECTED_COUNTS).every(
      ([table, expected]) => counts[table as PGliteTable] === expected,
    );
    const graphParity = Object.entries(EXPECTED_COUNTS).every(
      ([table, expected]) => graphCounts[table as PGliteTable] === expected,
    );
    const completeCheckpoint = checkpointShapes.join(",") === expectedShapes.join(",");
    const authorizedColdRetryCompleted = sqlParity && graphParity && completeCheckpoint;
    const heap = heapTracker.finish();
    const heapAvailable = heap.baseline.usedBytes >= 0 && heap.peak.usedBytes >= 0;
    const heapWithinBudget = heapAvailable && heap.deltaBytes <= 256 * 1024 * 1024;
    const passed = authorizedColdRetryCompleted
      && heapWithinBudget
      && interruptedBodyRejected
      && interruptedBodyLeftSqlEmpty
      && interruptedBodyLeftCheckpointEmpty
      && interruptedBodyLeftGraphEmpty;
    return {
      result: passed ? "Passed" : "Failed",
      counts,
      graphCounts,
      checkpointShapes,
      generation,
      liveBodyInterruption,
      runtime: {
        crossOriginIsolated: window.crossOriginIsolated,
        userAgent: navigator.userAgent,
      },
      heap,
      checks: {
        authorizedColdRetryCompleted,
        completeCheckpoint,
        graphParity,
        heapAvailable,
        heapWithinBudget,
        interruptedBodyLeftCheckpointEmpty,
        interruptedBodyLeftGraphEmpty,
        interruptedBodyLeftSqlEmpty,
        interruptedBodyRejected,
        sqlParity,
      },
    };
  } finally {
    await graph?.dispose().catch(() => undefined);
    await lease.release().catch(() => undefined);
    await client.close().catch(() => undefined);
  }
}

window.__RA11C_STAGE__ = "ready";
window.__RA11C_READY__ = true;
window.__RA11C_START__ = () => {
  window.__RA11C_RESULT__ = undefined;
  window.__RA11C_ERROR__ = undefined;
  void runCampaign()
    .then((result) => {
      window.__RA11C_RESULT__ = result;
      window.__RA11C_STAGE__ = "complete";
    })
    .catch((error: unknown) => {
      window.__RA11C_ERROR__ = error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error);
      window.__RA11C_STAGE__ = "failed";
    });
};
