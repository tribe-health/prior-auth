/**
 * The compare-and-set is the whole point, so these test it against
 * interference rather than only in the happy path.
 */
import { describe, expect, it } from "vitest";

import { createWebLeaseStore } from "./lease-store-web";
import { ReplicaLease } from "./replica-owner";

/** A minimal in-memory stand-in for localStorage. */
function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    get size() {
      return map.size;
    },
    raw: map,
  };
}

const KEY = "aso:g1:user:practice-1:identity-1";

describe("createWebLeaseStore", () => {
  it("round-trips a lease", async () => {
    const store = createWebLeaseStore(KEY, fakeStorage());
    const lease = { holder: "tab-a", expiresAt: 1_000 };
    expect(await store.write(lease, null)).toBe(true);
    expect(await store.read()).toEqual(lease);
  });

  it("refuses a write whose expected value no longer matches", async () => {
    // The race this exists to lose safely: a tab that read a stale value must
    // not overwrite the tab that got there first.
    const storage = fakeStorage();
    const store = createWebLeaseStore(KEY, storage);
    const first = { holder: "tab-a", expiresAt: 1_000 };
    await store.write(first, null);

    const stale = await store.write({ holder: "tab-b", expiresAt: 2_000 }, null);
    expect(stale).toBe(false);
    expect(await store.read()).toEqual(first);
  });

  it("allows a write from the holder that matches what it last saw", async () => {
    const store = createWebLeaseStore(KEY, fakeStorage());
    const first = { holder: "tab-a", expiresAt: 1_000 };
    await store.write(first, null);
    expect(await store.write({ holder: "tab-a", expiresAt: 2_000 }, first)).toBe(true);
  });

  it("lets only the holder clear the lease", async () => {
    // A tab that lost must not release the winner's claim as it tears down.
    const store = createWebLeaseStore(KEY, fakeStorage());
    const held = { holder: "tab-a", expiresAt: 1_000 };
    await store.write(held, null);

    await store.clear("tab-b");
    expect(await store.read()).toEqual(held);

    await store.clear("tab-a");
    expect(await store.read()).toBeNull();
  });

  it("treats a corrupt entry as no lease instead of wedging", async () => {
    // A malformed value must not permanently lock every tab out of the replica.
    const storage = fakeStorage();
    storage.raw.set(`aso:replica-lease:${KEY}`, "{not json");
    const store = createWebLeaseStore(KEY, storage);
    expect(await store.read()).toBeNull();
    expect(await store.write({ holder: "tab-a", expiresAt: 1 }, null)).toBe(true);
  });

  it("namespaces by storage key, so two principals do not contend", async () => {
    const storage = fakeStorage();
    const a = createWebLeaseStore("aso:g1:user:practice-1:identity-1", storage);
    const b = createWebLeaseStore("aso:g1:user:practice-2:identity-2", storage);

    await a.write({ holder: "tab-a", expiresAt: 1_000 }, null);
    // b sees an empty namespace and may take its own lease.
    expect(await b.read()).toBeNull();
    expect(await b.write({ holder: "tab-b", expiresAt: 1_000 }, null)).toBe(true);
  });

  it("degrades to no-lease when storage is unavailable", async () => {
    // Private-browsing and hardened configurations can leave localStorage
    // absent. Refusing the lease is correct: without a shared substrate this
    // context cannot prove it is the only writer.
    const store = createWebLeaseStore(KEY, undefined);
    expect(await store.read()).toBeNull();
    expect(await store.write({ holder: "tab-a", expiresAt: 1 }, null)).toBe(false);
  });

  it("drives a real ReplicaLease: second holder is refused", async () => {
    const storage = fakeStorage();
    const first = new ReplicaLease({
      store: createWebLeaseStore(KEY, storage),
      holder: "tab-a",
      now: () => 1_000,
    });
    const second = new ReplicaLease({
      store: createWebLeaseStore(KEY, storage),
      holder: "tab-b",
      now: () => 1_000,
    });

    expect((await first.acquire()).granted).toBe(true);
    expect((await second.acquire()).granted).toBe(false);
  });

  it("drives a real ReplicaLease: an expired lease is takeable", async () => {
    // A crashed tab can never release its own lease, so expiry is the only way
    // the replica becomes writable again.
    const storage = fakeStorage();
    await new ReplicaLease({
      store: createWebLeaseStore(KEY, storage),
      holder: "tab-a",
      ttlMs: 100,
      now: () => 1_000,
    }).acquire();

    const later = new ReplicaLease({
      store: createWebLeaseStore(KEY, storage),
      holder: "tab-b",
      now: () => 5_000,
    });
    expect((await later.acquire()).granted).toBe(true);
  });
});
