import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  installPrivateRuntimeQuiescer,
  quiescePrivateRuntime,
  resetPrivateRuntimeQuiescerForTests,
} from './runtime-quiescence';

afterEach(resetPrivateRuntimeQuiescerForTests);

describe('private runtime quiescence seam', () => {
  it('awaits the drain installed by the one graph owner', async () => {
    let finish: (() => void) | undefined;
    const drain = vi.fn(() => new Promise<void>((resolve) => {
      finish = resolve;
    }));
    installPrivateRuntimeQuiescer(drain);

    let settled = false;
    const closing = quiescePrivateRuntime().then(() => {
      settled = true;
    });
    await Promise.resolve();

    expect(drain).toHaveBeenCalledOnce();
    expect(settled).toBe(false);
    finish?.();
    await closing;
    expect(settled).toBe(true);
  });
});
