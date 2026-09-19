import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";

import {
  appliedMigrations,
  currentGeneration,
  migrateReplicaSchema,
  migrationChecksum,
  type ReplicaMigration,
  type ReplicaSchemaPlan,
  type TransactionalLedgerClient,
} from "./migration-ledger";
import { ReplicaLease, type StoredLease } from "./replica-owner";

const databases: PGlite[] = [];

async function database(): Promise<PGlite> {
  const db = new PGlite();
  await db.waitReady;
  databases.push(db);
  return db;
}

async function migration(id: string, sql: string, logicalVersion = 1): Promise<ReplicaMigration> {
  return { id, sql, checksum: await migrationChecksum(sql), logicalVersion };
}

async function ownedMigrate(
  client: TransactionalLedgerClient,
  plan: ReplicaSchemaPlan,
) {
  let stored: StoredLease | null = null;
  const lease = new ReplicaLease({
    holder: "migration-test",
    store: {
      async read() { return stored; },
      async write(next, expected) {
        if (stored !== expected) return false;
        stored = next;
        return true;
      },
      async clear(holder) {
        if (stored?.holder === holder) stored = null;
      },
    },
  });
  await lease.acquire();
  try {
    return await migrateReplicaSchema(client, plan, lease);
  } finally {
    await lease.release();
  }
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map((db) => db.close()));
});

