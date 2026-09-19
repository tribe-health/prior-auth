import { describe, expect, it, vi } from "vitest";

import { startReplicaContinuation } from "./replica-continuation";

describe("startReplicaContinuation", () => {
  it("continues catch-up passes until its owner aborts", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const runOnce = vi.fn().mockResolvedValue(undefined);
    const continuation = startReplicaContinuation({
      signal: controller.signal,
      runOnce,
      intervalMs: 10,
    });

    await continuation.ready;
    await vi.advanceTimersByTimeAsync(20);
    expect(runOnce).toHaveBeenCalledTimes(3);

    controller.abort();
    await continuation.closed;
    vi.useRealTimers();
  });

  it("rejects readiness and closure when the initial pass fails", async () => {
    const failure = new Error("shape gateway unavailable");
    const continuation = startReplicaContinuation({
      signal: new AbortController().signal,
      runOnce: () => Promise.reject(failure),
    });

    await expect(continuation.ready).rejects.toBe(failure);
    await expect(continuation.closed).rejects.toBe(failure);
  });

  it("invalidates its owner when a later pass fails", async () => {
    vi.useFakeTimers();
    const failure = new Error("shape gateway failed after readiness");
    const onFailure = vi.fn();
    const runOnce = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(failure);
    const continuation = startReplicaContinuation({
      signal: new AbortController().signal,
      runOnce,
      onFailure,
      intervalMs: 10,
    });

    await continuation.ready;
    await vi.advanceTimersByTimeAsync(10);
    await expect(continuation.closed).rejects.toBe(failure);
    expect(onFailure).toHaveBeenCalledOnce();
    expect(onFailure).toHaveBeenCalledWith(failure);
    vi.useRealTimers();
  });
});
