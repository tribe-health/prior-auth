/**
 * Ownership and ordering for the local graph runtime.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * A React effect cleanup is **synchronous**. It cannot await a promise, so
 * "await dispose() in the teardown" is not a thing the framework can do — the
 * effect returns, React proceeds, and the next effect may open a replacement
 * while the previous runtime's writes are still settling.
 *
 * The barrier therefore cannot live in the cleanup. It lives here: the manager
 * holds the disposal promise, and the *next* open waits on it. The cleanup's
 * only job is to tell the manager to start closing.
 *
 * ── What it guarantees ──────────────────────────────────────────────────────
 *
 * 1. **One owner.** A second `open()` for the same key returns the same runtime
 *    rather than opening a second PGlite over the same data — the drift ADR-001
 *    exists to prevent, one layer down.
 * 2. **Ordered replacement.** Opening a *different* key closes the current
 *    runtime and awaits its drain before the replacement starts, so a disposed
 *    session's write cannot land in its successor's namespace.
 * 3. **No resurrection.** A close that is in flight when a re-open arrives is
 *    awaited, not cancelled. StrictMode's mount → unmount → mount therefore
 *    yields exactly one live runtime.
 *
 * ADR-009 G2 (flint-realtime-fabric); runtime architecture §7.
 */
import type { PGlite } from "@electric-sql/pglite";

/** What a caller needs back from an open session. */
export interface GraphSession {
  readonly key: string;
  readonly pglite: PGlite;
  readonly store: unknown;
  /** Resolves when this session is fully torn down and drained. */
  readonly closed: Promise<void>;
}

/** How the manager creates and tears down a session. Injected so it is testable. */
export interface GraphSessionFactory {
  open: (key: string) => Promise<{
    pglite: PGlite;
    store: unknown;
    /** Drains in-flight persistence; resolves when quiescent. */
    dispose: () => Promise<void>;
  }>;
}

interface LiveSession {
  key: string;
  pglite: PGlite;
  store: unknown;
  dispose: () => Promise<void>;
  /** Set once closing begins; the next open awaits it. */
  closing: Promise<void> | null;
}

export class GraphSessionManager {
  #factory: GraphSessionFactory;
  #live: LiveSession | null = null;
  /** In-flight open, so concurrent callers share one rather than racing. */
  #opening: Promise<GraphSession> | null = null;

  constructor(factory: GraphSessionFactory) {
    this.#factory = factory;
  }

  /**
   * Open (or reuse) the session for `key`.
   *
   * Reuses the live session when the key matches. When it differs, the current
   * session is closed and **drained** before the replacement opens — that await
   * is the barrier React's cleanup could not provide.
   */
  async open(key: string): Promise<GraphSession> {
    // Coalesce concurrent opens: StrictMode can fire two mounts before either
    // resolves, and two opens would mean two PGlite instances over one dataset.
    if (this.#opening) {
      const pending = await this.#opening;
      if (pending.key === key) return pending;
    }

    const live = this.#live;
    if (live && live.key === key && !live.closing) {
      return this.#toSession(live);
    }

    const start = (async () => {
      // Close the outgoing session first, and wait for it. A write from the old
      // session must not land while its successor is opening.
      if (this.#live) await this.close();

      const opened = await this.#factory.open(key);
      const next: LiveSession = { key, ...opened, closing: null };
      this.#live = next;
      return this.#toSession(next);
    })();

    this.#opening = start;
    try {
      return await start;
    } finally {
      if (this.#opening === start) this.#opening = null;
    }
  }

  /**
   * Close the live session and drain it.
   *
   * Idempotent and safe to call from a synchronous React cleanup as
   * `void manager.close()` — the promise is retained here, and the next
   * `open()` awaits it, so the ordering guarantee does not depend on the
   * caller awaiting anything.
   */
  close(): Promise<void> {
    const live = this.#live;
    if (!live) return Promise.resolve();
    if (live.closing) return live.closing;

    const closing = live
      .dispose()
      // Teardown failure must not wedge the manager: a session that cannot be
      // disposed is still gone as far as the next open is concerned.
      .catch(() => undefined)
      .then(() => {
        if (this.#live === live) this.#live = null;
      });

    live.closing = closing;
    return closing;
  }

  /** The live session, or null. Test and diagnostic use. */
  get current(): GraphSession | null {
    return this.#live && !this.#live.closing ? this.#toSession(this.#live) : null;
  }

  #toSession(live: LiveSession): GraphSession {
    return {
      key: live.key,
      pglite: live.pglite,
      store: live.store,
      closed: live.closing ?? Promise.resolve(),
    };
  }
}
