import { describe, expect, it } from "vitest";

import {
  ReplicaOwnerFenceError,
  ReplicaWorkerOwner,
  ReplicaWorkerScopeManager,
  type ExclusiveLockManager,
  type OwnedReplicaResource,
  type ReplicaWorkerScope,
} from "./replica-worker-owner";

class MemoryExclusiveLocks implements ExclusiveLockManager {
  readonly #held = new Set<string>();

  async request(
    name: string,
    _options: { mode: "exclusive"; ifAvailable: true },
    callback: (lock: { name: string } | null) => Promise<void>,
  ): Promise<void> {
    if (this.#held.has(name)) {
      await callback(null);
      return;
    }
    this.#held.add(name);
    try {
      await callback({ name });
    } finally {
      this.#held.delete(name);
    }
  }
}

function resourceFactory(label: string, lifecycle: string[]) {
  return {
    async open(): Promise<OwnedReplicaResource & { label: string }> {
      lifecycle.push(`open:${label}`);
      return {
        label,
        async drain() {
          lifecycle.push(`drain:${label}`);
        },
        async close() {
          lifecycle.push(`close:${label}`);
        },
      };
    },
  };
}

function owner(locks: ExclusiveLockManager, label: string, lifecycle: string[]) {
  return new ReplicaWorkerOwner({
    locks,
    lockName: "aso:replica:synthetic-scope",
    factory: resourceFactory(label, lifecycle),
  });
}

