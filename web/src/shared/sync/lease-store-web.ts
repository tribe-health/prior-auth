/**
 * A cross-tab lease store backed by `localStorage`.
 *
 * The lease needs a substrate every tab of one origin can see. `localStorage`
 * is that, and it is synchronous, which matters here: the compare-and-set is a
 * read and a write with no `await` between them, so no other tab in *this*
 * process can interleave.
 *
 * ## What this does and does not guarantee
 *
 * It is advisory, exactly as `ReplicaLease` documents. Two tabs can still race
 * across the browser's storage boundary in principle — `localStorage` offers no
 * atomic compare-and-swap primitive. What the read-then-write does provide is
 * that a tab which observes a live lease belonging to someone else will not
 * take it, and a tab whose write is overwritten will find that out on its next
 * renewal. That is enough for the purpose: preventing two tabs from applying
 * migrations concurrently, not implementing a distributed lock.
 *
 * Storing **no PHI** here is deliberate — only a holder id and an expiry. The
 * key is namespaced by the replica's storage key so two principals or practices
 * on one browser never contend over each other's lease.
 */

import type { LeaseStore, StoredLease } from "./replica-owner";

/** Prefix keeps replica leases distinguishable from anything else on the origin. */
const KEY_PREFIX = "aso:replica-lease:";

interface WebStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Build a lease store for one replica namespace.
 *
 * `storage` is injectable so this is testable without a DOM, and so a caller
 * in an environment without `localStorage` can supply its own.
 */
export function createWebLeaseStore(
  storageKey: string,
  storage: WebStorageLike | undefined = globalThis.localStorage,
): LeaseStore {
  const key = `${KEY_PREFIX}${storageKey}`;

  const read = (): StoredLease | null => {
    if (!storage) return null;
    const raw = storage.getItem(key);
    if (raw === null) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        typeof (parsed as StoredLease).holder === "string" &&
        typeof (parsed as StoredLease).expiresAt === "number"
      ) {
        return parsed as StoredLease;
      }
      // Malformed value: treat as no lease rather than throwing. A corrupt
      // entry must not permanently wedge every tab out of the replica.
      return null;
    } catch {
      return null;
    }
  };

  return {
    async read() {
      return read();
    },

    async write(next, expected) {
      if (!storage) return false;
      // Compare-and-set. Synchronous, so nothing in this process interleaves
      // between the check and the write.
      const current = read();
      const matches =
        expected === null
          ? current === null
          : current !== null &&
            current.holder === expected.holder &&
            current.expiresAt === expected.expiresAt;
      if (!matches) return false;

      storage.setItem(key, JSON.stringify(next));
      return true;
    },

    async clear(heldBy) {
      if (!storage) return;
      // Only the holder may release. A tab that lost the lease must not clear
      // the winner's claim on its way out.
      const current = read();
      if (current && current.holder !== heldBy) return;
      storage.removeItem(key);
    },
  };
}
