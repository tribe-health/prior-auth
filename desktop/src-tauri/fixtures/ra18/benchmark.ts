import { PGlite } from "@electric-sql/pglite";

import { writeChunk } from "../../../../web/src/shared/sync/chunk-writer";
import {
  PGLITE_REPLICA_INITIAL_MEMORY,
  PGLITE_REPLICA_POSTGRESQL_CONF,
} from "../../../../web/src/shared/sync/pglite-bootstrap";
import {
  PGLITE_ANNOTATION_TYPES_SQL,
  PGLITE_SCHEMA_SQL,
  PGLITE_SOURCE_HASH_SQL,
} from "../../../../web/src/shared/sync/pglite-schema";
import {
  CHECKPOINT_SCHEMA_SQL,
  REPLICA_TARGETS,
} from "../../../../web/src/shared/sync/replica-wiring";

interface TauriInternals {
  invoke(command: string, input: unknown): Promise<unknown>;
}

declare global {
  interface Window {
    __RA18_ROLE__?: string;
    __RA18_BENCHMARK_PHASE__?: "cold" | "warm";
    __RA18_STORAGE_NAME__?: string;
    __TAURI_INTERNALS__: TauriInternals;
    ra18RunPGliteBenchmark?: () => Promise<void>;
  }
}

const ROWS_PER_CATCH_UP = 250;
const PRACTICE_ID = "00000000-0000-4000-8000-000000000901";
const schemaSql = [
  PGLITE_SCHEMA_SQL,
  CHECKPOINT_SCHEMA_SQL,
  PGLITE_ANNOTATION_TYPES_SQL,
  PGLITE_SOURCE_HASH_SQL,
].join("\n");
const caseTarget = REPLICA_TARGETS.find((target) => target.table === "cases");

function elapsed(startedAt: number): number {
  return Math.round((performance.now() - startedAt) * 100) / 100;
}

function syntheticCase(sequence: number) {
  const suffix = sequence.toString().padStart(12, "0");
  return {
    id: `00000000-0000-4000-8000-${suffix}`,
    practice_id: PRACTICE_ID,
    status: "synthetic",
    gate_affirmed_at: null,
    created_at: "2026-09-16T00:00:00.000Z",
    updated_at: "2026-09-16T00:00:00.000Z",
  };
}

async function emit(stage: string, details: Record<string, unknown>): Promise<void> {
  await window.__TAURI_INTERNALS__.invoke("plugin:event|emit", {
    event: "ra18://receipt",
    payload: { stage, role: window.__RA18_ROLE__, ...details },
  });
}

async function deleteSyntheticDatabase(name: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("IndexedDB cleanup failed"));
    request.onblocked = () => reject(new Error("IndexedDB cleanup was blocked"));
  });
}

window.ra18RunPGliteBenchmark = async () => {
  if (!caseTarget) {
    await emit("failure", { message: "production cases target is missing" });
    return;
  }

  const phase = window.__RA18_BENCHMARK_PHASE__;
  const storageName = window.__RA18_STORAGE_NAME__;
  if ((phase !== "cold" && phase !== "warm") || !storageName) {
    await emit("failure", { message: "native benchmark phase or storage name is missing" });
    return;
  }

  const dataDir = `idb://${storageName}`;
  let database: PGlite | undefined;
  try {
    await emit("pglite-progress", { phase, step: `${phase}-opening` });
    const startedAt = performance.now();
    database = await PGlite.create({
      dataDir,
      initialMemory: PGLITE_REPLICA_INITIAL_MEMORY,
      postgresqlconf: [...PGLITE_REPLICA_POSTGRESQL_CONF],
    });
    await emit("pglite-progress", { phase, step: `${phase}-opened` });

    const expectedRows = ROWS_PER_CATCH_UP + 1;
    if (phase === "cold") {
      await database.exec(schemaSql);
      await emit("pglite-progress", { phase, step: "schema-applied" });
      await writeChunk(database, caseTarget, [syntheticCase(1)]);
      const firstRow = await database.query<{ id: string }>(
        "SELECT id FROM cases WHERE id = $1",
        [syntheticCase(1).id],
      );
      const coldFirstRowMs = elapsed(startedAt);
      if (firstRow.rows[0]?.id !== syntheticCase(1).id) {
        throw new Error("cold first row was not readable");
      }
      await emit("pglite-progress", { phase, step: "first-row-readable", coldFirstRowMs });

      const catchUpStartedAt = performance.now();
      const catchUpRows = Array.from({ length: ROWS_PER_CATCH_UP }, (_, index) =>
        syntheticCase(index + 2),
      );
      await writeChunk(database, caseTarget, catchUpRows);
      const caughtUp = await database.query<{ count: number }>(
        "SELECT COUNT(*)::int AS count FROM cases",
      );
      const catchUpMs = elapsed(catchUpStartedAt);
      if (caughtUp.rows[0]?.count !== expectedRows) {
        throw new Error(
          `catch-up row count was ${caughtUp.rows[0]?.count}, expected ${expectedRows}`,
        );
      }
      await emit("pglite-progress", { phase, step: "catch-up-committed", catchUpMs });

      const teardownStartedAt = performance.now();
      await database.close();
      database = undefined;
      const coldTeardownMs = elapsed(teardownStartedAt);
      await emit("pglite-cold-measured", {
        pgliteVersion: "0.5.8",
        storageMode: "idb",
        coldFirstRowMs,
        catchUpMs,
        catchUpRows: ROWS_PER_CATCH_UP,
        coldTeardownMs,
        committedRows: expectedRows,
      });
      return;
    }

    const warmRows = await database.query<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM cases",
    );
    const warmFirstRowMs = elapsed(startedAt);
    const persistenceRoundTrip = warmRows.rows[0]?.count === expectedRows;
    if (!persistenceRoundTrip) {
      throw new Error("warm reopen did not retain the committed synthetic rows");
    }
    await emit("pglite-progress", { phase, step: "warm-verified", warmFirstRowMs });

    const teardownStartedAt = performance.now();
    await database.close();
    database = undefined;
    const warmTeardownMs = elapsed(teardownStartedAt);
    await deleteSyntheticDatabase(storageName);
    await emit("pglite-warm-measured", {
      pgliteVersion: "0.5.8",
      storageMode: "idb",
      warmFirstRowMs,
      warmTeardownMs,
      persistedRows: expectedRows,
      persistenceRoundTrip,
      syntheticDatabaseDeleted: true,
    });
  } catch (error) {
    await Promise.allSettled([database?.close()]);
    await emit("failure", {
      message: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    });
  }
};

if (window.__RA18_ROLE__ === "measurement") {
  void window.ra18RunPGliteBenchmark();
}