describe("ReplicaWorkerOwner", () => {
  it("grants one owner and makes the other tab a follower", async () => {
    const locks = new MemoryExclusiveLocks();
    const lifecycle: string[] = [];
    const a = owner(locks, "a", lifecycle);
    const b = owner(locks, "b", lifecycle);

    const [aClaim, bClaim] = await Promise.all([a.tryOpen(), b.tryOpen()]);

    expect([aClaim.status, bClaim.status].sort()).toEqual(["follower", "owner"]);
    expect(lifecycle.filter((entry) => entry.startsWith("open:"))).toHaveLength(1);
    await Promise.all([a.close(), b.close()]);
  });

  it("drains and closes before exactly one replacement owner opens", async () => {
    const locks = new MemoryExclusiveLocks();
    const lifecycle: string[] = [];
    const first = owner(locks, "first", lifecycle);
    const followerA = owner(locks, "replacement-a", lifecycle);
    const followerB = owner(locks, "replacement-b", lifecycle);

    await expect(first.tryOpen()).resolves.toMatchObject({ status: "owner" });
    await first.close();

    const claims = await Promise.all([followerA.tryOpen(), followerB.tryOpen()]);
    expect(claims.filter((claim) => claim.status === "owner")).toHaveLength(1);
    expect(claims.filter((claim) => claim.status === "follower")).toHaveLength(1);
    expect(lifecycle.slice(0, 4)).toEqual([
      "open:first",
      "drain:first",
      "close:first",
      expect.stringMatching(/^open:replacement-/),
    ]);

    await Promise.all([followerA.close(), followerB.close()]);
  });

  it("holds the lock until accepted work drains", async () => {
    const locks = new MemoryExclusiveLocks();
    const lifecycle: string[] = [];
    const first = owner(locks, "first", lifecycle);
    const second = owner(locks, "second", lifecycle);
    await first.tryOpen();

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const work = first.withOwner(async () => {
      lifecycle.push("work:start");
      await gate;
      lifecycle.push("work:end");
    });
    first.requestClose();
    const closing = first.closed;

    await expect(second.tryOpen()).resolves.toEqual({ status: "follower" });
    release();
    await Promise.allSettled([work]);
    await closing;
    await expect(second.tryOpen()).resolves.toMatchObject({ status: "owner" });
    expect(lifecycle.indexOf("work:end")).toBeLessThan(lifecycle.indexOf("close:first"));
    await second.close();
  });

  it("permanently fences a closed owner from resuming", async () => {
    const locks = new MemoryExclusiveLocks();
    const lifecycle: string[] = [];
    const stale = owner(locks, "stale", lifecycle);

    await stale.tryOpen();
    await stale.close();

    await expect(stale.tryOpen()).resolves.toEqual({ status: "closed" });
    await expect(stale.withOwner(async () => undefined)).rejects.toBeInstanceOf(
      ReplicaOwnerFenceError,
    );
    expect(lifecycle.filter((entry) => entry === "open:stale")).toHaveLength(1);
  });

  it("releases ownership after a drain failure and still attempts handle close", async () => {
    const locks = new MemoryExclusiveLocks();
    const lifecycle: string[] = [];
    const broken = new ReplicaWorkerOwner({
      locks,
      lockName: "aso:replica:synthetic-scope",
      factory: {
        async open() {
          return {
            async drain() {
              lifecycle.push("drain:broken");
              throw new Error("synthetic drain failure");
            },
            async close() {
              lifecycle.push("close:broken");
            },
          };
        },
      },
    });
    const replacement = owner(locks, "replacement", lifecycle);

    await broken.tryOpen();
    await expect(broken.close()).rejects.toThrow("synthetic drain failure");
    await expect(replacement.tryOpen()).resolves.toMatchObject({ status: "owner" });
    expect(lifecycle.slice(0, 2)).toEqual(["drain:broken", "close:broken"]);
    await replacement.close();
  });

  it("rejects reentrant close from owner work instead of deadlocking", async () => {
    const locks = new MemoryExclusiveLocks();
    const lifecycle: string[] = [];
    const active = owner(locks, "active", lifecycle);
    await active.tryOpen();

    await expect(
      active.withOwner(async () => {
        await Promise.resolve();
        await active.close();
      }),
    ).rejects.toThrow("Owner work is active");

    await active.close();
  });

  it("quarantines a scope after close failure before opening its replacement", async () => {
    const locks = new MemoryExclusiveLocks();
    const events: string[] = [];
    const errors: unknown[] = [];
    const firstScope: ReplicaWorkerScope = {
      deployment: "test",
      principal: "user",
      practiceId: "practice",
      identityId: "first",
      authorizationRevision: "1",
      generation: 1,
    };
    const secondScope = { ...firstScope, identityId: "second" };
    const manager = new ReplicaWorkerScopeManager(
      (activeScope, key) =>
        new ReplicaWorkerOwner({
          locks,
          lockName: key,
          factory: {
            async open() {
              events.push(`open:${activeScope.identityId}`);
              return {
                async drain() {
                  if (activeScope.identityId === "first") throw new Error("drain failed");
                },
                async close() {
                  events.push(`close:${activeScope.identityId}`);
                },
              };
            },
          },
        }),
      async (key) => {
        events.push(`quarantine:${key.includes("first") ? "first" : "second"}`);
      },
      (error) => errors.push(error),
    );

    await manager.open(firstScope);
    await expect(manager.open(secondScope)).resolves.toMatchObject({ status: "owner" });
    expect(events).toEqual(["open:first", "close:first", "quarantine:first", "open:second"]);
    expect(errors).toHaveLength(1);
    await manager.close();
  });

  it("serializes rapid scope changes behind the outgoing quarantine", async () => {
    const locks = new MemoryExclusiveLocks();
    const events: string[] = [];
    let releaseDrain!: () => void;
    const drainGate = new Promise<void>((resolve) => {
      releaseDrain = resolve;
    });
    const base: ReplicaWorkerScope = {
      deployment: "test",
      principal: "user",
      practiceId: "practice",
      identityId: "first",
      authorizationRevision: "1",
      generation: 1,
    };
    const manager = new ReplicaWorkerScopeManager(
      (activeScope, key) =>
        new ReplicaWorkerOwner({
          locks,
          lockName: key,
          factory: {
            async open() {
              events.push(`open:${activeScope.identityId}`);
              return {
                async drain() {
                  if (activeScope.identityId === "first") await drainGate;
                },
                async close() {
                  events.push(`close:${activeScope.identityId}`);
                },
              };
            },
          },
        }),
      async (key) => {
        events.push(`quarantine:${key.includes("first") ? "first" : "other"}`);
      },
    );

    await manager.open(base);
    const second = manager.open({ ...base, identityId: "second" });
    const third = manager.open({ ...base, identityId: "third" });
    await Promise.resolve();
    expect(events).toEqual(["open:first"]);

    releaseDrain();
    await expect(second).resolves.toEqual({ status: "invalidated" });
    await expect(third).resolves.toMatchObject({ status: "owner" });
    expect(events).toEqual(["open:first", "close:first", "quarantine:first", "open:third"]);
    await manager.close();
  });

  it("requires recovery when close fails without a quarantine hook", async () => {
    const locks = new MemoryExclusiveLocks();
    const base: ReplicaWorkerScope = {
      deployment: "test",
      principal: "user",
      practiceId: "practice",
      identityId: "first",
      authorizationRevision: "1",
      generation: 1,
    };
    const manager = new ReplicaWorkerScopeManager((activeScope, key) =>
      new ReplicaWorkerOwner({
        locks,
        lockName: key,
        factory: {
          async open() {
            return {
              async drain() {
                if (activeScope.identityId === "first") throw new Error("drain failed");
              },
              async close() {},
            };
          },
        },
      }),
    );

    await manager.open(base);
    await expect(manager.open({ ...base, identityId: "second" })).resolves.toEqual({
      status: "recovery-required",
      reason: "scope-quarantine-failed",
    });
    await expect(manager.open({ ...base, identityId: "third" })).resolves.toEqual({
      status: "recovery-required",
      reason: "scope-quarantine-failed",
    });
    await manager.recoverScopeQuarantine(async () => undefined);
    await expect(manager.open({ ...base, identityId: "third" })).resolves.toMatchObject({
      status: "owner",
    });
    await manager.close();
  });

  it("aborts an opening scope so identity replacement does not wait for stale startup", async () => {
    const locks = new MemoryExclusiveLocks();
    const events: string[] = [];
    const base: ReplicaWorkerScope = {
      deployment: "test",
      principal: "user",
      practiceId: "practice",
      identityId: "first",
      authorizationRevision: "1",
      generation: 1,
    };
    const manager = new ReplicaWorkerScopeManager(
      (activeScope, key) => new ReplicaWorkerOwner({
        locks,
        lockName: key,
        factory: {
          async open(signal) {
            if (activeScope.identityId === "first") {
              await new Promise<void>((_resolve, reject) => {
                signal.addEventListener(
                  "abort",
                  () => reject(new DOMException("Opening scope invalidated", "AbortError")),
                  { once: true },
                );
              });
            }
            events.push(`open:${activeScope.identityId}`);
            return { async drain() {}, async close() {} };
          },
        },
      }),
      async (key) => {
        events.push(`quarantine:${key.includes("first") ? "first" : "other"}`);
      },
    );

    const first = manager.open(base);
    await Promise.resolve();
    const second = manager.open({ ...base, identityId: "second" });

    await expect(first).resolves.toEqual({ status: "invalidated" });
    await expect(second).resolves.toMatchObject({ status: "owner" });
    expect(events).toEqual(["quarantine:first", "open:second"]);
    await manager.close();
  });

  it("quarantines teardown failure from an owner invalidated while opening", async () => {
    const locks = new MemoryExclusiveLocks();
    const events: string[] = [];
    const errors: unknown[] = [];
    let releaseOpen!: () => void;
    const openGate = new Promise<void>((resolve) => {
      releaseOpen = resolve;
    });
    const base: ReplicaWorkerScope = {
      deployment: "test",
      principal: "user",
      practiceId: "practice",
      identityId: "first",
      authorizationRevision: "1",
      generation: 1,
    };
    const manager = new ReplicaWorkerScopeManager(
      (activeScope, key) =>
        new ReplicaWorkerOwner({
          locks,
          lockName: key,
          factory: {
            async open() {
              if (activeScope.identityId === "first") await openGate;
              events.push(`opened:${activeScope.identityId}`);
              return {
                async drain() {
                  if (activeScope.identityId === "first") throw new Error("opening drain failed");
                },
                async close() {
                  events.push(`closed:${activeScope.identityId}`);
                },
              };
            },
          },
        }),
      async (key) => {
        events.push(`quarantined:${key.includes("first") ? "first" : "other"}`);
      },
      (error) => errors.push(error),
    );

    const first = manager.open(base);
    await Promise.resolve();
    const second = manager.open({ ...base, identityId: "second" });
    releaseOpen();

    await expect(first).rejects.toThrow("opening drain failed");
    await expect(second).resolves.toMatchObject({ status: "owner" });
    expect(events).toEqual([
      "opened:first",
      "closed:first",
      "quarantined:first",
      "opened:second",
    ]);
    expect(errors).toHaveLength(1);
    await manager.close();
  });

  it("resets after a synchronous lock-manager failure and can retry", async () => {
    const locks = new MemoryExclusiveLocks();
    let first = true;
    const throwingOnce: ExclusiveLockManager = {
      request(name, options, callback) {
        if (first) {
          first = false;
          throw new Error("synthetic lock failure");
        }
        return locks.request(name, options, callback);
      },
    };
    const lifecycle: string[] = [];
    const candidate = owner(throwingOnce, "candidate", lifecycle);

    await expect(candidate.tryOpen()).rejects.toThrow("synthetic lock failure");
    expect(candidate.state).toBe("idle");
    await expect(candidate.tryOpen()).resolves.toMatchObject({ status: "owner" });
    await candidate.close();
  });

  it("resets after an asynchronous lock-manager failure and can retry", async () => {
    const locks = new MemoryExclusiveLocks();
    let first = true;
    const rejectingOnce: ExclusiveLockManager = {
      request(name, options, callback) {
        if (first) {
          first = false;
          return Promise.reject(new Error("synthetic asynchronous lock failure"));
        }
        return locks.request(name, options, callback);
      },
    };
    const lifecycle: string[] = [];
    const candidate = owner(rejectingOnce, "candidate", lifecycle);

    await expect(candidate.tryOpen()).rejects.toThrow("synthetic asynchronous lock failure");
    expect(candidate.state).toBe("idle");
    await expect(candidate.tryOpen()).resolves.toMatchObject({ status: "owner" });
    await candidate.close();
  });
});
