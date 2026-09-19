export interface ReplicaContinuationOptions {
  readonly signal: AbortSignal;
  readonly runOnce: () => Promise<void>;
  readonly intervalMs?: number;
  /** Invalidates the owning session when a pass fails after readiness. */
  readonly onFailure?: (cause: unknown) => void;
}

export interface ReplicaContinuation {
  /** Resolves after the first complete catch-up pass. */
  readonly ready: Promise<void>;
  /** Resolves after cancellation; rejects when a pass fails. */
  readonly closed: Promise<void>;
}

function waitForNextPass(signal: AbortSignal, intervalMs: number): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, intervalMs);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** Keep bounded catch-up passes alive for the lifetime of the replica owner. */
export function startReplicaContinuation(
  options: ReplicaContinuationOptions,
): ReplicaContinuation {
  let resolveReady!: () => void;
  let rejectReady!: (cause: unknown) => void;
  let settledReady = false;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  const closed = (async () => {
    try {
      while (!options.signal.aborted) {
        await options.runOnce();
        if (!settledReady) {
          settledReady = true;
          resolveReady();
        }
        await waitForNextPass(options.signal, options.intervalMs ?? 250);
      }
      if (!settledReady) {
        settledReady = true;
        rejectReady(new DOMException("Replica continuation cancelled", "AbortError"));
      }
    } catch (cause) {
      if (!settledReady) {
        settledReady = true;
        rejectReady(cause);
      }
      options.onFailure?.(cause);
      throw cause;
    }
  })();
  void closed.catch(() => undefined);

  return { ready, closed };
}
