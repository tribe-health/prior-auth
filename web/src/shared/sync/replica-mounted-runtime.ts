// @vitest-environment node

import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";

import { PGlite } from "@electric-sql/pglite";
import {
  createCommittedReplicaProjector,
  createGraphStore,
  createPGlitePersistenceAdapter,
  startScopedLocalFirstGraph,
  type CommittedReplicaProjector,
  type ScopedLocalFirstGraphRuntime,
} from "@prometheus-ags/entity-graph-core";
import { expect } from "vitest";

import { createFrfShapeTransport } from "./frf-shape-transport";
import {
  PGLITE_REPLICA_INITIAL_MEMORY,
  PGLITE_REPLICA_POSTGRESQL_CONF,
} from "./pglite-bootstrap";
import {
  currentGeneration,
  migrateReplicaSchema,
  migrationChecksum,
  type ReplicaSchemaPlan,
} from "./migration-ledger";
import {
  PGLITE_ANNOTATION_TYPES_SQL,
  PGLITE_CASE_SUMMARY_SQL,
  PGLITE_DOCUMENT_STATUS_SQL,
  PGLITE_SCHEMA_SQL,
  PGLITE_SOURCE_HASH_SQL,
  type PGliteTable,
} from "./pglite-schema";
import { ReplicaLease, createMemoryLeaseStore } from "./replica-owner";
import {
  startReplicaRuntime,
  type ReplicaCheckpointSet,
  type ReplicaRevision,
  type ReplicaTransport,
} from "./replica-runtime";
import {
  CHECKPOINT_SCHEMA_SQL,
  REPLICA_LIST_BINDINGS,
  REPLICA_SHAPES,
  REPLICA_TABLE_BINDINGS,
  REPLICA_TARGETS,
  createPGliteCheckpointStore,
  entityTypeFor,
} from "./replica-wiring";

export const mounted = process.env.RA11C_MOUNTED === "1";
export const mountedPhase = process.env.RA11C_MOUNTED_PHASE;
export const storageKey = "ra11c-mounted-materializer";
export const expectedCounts: Readonly<Record<PGliteTable, number>> = {
  annotation_types: 4,
  annotations: 0,
  cases: 360,
  case_evidence: 4_320,
  document_statuses: 2_880,
  evidence_citations: 8_640,
  evidence_states: 3,
};
export const expectedEvidenceStateIds = ["gap", "met", "void"];
export const expectedCheckpointShapes = REPLICA_SHAPES.map(({ shape }) => shape).sort();
const openClients: PGlite[] = [];

export interface MountedRuntime {
  client: PGlite;
  graph: ScopedLocalFirstGraphRuntime;
  lease: ReplicaLease;
  projector: CommittedReplicaProjector;
  store: ReturnType<typeof createGraphStore>;
}

export type MemoryStageObserver = (stage: string) => void;

export async function closeMountedClients(): Promise<void> {
  await Promise.allSettled(openClients.splice(0).map((client) => client.close()));
}

export function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for the mounted RA11c acceptance`);
  return value;
}

export function authorizedTransport(fromFetch = globalThis.fetch): ReplicaTransport {
  const token = required("RA11C_SESSION_TOKEN");
  return createFrfShapeTransport({
    gateUrl: required("RA11C_GATE_URL"),
    shapes: REPLICA_SHAPES,
    fetchImpl: async (input, init) => {
      const headers = new Headers(init?.headers);
      headers.set("authorization", `Bearer ${token}`);
      return fromFetch(input, { ...init, headers });
    },
  });
}

async function schemaPlan(): Promise<ReplicaSchemaPlan> {
  const sql = `${PGLITE_SCHEMA_SQL}\n${CHECKPOINT_SCHEMA_SQL}`;
  return {
    logicalVersion: 7,
    generation: 5,
    migrations: [
      {
        id: "001-replica-schema",
        sql,
        checksum: await migrationChecksum(sql),
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
    ],
  };
}

export async function openRuntime(onMemoryStage?: MemoryStageObserver): Promise<MountedRuntime> {
  const dataDir = required("RA11C_DATA_DIR");
  const baseArchive = new Blob([
    new Uint8Array(await readFile(required("RA11C_PGLITE_BASE"))),
  ]);
  const client = mountedPhase === "memory"
    ? await PGlite.create({
        initialMemory: PGLITE_REPLICA_INITIAL_MEMORY,
        loadDataDir: baseArchive,
        postgresqlconf: [...PGLITE_REPLICA_POSTGRESQL_CONF],
      })
    : mountedPhase === "initial"
    ? await PGlite.create({
        dataDir,
        initialMemory: PGLITE_REPLICA_INITIAL_MEMORY,
        loadDataDir: baseArchive,
        postgresqlconf: [...PGLITE_REPLICA_POSTGRESQL_CONF],
      })
    : await PGlite.create({
        dataDir,
        initialMemory: PGLITE_REPLICA_INITIAL_MEMORY,
        postgresqlconf: [...PGLITE_REPLICA_POSTGRESQL_CONF],
      });
  onMemoryStage?.("pglite-open");
  await markProgress("pglite-open");
  openClients.push(client);
  const lease = new ReplicaLease({
    store: createMemoryLeaseStore(),
    holder: crypto.randomUUID(),
  });
  expect(await lease.acquire()).toEqual({ granted: true });
  await markProgress("lease-acquired");
  const migration = await migrateReplicaSchema(client, await schemaPlan(), lease);
  expect(migration.status).toBe("ready");
  onMemoryStage?.("schema-ready");
  await markProgress("schema-ready");

  const persistence = await createPGlitePersistenceAdapter(client);
  const store = createGraphStore();
  const graph = startScopedLocalFirstGraph({
    store,
    key: storageKey,
    storage: { ...persistence, close: async () => undefined },
    onlineSource: { getIsOnline: () => true, subscribe: () => () => undefined },
    persistDebounceMs: 60_000,
    persistence: "disabled",
  });
  await graph.ready;
  onMemoryStage?.("graph-ready");
  await markProgress("graph-ready");
  const projector = await createCommittedReplicaProjector({
    runtime: graph,
    scopeId: storageKey,
    generation: await currentGeneration(client),
    tables: REPLICA_TABLE_BINDINGS,
    lists: REPLICA_LIST_BINDINGS,
  });
  onMemoryStage?.("projector-ready");
  await markProgress("projector-ready");
  return { client, graph, lease, projector, store };
}

export async function closeRuntime(runtime: MountedRuntime): Promise<void> {
  await runtime.graph.dispose();
  await runtime.lease.release();
  await runtime.client.close();
  const index = openClients.indexOf(runtime.client);
  if (index >= 0) openClients.splice(index, 1);
}

export async function sync(
  runtime: MountedRuntime,
  transport = authorizedTransport(),
  onRevision?: () => void,
): Promise<void> {
  const outcome = await startReplicaRuntime({
    client: runtime.client,
    transport,
    checkpoints: createPGliteCheckpointStore(runtime.client),
    projector: runtime.projector,
    lease: runtime.lease,
    ownership: "held",
    leaseLifetime: "caller",
    storageKey,
    targets: REPLICA_TARGETS,
    checkpointShapes: REPLICA_SHAPES.map(({ shape }) => shape),
    entityTypeFor,
    onRevision,
    onCaughtUp: () => runtime.graph.markServerCaughtUp(),
  });
  expect(outcome.status).toBe("syncing");
}

export async function counts(client: PGlite): Promise<Record<PGliteTable, number>> {
  const entries = await Promise.all(REPLICA_TARGETS.map(async ({ table }) => {
    const result = await client.query<{ count: number }>(`SELECT count(*)::int AS count FROM ${table}`);
    return [table, result.rows[0]?.count ?? -1] as const;
  }));
  return Object.fromEntries(entries) as Record<PGliteTable, number>;
}

export function serverSql(sql: string): void {
  execFileSync("bash", ["../scripts/ra05-stack.sh", "exec", "-T", "db", "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "flint", "-d", "flint", "-Atq"], {
    cwd: process.cwd(),
    env: process.env,
    input: sql,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

export async function waitFor(
  runtime: MountedRuntime,
  predicate: () => Promise<boolean>,
  label: string,
  timeoutMs = 15_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sync(runtime);
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out waiting for ${label} to reach the materializer`);
}

