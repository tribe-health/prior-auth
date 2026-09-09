/**
 * Session ownership and ordering.
 *
 * A React effect cleanup is synchronous, so the disposal barrier cannot live
 * there. It lives in the manager, and these assert the three properties that
 * makes possible: one owner, ordered replacement, no resurrection.
 *
 * The StrictMode case is not hypothetical — React deliberately double-invokes
 * effects in development, so mount → unmount → mount is the *normal* path, not
 * an edge case.
 */
import { describe, expect, it } from "vitest";

import { GraphSessionManager, type GraphSessionFactory } from "./graph-session-manager";

/**
 * Yield repeatedly until the microtask queue is idle.
 *
 * `await Promise.resolve()` advances exactly one tick. Any assertion that a
 * pending operation has *not* completed needs the queue drained first, or it
 * passes for the wrong reason — the operation simply had not had time to run.
 */
async function flushMicrotasks(ticks = 50): Promise<void> {
  for (let i = 0; i < ticks; i += 1) await Promise.resolve();
}

/**
 * A factory recording its lifecycle, with disposal that can be held open so a
 * re-open races a close in flight.
 */
function recordingFactory() {
  const opened: string[] = [];
  const disposed: string[] = [];
  // The gate a blocked dispose awaits. `block()` installs one; `release()`
  // resolves *this* promise, which is the one dispose() is actually parked on.
  let gate: Promise<void> | null = null;

  const factory: GraphSessionFactory = {
    open: async (key: string) => {
      opened.push(key);
      return {
        pglite: { key } as never,
        store: { key },
        dispose: async () => {
          // Read the gate once and clear it, so a held dispose blocks exactly
          // once and a later dispose is not caught by a stale gate.
          const held = gate;
          gate = null;
          if (held) await held;
          disposed.push(key);
        },
      };
    },
  };

  return {
    factory,
    opened,
    disposed,
    /** Make the next dispose block until `release()` is called. */
    block() {
      let resolve!: () => void;
      const done = new Promise<void>((r) => (resolve = r));
      gate = done;
      return { release: () => resolve(), done };
    },
  };
}

describe("GraphSessionManager", () => {
  it("reuses the live session for the same key", async () => {
    const rec = recordingFactory();
    const manager = new GraphSessionManager(rec.factory);

    const a = await manager.open("k1");
    const b = await manager.open("k1");

    expect(a.pglite).toBe(b.pglite);
    expect(rec.opened).toEqual(["k1"]);
  });

  it("coalesces concurrent opens into one session", async () => {
    // StrictMode can fire two mounts before either resolves. Two opens would
    // mean two PGlite instances over one dataset.
    const rec = recordingFactory();
    const manager = new GraphSessionManager(rec.factory);

    const [a, b] = await Promise.all([manager.open("k1"), manager.open("k1")]);

    expect(a.pglite).toBe(b.pglite);
    expect(rec.opened).toEqual(["k1"]);
  });

  it("closes and drains the old session before opening a different key", async () => {
    // The ordering guarantee: a disposed session's write must not land in its
    // successor's namespace.
    const rec = recordingFactory();
    const manager = new GraphSessionManager(rec.factory);

    await manager.open("practice-a");
    await manager.open("practice-b");

    expect(rec.disposed).toEqual(["practice-a"]);
    expect(rec.opened).toEqual(["practice-a", "practice-b"]);
    // Disposal of A completed before B opened.
    expect(rec.disposed.indexOf("practice-a")).toBeGreaterThanOrEqual(0);
  });

  it("survives mount → unmount → mount with exactly one live session", async () => {
    // The StrictMode shape. close() is started synchronously, as a React
    // cleanup would, and is not awaited by the caller.
    const rec = recordingFactory();
    const manager = new GraphSessionManager(rec.factory);

    await manager.open("k1");
    void manager.close();
    const remounted = await manager.open("k1");

    expect(remounted.key).toBe("k1");
    expect(manager.current?.key).toBe("k1");
    // One close, and the reopen did not stack a second live session.
    expect(rec.disposed).toEqual(["k1"]);
  });

  it("waits for an in-flight close rather than racing it", async () => {
    const rec = recordingFactory();
    const manager = new GraphSessionManager(rec.factory);
    await manager.open("k1");

    const held = rec.block();
    const closing = manager.close();

    let reopened = false;
    const reopen = manager.open("k2").then(() => {
      reopened = true;
    });

    // Drain the microtask queue. A single `await Promise.resolve()` yields
    // one tick, which open() cannot complete in *regardless* of the barrier —
    // so it asserts nothing. Flushing until the queue is idle means the only
    // thing that can still be holding the reopen is the barrier itself.
    await flushMicrotasks();
    expect(reopened).toBe(false);

    held.release();
    await closing;
    await reopen;

    expect(reopened).toBe(true);
  });

  it("is idempotent on close", async () => {
    const rec = recordingFactory();
    const manager = new GraphSessionManager(rec.factory);
    await manager.open("k1");

    await Promise.all([manager.close(), manager.close()]);

    expect(rec.disposed).toEqual(["k1"]);
  });

  it("closing with no live session is a no-op", async () => {
    const rec = recordingFactory();
    const manager = new GraphSessionManager(rec.factory);
    await expect(manager.close()).resolves.toBeUndefined();
    expect(rec.disposed).toEqual([]);
  });

  it("does not wedge when teardown fails", async () => {
    // A session that cannot be disposed is still gone as far as the next open
    // is concerned; a rejected dispose must not block the manager forever.
    const manager = new GraphSessionManager({
      open: async (key: string) => ({
        pglite: { key } as never,
        store: { key },
        dispose: async () => {
          throw new Error("teardown failed");
        },
      }),
    });

    await manager.open("k1");
    await expect(manager.close()).resolves.toBeUndefined();
    const next = await manager.open("k2");
    expect(next.key).toBe("k2");
  });
});
