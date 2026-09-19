import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";

import {
  migrateReplicaSchema,
  migrationChecksum,
  type ReplicaSchemaPlan,
  type TransactionalLedgerClient,
} from "./migration-ledger";
import { ReplicaLease, type StoredLease } from "./replica-owner";
import {
  ReplicaWorkerOwner,
  ReplicaWorkerScopeManager,
  type ExclusiveLockManager,
  type ReplicaWorkerScope,
} from "./replica-worker-owner";

class MemoryExclusiveLocks implements ExclusiveLockManager {
  readonly #held = new Set<string>();

  async request(
    name: string,
    _options: { mode: "exclusive"; ifAvailable: true },
    callback: (lock: { name: string } | null) => Promise<void>,
  ): Promise<void> {
    if (this.#held.has(name)) return callback(null);
    this.#held.add(name);
    try {
      await callback({ name });
    } finally {
      this.#held.delete(name);
    }
  }
}

interface DurableResource {
  db: PGlite;
  drain(): Promise<void>;
  close(): Promise<void>;
}

const roots: string[] = [];

async function ownedMigrate(
  client: TransactionalLedgerClient,
  plan: ReplicaSchemaPlan,
) {
  let stored: StoredLease | null = null;
  const lease = new ReplicaLease({
    holder: "durable-lifecycle-test",
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

async function isolatedRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "aso-ra11b-"));
  roots.push(root);
  return root;
}

async function schemaPlan(sql = "CREATE TABLE synthetic_rows (id TEXT PRIMARY KEY, value TEXT)"):
Promise<ReplicaSchemaPlan> {
  return {
    logicalVersion: 1,
    generation: 1,
    migrations: [
      { id: "001-synthetic", sql, checksum: await migrationChecksum(sql), logicalVersion: 1 },
    ],
  };
}

function scope(identityId: string): ReplicaWorkerScope {
  return {
    deployment: "test",
    principal: "user",
    practiceId: "synthetic-practice",
    identityId,
    authorizationRevision: "test:1",
    generation: 1,
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("durable replica worker lifecycle", () => {
  it("fences an old tab after owner close and gives exactly one follower the durable replica", async () => {
    const root = await isolatedRoot();
    const locks = new MemoryExclusiveLocks();
    const plan = await schemaPlan();
    const makeOwner = () =>
      new ReplicaWorkerOwner({
        locks,
        lockName: "aso:synthetic-owner",
        factory: {
          async open(): Promise<DurableResource> {
            const db = await PGlite.create(join(root, "replica"));
            const migrated = await ownedMigrate(db, plan);
            if (migrated.status !== "ready") {
              await db.close();
              throw new Error(migrated.reason);
            }
            return { db, drain: async () => undefined, close: () => db.close() };
          },
        },
      });
    const leader = makeOwner();
    const followerA = makeOwner();
    const followerB = makeOwner();

    await leader.tryOpen();
    await leader.withOwner(({ db }) =>
      db.query("INSERT INTO synthetic_rows (id, value) VALUES ($1, $2)", ["row-1", "durable"]),
    );
    await leader.close();

    const claims = await Promise.all([followerA.tryOpen(), followerB.tryOpen()]);
    expect(claims.filter((claim) => claim.status === "owner")).toHaveLength(1);
    const replacement = claims[0]?.status === "owner" ? followerA : followerB;
    await expect(
      replacement.withOwner(async ({ db }) =>
        (await db.query<{ value: string }>("SELECT value FROM synthetic_rows WHERE id = $1", ["row-1"]))
          .rows[0]?.value,
      ),
    ).resolves.toBe("durable");
    await expect(leader.tryOpen()).resolves.toEqual({ status: "closed" });
    await Promise.all([followerA.close(), followerB.close()]);
  });

  it("quarantines a failed migration without partially changing durable data", async () => {
    const root = await isolatedRoot();
    const db = await PGlite.create(join(root, "replica"));
    const baseline = await schemaPlan();
    await ownedMigrate(db, baseline);
    await db.query("INSERT INTO synthetic_rows (id, value) VALUES ($1, $2)", ["row-1", "kept"]);
    const additiveSql = "ALTER TABLE synthetic_rows ADD COLUMN partial TEXT";
    const badSql = "THIS IS NOT SQL";
    const failed = await ownedMigrate(db, {
      logicalVersion: 2,
      generation: 2,
      migrations: [
        ...baseline.migrations,
        {
          id: "002-add-partial",
          sql: additiveSql,
          checksum: await migrationChecksum(additiveSql),
          logicalVersion: 2,
        },
        {
          id: "003-failed",
          sql: badSql,
          checksum: await migrationChecksum(badSql),
          logicalVersion: 2,
        },
      ],
    });

    expect(failed).toMatchObject({
      status: "recovery-required",
      reason: "migration-failed",
      migrationId: "003-failed",
    });
    const rows = await db.query<{ value: string }>("SELECT value FROM synthetic_rows");
    expect(rows.rows).toEqual([{ value: "kept" }]);
    const partial = await db.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'synthetic_rows' ORDER BY column_name",
    );
    expect(partial.rows.map((row) => row.column_name)).toEqual(["id", "value"]);
    await db.close();
  }, 20_000);

  it("invalidates an old identity during opening and never exposes its data to the new identity", async () => {
    const root = await isolatedRoot();
    const locks = new MemoryExclusiveLocks();
    const plan = await schemaPlan();
    let releaseOld!: () => void;
    let signalOldReady!: () => void;
    const oldOpening = new Promise<void>((resolve) => {
      releaseOld = resolve;
    });
    const oldReady = new Promise<void>((resolve) => {
      signalOldReady = resolve;
    });
    const identityByKey = new Map<string, string>();
    const manager = new ReplicaWorkerScopeManager<DurableResource>(
      (activeScope, key) => {
        identityByKey.set(key, activeScope.identityId);
        return new ReplicaWorkerOwner({
          locks,
          lockName: `aso:${key}`,
          factory: {
            async open(): Promise<DurableResource> {
              const dir = join(root, activeScope.identityId);
              const db = await PGlite.create(dir);
              const migrated = await ownedMigrate(db, plan);
              if (migrated.status !== "ready") {
                await db.close();
                throw new Error(migrated.reason);
              }
              if (activeScope.identityId === "old-identity") {
                await db.query("INSERT INTO synthetic_rows (id, value) VALUES ($1, $2)", [
                  "old-row",
                  "old-only",
                ]);
                signalOldReady();
                await oldOpening;
              }
              return { db, drain: async () => undefined, close: () => db.close() };
            }
          },
        });
      },
      async (closedKey) => {
        const identity = identityByKey.get(closedKey);
        if (identity) await rm(join(root, identity), { recursive: true, force: true });
      },
    );

    const oldScope = scope("old-identity");
    const newScope = scope("new-identity");
    const openingOld = manager.open(oldScope);
    await oldReady;
    const openingNew = manager.open(newScope);
    releaseOld();

    await expect(openingOld).resolves.toEqual({ status: "invalidated" });
    await expect(openingNew).resolves.toMatchObject({ status: "owner" });
    await expect(
      manager.withCurrent(newScope, async ({ db }) =>
        (await db.query<{ count: number }>("SELECT count(*)::int AS count FROM synthetic_rows")).rows[0]
          ?.count,
      ),
    ).resolves.toBe(0);
    await expect(manager.withCurrent(oldScope, async () => undefined)).rejects.toThrow(
      "Replica scope is no longer current",
    );
    await manager.close();
  }, 20_000);
});