describe("migrateReplicaSchema", () => {
  it("requires a held ownership lease before migration", async () => {
    const db = await database();
    const lease = new ReplicaLease({
      holder: "unheld-test",
      store: {
        async read() { return null; },
        async write() { return true; },
        async clear() {},
      },
    });

    await expect(
      migrateReplicaSchema(db, { logicalVersion: 0, generation: 1, migrations: [] }, lease),
    ).resolves.toEqual({ status: "recovery-required", reason: "ownership-required" });
  });

  it("applies a checksummed logical version and generation atomically", async () => {
    const db = await database();
    const create = await migration(
      "001-create-synthetic",
      "CREATE TABLE synthetic_cases (id TEXT PRIMARY KEY)",
    );

    await expect(
      ownedMigrate(db, { logicalVersion: 1, generation: 2, migrations: [create] }),
    ).resolves.toEqual({
      status: "ready",
      logicalVersion: 1,
      generation: 2,
      applied: ["001-create-synthetic"],
    });
    await expect(currentGeneration(db)).resolves.toBe(2);
    await expect(appliedMigrations(db)).resolves.toMatchObject([
      { id: "001-create-synthetic", checksum: create.checksum, logicalVersion: 1, sequence: 1 },
    ]);
  });

  it("starts a strictly newer generation before a cutover migration", async () => {
    const db = await database();
    const create = await migration(
      "001-create-synthetic",
      "CREATE TABLE synthetic_cases (id TEXT PRIMARY KEY)",
    );
    await ownedMigrate(db, {
      logicalVersion: 1,
      generation: 9,
      migrations: [create],
    });

    const cutover = {
      ...await migration(
        "002-cutover-synthetic",
        "TRUNCATE TABLE synthetic_cases",
        2,
      ),
      startsNewGeneration: true,
    };
    await expect(
      ownedMigrate(db, {
        logicalVersion: 2,
        generation: 5,
        migrations: [create, cutover],
      }),
    ).resolves.toMatchObject({ status: "ready", generation: 10 });
    await expect(currentGeneration(db)).resolves.toBe(10);
  });

  it("returns recovery-required on checksum drift without mutating the generation", async () => {
    const db = await database();
    const original = await migration(
      "001-create-synthetic",
      "CREATE TABLE synthetic_cases (id TEXT PRIMARY KEY)",
    );
    await ownedMigrate(db, {
      logicalVersion: 1,
      generation: 2,
      migrations: [original],
    });
    const drifted = await migration(
      "001-create-synthetic",
      "CREATE TABLE synthetic_cases (id TEXT PRIMARY KEY, changed TEXT)",
    );

    await expect(
      ownedMigrate(db, {
        logicalVersion: 2,
        generation: 3,
        migrations: [drifted],
      }),
    ).resolves.toEqual({
      status: "recovery-required",
      reason: "checksum-drift",
      migrationId: "001-create-synthetic",
    });
    await expect(currentGeneration(db)).resolves.toBe(2);
  });

  it("fences an older logical schema and preserves a generation advanced by refetch", async () => {
    const db = await database();
    const create = await migration(
      "001-create-synthetic",
      "CREATE TABLE synthetic_cases (id TEXT PRIMARY KEY)",
    );
    await ownedMigrate(db, {
      logicalVersion: 2,
      generation: 4,
      migrations: [create],
    });

    await expect(
      ownedMigrate(db, {
        logicalVersion: 1,
        generation: 4,
        migrations: [create],
      }),
    ).resolves.toEqual({ status: "recovery-required", reason: "newer-schema" });
    await expect(
      ownedMigrate(db, {
        logicalVersion: 2,
        generation: 3,
        migrations: [create],
      }),
    ).resolves.toEqual({
      status: "ready",
      logicalVersion: 2,
      generation: 4,
      applied: [],
    });
    await expect(currentGeneration(db)).resolves.toBe(4);
  });

  it("rejects a changed migration set without a logical version bump", async () => {
    const db = await database();
    const create = await migration(
      "001-create-synthetic",
      "CREATE TABLE synthetic_cases (id TEXT PRIMARY KEY)",
    );
    await ownedMigrate(db, {
      logicalVersion: 1,
      generation: 1,
      migrations: [create],
    });
    const late = await migration("002-late", "ALTER TABLE synthetic_cases ADD COLUMN late TEXT");

    await expect(
      ownedMigrate(db, {
        logicalVersion: 1,
        generation: 1,
        migrations: [create, late],
      }),
    ).resolves.toEqual({ status: "recovery-required", reason: "checksum-drift" });
  });

  it("rejects duplicate migration identifiers before applying schema changes", async () => {
    const db = await database();
    const first = await migration(
      "001-duplicate",
      "CREATE TABLE should_not_exist (id TEXT PRIMARY KEY)",
    );
    const duplicate = await migration(
      "001-duplicate",
      "CREATE TABLE also_should_not_exist (id TEXT PRIMARY KEY)",
      2,
    );

    await expect(
      ownedMigrate(db, {
        logicalVersion: 2,
        generation: 1,
        migrations: [first, duplicate],
      }),
    ).resolves.toEqual({
      status: "recovery-required",
      reason: "invalid-migration-plan",
      migrationId: "001-duplicate",
    });
    await expect(
      db.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
          WHERE table_name IN ('should_not_exist', 'also_should_not_exist')`,
      ),
    ).resolves.toMatchObject({ rows: [] });
  });

  it("rolls back the whole generation when a migration fails", async () => {
    const db = await database();
    const baseline = await migration(
      "001-create-synthetic",
      "CREATE TABLE synthetic_cases (id TEXT PRIMARY KEY)",
    );
    await ownedMigrate(db, {
      logicalVersion: 1,
      generation: 1,
      migrations: [baseline],
    });
    const valid = await migration(
      "002-add-label",
      "ALTER TABLE synthetic_cases ADD COLUMN label TEXT",
      2,
    );
    const invalid = await migration("003-invalid", "THIS IS NOT SQL", 2);

    await expect(
      ownedMigrate(db, {
        logicalVersion: 2,
        generation: 2,
        migrations: [baseline, valid, invalid],
      }),
    ).resolves.toMatchObject({
      status: "recovery-required",
      reason: "migration-failed",
      migrationId: "003-invalid",
    });

    await expect(currentGeneration(db)).resolves.toBe(1);
    const columns = await db.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'synthetic_cases' ORDER BY column_name",
    );
    expect(columns.rows.map((row) => row.column_name)).toEqual(["id"]);
    await expect(appliedMigrations(db)).resolves.toHaveLength(1);
  });

  it("reports storage failure separately from migration DDL failure", async () => {
    const unavailable = {
      async exec() {},
      async query<T>() {
        return { rows: [] as T[] };
      },
      async transaction<T>(_callback: (tx: never) => Promise<T>): Promise<T> {
        throw new Error("synthetic storage unavailable");
      },
    };

    await expect(
      ownedMigrate(unavailable, {
        logicalVersion: 1,
        generation: 1,
        migrations: [],
      }),
    ).resolves.toEqual({
      status: "recovery-required",
      reason: "storage-failed",
      diagnostic: "Error: synthetic storage unavailable",
    });
  });

  it("fences a recorded migration history that is not the plan prefix", async () => {
    const db = await database();
    const first = await migration(
      "001-create-synthetic",
      "CREATE TABLE synthetic_cases (id TEXT PRIMARY KEY)",
    );
    const second = await migration(
      "002-add-label",
      "ALTER TABLE synthetic_cases ADD COLUMN label TEXT",
      2,
    );
    await ownedMigrate(db, {
      logicalVersion: 2,
      generation: 2,
      migrations: [first, second],
    });
    await db.exec("UPDATE _replica_migrations SET sequence = 3 - sequence");

    await expect(
      ownedMigrate(db, {
        logicalVersion: 2,
        generation: 3,
        migrations: [first, second],
      }),
    ).resolves.toMatchObject({ status: "recovery-required", reason: "checksum-drift" });
    await expect(currentGeneration(db)).resolves.toBe(2);
  });
});
