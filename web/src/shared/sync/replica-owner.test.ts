/**
 * Exclusive-ownership lease.
 *
 * Two tabs both hold a handle to the same `idb://` database and will both apply
 * migrations. These assert that only one of them believes it may.
 */
import { describe, expect, it } from "vitest";

import { ReplicaLease, type LeaseStore, type StoredLease } from "./replica-owner";

/** In-memory store with real compare-and-set, so races are modelled honestly. */
function memoryStore(initial: StoredLease | null = null) {
  let value = initial;
  const store: LeaseStore = {
    read: async () => value,
    write: async (next, expected) => {
      const matches =
        (value === null && expected === null) ||
        (value !== null &&
          expected !== null &&
          value.holder === expected.holder &&
          value.expiresAt === expected.expiresAt);
      if (!matches) return false;
      value = next;
      return true;
    },
    clear: async (heldBy) => {
      if (value?.holder === heldBy) value = null;
    },
  };
  return { store, peek: () => value };
}

describe("ReplicaLease", () => {
  it("grants a free lease", async () => {
    const { store } = memoryStore();
    const lease = new ReplicaLease({ store, holder: "tab-a", now: () => 1000 });
    await expect(lease.acquire()).resolves.toEqual({ granted: true });
    expect(lease.held).toBe(true);
  });

  it("refuses while another holder's lease is live", async () => {
    const { store } = memoryStore({ holder: "tab-a", expiresAt: 5000 });
    const lease = new ReplicaLease({ store, holder: "tab-b", now: () => 1000 });
    await expect(lease.acquire()).resolves.toEqual({
      granted: false,
      heldBy: "tab-a",
      until: 5000,
    });
    expect(lease.held).toBe(false);
  });

  it("takes over an expired lease", async () => {
    // The crashed-holder case. A tab that dies cannot release its lease, so
    // refusing an expired one forever would wedge the app.
    const { store } = memoryStore({ holder: "dead-tab", expiresAt: 500 });
    const lease = new ReplicaLease({ store, holder: "tab-b", now: () => 1000 });
    await expect(lease.acquire()).resolves.toEqual({ granted: true });
  });

  it("re-acquiring its own lease is granted", async () => {
    const { store } = memoryStore({ holder: "tab-a", expiresAt: 9000 });
    const lease = new ReplicaLease({ store, holder: "tab-a", now: () => 1000 });
    await expect(lease.acquire()).resolves.toEqual({ granted: true });
  });

  it("only one of two racing contexts wins", async () => {
    // Compare-and-set is what makes this true: the loser's write fails against
    // the winner's value rather than overwriting it.
    const { store } = memoryStore();
    const a = new ReplicaLease({ store, holder: "tab-a", now: () => 1000 });
    const b = new ReplicaLease({ store, holder: "tab-b", now: () => 1000 });

    const [ra, rb] = await Promise.all([a.acquire(), b.acquire()]);
    const winners = [ra, rb].filter((r) => r.granted);
    expect(winners).toHaveLength(1);
  });

  it("renews a lease it holds", async () => {
    const { store, peek } = memoryStore();
    let now = 1000;
    const lease = new ReplicaLease({ store, holder: "tab-a", ttlMs: 100, now: () => now });
    await lease.acquire();
    expect(peek()?.expiresAt).toBe(1100);

    now = 1050;
    await expect(lease.renew()).resolves.toBe(true);
    expect(peek()?.expiresAt).toBe(1150);
  });

  it("fails renewal after being displaced, and stops claiming to hold it", async () => {
    // Displaced while stalled: the caller must stop writing rather than
    // silently reclaim ownership.
    const { store } = memoryStore();
    const lease = new ReplicaLease({ store, holder: "tab-a", now: () => 1000 });
    await lease.acquire();

    await store.write({ holder: "tab-b", expiresAt: 9000 }, await store.read());

    await expect(lease.renew()).resolves.toBe(false);
    expect(lease.held).toBe(false);
  });

  it("renewal without holding is refused", async () => {
    const { store } = memoryStore();
    const lease = new ReplicaLease({ store, holder: "tab-a" });
    await expect(lease.renew()).resolves.toBe(false);
  });

  it("releases so another context can take over", async () => {
    const { store, peek } = memoryStore();
    const a = new ReplicaLease({ store, holder: "tab-a", now: () => 1000 });
    await a.acquire();
    await a.release();
    expect(peek()).toBeNull();

    const b = new ReplicaLease({ store, holder: "tab-b", now: () => 1000 });
    await expect(b.acquire()).resolves.toEqual({ granted: true });
  });

  it("releasing when not held is a no-op", async () => {
    const { store } = memoryStore({ holder: "tab-a", expiresAt: 9000 });
    const b = new ReplicaLease({ store, holder: "tab-b" });
    await expect(b.release()).resolves.toBeUndefined();
    // tab-a's lease is untouched.
    await expect(store.read()).resolves.toEqual({ holder: "tab-a", expiresAt: 9000 });
  });
});
