import { PGlite } from "@electric-sql/pglite";

import { pgliteDataDir, type StoragePolicy } from "./storage-policy";

const BASE_ARCHIVE = `${import.meta.env.BASE_URL}pglite-base.tgz`;
export const PGLITE_REPLICA_INITIAL_MEMORY = 128 * 1024 * 1024;

/** Client-replica settings sized for the bounded clinical replica workload. */
export const PGLITE_REPLICA_POSTGRESQL_CONF = [
  "shared_buffers=16MB",
  "work_mem=1MB",
  "maintenance_work_mem=8MB",
  "temp_buffers=2MB",
  "wal_buffers=1MB",
] as const;

/**
 * Open the browser replica without running a second in-process initdb engine.
 * The memory-only path starts from a versioned empty archive generated with the
 * pinned PGlite build. Persistent stores already own their initialized files.
 */
export async function openPGliteReplica(
  policy: StoragePolicy,
  storageKey: string,
  fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<PGlite> {
  const dataDir = pgliteDataDir(policy, storageKey);
  if (dataDir) {
    return PGlite.create({
      dataDir,
      initialMemory: PGLITE_REPLICA_INITIAL_MEMORY,
      postgresqlconf: [...PGLITE_REPLICA_POSTGRESQL_CONF],
    });
  }

  const response = await fetchImpl(BASE_ARCHIVE);
  if (!response.ok) {
    throw new Error(`PGlite base archive failed: ${response.status} ${response.statusText}`);
  }
  return PGlite.create({
    loadDataDir: await response.blob(),
    initialMemory: PGLITE_REPLICA_INITIAL_MEMORY,
    postgresqlconf: [...PGLITE_REPLICA_POSTGRESQL_CONF],
  });
}