export async function captureRevision(
  checkpoint: ReplicaCheckpointSet,
  predicate: (revision: ReplicaRevision) => boolean,
  timeoutMs = 45_000,
): Promise<ReplicaRevision> {
  const deadline = Date.now() + timeoutMs;
  const transport = authorizedTransport();
  let cursor: ReplicaCheckpointSet | null = checkpoint;
  while (Date.now() < deadline) {
    const revision = await transport.fetch(cursor);
    if (revision?.mustRefetch) {
      cursor = null;
      continue;
    }
    if (revision && predicate(revision)) return revision;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("Timed out waiting to capture the real Electric revision");
}

export function revisionHas(revision: ReplicaRevision, table: string, id: string): boolean {
  return revision.tables.some((entry) =>
    entry.target.table === table && entry.rows.some((row) => row.id === id),
  );
}

function memorySample() {
  const memory = process.memoryUsage();
  return { heapUsedBytes: memory.heapUsed, rssBytes: memory.rss };
}

export async function markProgress(stage: string): Promise<void> {
  await writeFile(`${required("RA11C_MATERIALIZER_OUTPUT")}.progress`, `${stage}\n`);
}

interface ProcessMemoryReport {
  baseline: ReturnType<typeof memorySample>;
  peak: ReturnType<typeof memorySample>;
  rssDeltaBytes: number;
  heapDeltaBytes: number;
  stages: Record<string, ReturnType<typeof memorySample>>;
  peakStage: string;
}

export function trackProcessMemory() {
  const baseline = memorySample();
  let peak = baseline;
  let stage = "baseline";
  let peakStage = stage;
  const stages: Record<string, ReturnType<typeof memorySample>> = { baseline };
  const sample = (label?: string) => {
    const current = memorySample();
    if (label) {
      stage = label;
      stages[label] = current;
    }
    peak = {
      heapUsedBytes: Math.max(peak.heapUsedBytes, current.heapUsedBytes),
      rssBytes: Math.max(peak.rssBytes, current.rssBytes),
    };
    if (current.rssBytes >= peak.rssBytes) peakStage = stage;
  };
  const sampler = setInterval(() => sample(), 10);
  return {
    enter(nextStage: string) {
      stage = nextStage;
      sample(nextStage);
    },
    sample,
    finish(): ProcessMemoryReport {
      clearInterval(sampler);
      sample("final");
      return {
        baseline,
        peak,
        rssDeltaBytes: peak.rssBytes - baseline.rssBytes,
        heapDeltaBytes: peak.heapUsedBytes - baseline.heapUsedBytes,
        stages,
        peakStage,
      };
    },
  };
}

export interface RestartState {
  caseId: string;
  checkpoint: ReplicaCheckpointSet;
  initialMemory: ProcessMemoryReport;
  parityObservedBeforeReadiness: boolean;
  coldCrashLeftNoPartialBatch: boolean;
  crashRolledBackRowAndCheckpoint: boolean;
  sqlAndCheckpointCommittedBeforePublication: boolean;
}

export const restartStatePath = () => `${required("RA11C_MATERIALIZER_OUTPUT")}.state.json`;
