/**
 * Exclusive ownership of the local replica.
 *
 * ── Why a lease ─────────────────────────────────────────────────────────────
 *
 * PGlite in `idb://` mode is a single database backed by shared storage. Two
 * tabs of the same app both hold a handle to it, and both will happily apply
 * migrations and write rows. One of them wins each race, and the loser's view
 * of "what generation am I on" silently diverges from disk — the drift ADR-001
 * exists to prevent, one layer down and across tabs rather than within one.
 *
 * So exactly one context owns the replica at a time, and the others wait or
 * proceed read-only. The lease is advisory, not enforced by the database: a
 * tab that crashes cannot release it, which is why it carries an expiry and is
 * renewed while held.
 *
 * ── What this is not ────────────────────────────────────────────────────────
 *
 * It is not a lock over *reads*. A tab without the lease can still read the
 * replica; it just must not migrate it or write to it. Blocking reads would
 * make a background tab appear broken for no safety gain.
 *
 * ADR-009 G4 (flint-realtime-fabric); runtime architecture §7.
 */

/** How the lease is persisted. Injected so it is testable without a browser. */
export interface LeaseStore {
  read: () => Promise<StoredLease | null>;
  /** Write only if the current value still matches `expected` (compare-and-set). */
  write: (next: StoredLease, expected: StoredLease | null) => Promise<boolean>;
  clear: (heldBy: string) => Promise<void>;
}

export interface StoredLease {
  /** Identifies the holder — a per-context id, not a user or session. */
  holder: string;
  /** Epoch ms after which the lease is considered abandoned. */
  expiresAt: number;
}

/** Per-context lease storage for replicas that are already isolated in memory. */
export function createMemoryLeaseStore(): LeaseStore {
  let stored: StoredLease | null = null;
  return {
    async read() {
      return stored;
    },
    async write(next, expected) {
      const matches =
        (stored === null && expected === null) ||
        (stored !== null &&
          expected !== null &&
          stored.holder === expected.holder &&
          stored.expiresAt === expected.expiresAt);
      if (!matches) return false;
      stored = next;
      return true;
    },
    async clear(heldBy) {
      if (stored?.holder === heldBy) stored = null;
    },
  };
}

export interface ReplicaLeaseOptions {
  store: LeaseStore;
  /** This context's id. Must be unique per tab/worker. */
  holder: string;
  /** How long a lease stays valid without renewal. Default 15s. */
  ttlMs?: number;
  /** Clock seam for tests. */
  now?: () => number;
}

export type LeaseResult =
  | { granted: true }
  /** Someone else holds a live lease; `until` is when it lapses. */
  | { granted: false; heldBy: string; until: number };

const DEFAULT_TTL_MS = 15_000;

/**
 * Advisory exclusive lease over the local replica.
 *
 * Acquisition is compare-and-set against the stored value, so two contexts
 * racing cannot both believe they won: the second's CAS fails against the
 * first's write.
 */
export class ReplicaLease {
  readonly #store: LeaseStore;
  readonly #holder: string;
  readonly #ttlMs: number;
  readonly #now: () => number;
  #held = false;
  #renewalTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: ReplicaLeaseOptions) {
    this.#store = options.store;
    this.#holder = options.holder;
    this.#ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.#now = options.now ?? (() => Date.now());
  }

  get holder(): string {
    return this.#holder;
  }

  get held(): boolean {
    return this.#held;
  }

  /**
   * Try to take the lease.
   *
   * Grants when the lease is free, already ours, or **expired** — an expired
   * lease is the crashed-holder case, and refusing it forever would wedge the
   * app on a tab that will never come back.
   */
  async acquire(): Promise<LeaseResult> {
    const current = await this.#store.read();
    const now = this.#now();

    if (current && current.holder !== this.#holder && current.expiresAt > now) {
      return { granted: false, heldBy: current.holder, until: current.expiresAt };
    }

    const next: StoredLease = { holder: this.#holder, expiresAt: now + this.#ttlMs };
    // Compare-and-set against exactly what we read. If another context wrote in
    // between, this fails and we report *their* lease rather than stealing it.
    const won = await this.#store.write(next, current);
    if (!won) {
      const latest = await this.#store.read();
      if (latest?.holder === this.#holder && latest.expiresAt > now) {
        this.#held = true;
        return { granted: true };
      }
      return latest && latest.holder !== this.#holder
        ? { granted: false, heldBy: latest.holder, until: latest.expiresAt }
        : { granted: false, heldBy: "unknown", until: now };
    }

    this.#held = true;
    return { granted: true };
  }

  /**
   * Extend a lease we hold.
   *
   * Returns false if we no longer hold it — a renewal that finds someone else's
   * lease means we were displaced while stalled, and the caller must stop
   * writing rather than reclaim it silently.
   */
  async renew(): Promise<boolean> {
    if (!this.#held) return false;
    const current = await this.#store.read();
    if (!current || current.holder !== this.#holder) {
      this.#held = false;
      return false;
    }
    const next: StoredLease = { holder: this.#holder, expiresAt: this.#now() + this.#ttlMs };
    const won = await this.#store.write(next, current);
    if (!won) this.#held = false;
    return won;
  }

  /** Renew while a caller retains ownership; loss permanently fences this lease. */
  startRenewal(onLost: (error?: unknown) => void): () => void {
    if (!this.#held) throw new Error("Cannot renew a lease that is not held");
    this.#stopRenewal();
    const timer = setInterval(() => {
      void this.renew().then((retained) => {
        if (retained) return;
        this.#stopRenewal();
        onLost();
      }).catch((error: unknown) => {
        this.#held = false;
        this.#stopRenewal();
        onLost(error);
      });
    }, Math.max(1, Math.floor(this.#ttlMs / 3)));
    this.#renewalTimer = timer;
    return () => {
      if (this.#renewalTimer === timer) this.#stopRenewal();
    };
  }

  /** Give up the lease. Safe to call when not held. */
  async release(): Promise<void> {
    this.#stopRenewal();
    if (!this.#held) return;
    this.#held = false;
    await this.#store.clear(this.#holder);
  }

  #stopRenewal(): void {
    if (this.#renewalTimer !== null) clearInterval(this.#renewalTimer);
    this.#renewalTimer = null;
  }
}
