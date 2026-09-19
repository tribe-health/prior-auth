import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { ViewScope } from './scoped-view-store';
import { useScopedViewStore } from './use-scoped-view-store';

const scope = (epoch: number): ViewScope => ({
  identityId: 'identity-a',
  sessionId: 'session-a',
  practiceId: 'practice-a',
  authorizationRevision: 'membership:1',
  epoch,
  caseId: 'case-a',
  viewInstanceId: 'view-a',
});

describe('useScopedViewStore', () => {
  it('stays writable through Strict Mode effect replay and closes after unmount', async () => {
    const { result, unmount } = renderHook(
      () => useScopedViewStore(scope(1), () => ({ selection: null as string | null })),
      { wrapper: StrictMode },
    );
    const lease = result.current[1];

    await act(async () => Promise.resolve());
    act(() => expect(lease.publish(() => ({ selection: 'source-a' }))).toBe(true));
    expect(result.current[0].selection).toBe('source-a');

    unmount();
    await act(async () => Promise.resolve());
    expect(lease.publish(() => ({ selection: 'source-old' }))).toBe(false);
  });

  it('replaces view state synchronously and fences a callback from the prior epoch', () => {
    const { result, rerender } = renderHook(
      ({ epoch }) => useScopedViewStore(scope(epoch), () => ({ selection: null as string | null })),
      { initialProps: { epoch: 1 } },
    );
    const oldLease = result.current[1];

    act(() => oldLease.publish(() => ({ selection: 'source-a' })));
    expect(result.current[0].selection).toBe('source-a');

    rerender({ epoch: 2 });
    expect(result.current[0].selection).toBeNull();
    expect(oldLease.signal.aborted).toBe(true);
    expect(oldLease.publish(() => ({ selection: 'source-old' }))).toBe(false);
    expect(result.current[0].selection).toBeNull();
  });
});
