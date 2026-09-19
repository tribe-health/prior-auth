import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../../shared/api/http-client';
import { resetRuntimeCommandRegistryForTests } from '../../../shared/runtime-command-registry';
import { timelineApi } from '../api/timeline-api';
import type { ReassessEvidenceResult, TimelineEntry } from '../model/timeline-entry';
import { useEvidenceTimeline } from './use-evidence-timeline';

type TestProjection = {
  status: 'pending' | 'ready' | 'error';
  entries: readonly TimelineEntry[];
  error: string | null;
};

const { projectionState, sessionEpoch, sessionState } = vi.hoisted(() => {
  const fallback: TestProjection = { status: 'pending', entries: [], error: null };
  let projections = new Map<string, TestProjection>();
  const listeners = new Set<() => void>();
  return {
    sessionEpoch: { value: 0 },
    sessionState: { value: {} as Record<string, unknown> },
    projectionState: {
      get: (caseId: string) => projections.get(caseId) ?? fallback,
      set: (caseId: string, projection: TestProjection) => {
        projections.set(caseId, projection);
        for (const listener of listeners) listener();
      },
      reset: () => {
        projections = new Map();
        for (const listener of listeners) listener();
      },
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
  };
});

vi.mock('./use-evidence-timeline-projection', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    useEvidenceTimelineProjection: (caseId: string) => useSyncExternalStore(
      projectionState.subscribe,
      () => projectionState.get(caseId),
      () => projectionState.get(caseId),
    ),
  };
});

vi.mock('../../../app/providers/session-provider', () => ({
  useRequiredSession: () => sessionState.value,
  useSessionEpoch: () => sessionEpoch.value,
}));

vi.mock('../api/timeline-api', () => ({
  timelineApi: { reassess: vi.fn(), lookupCommand: vi.fn() },
}));

const caseId = '11111111-1111-4111-8111-111111111111';
const entryId = '22222222-2222-4222-8222-222222222222';
const practiceId = '44444444-4444-4444-8444-444444444444';
const secondaryPracticeId = '55555555-5555-4555-8555-555555555555';
const assessedAt = '2026-09-07T01:00:00Z';
const entry: TimelineEntry = {
  id: entryId,
  caseId,
  policyCriterionId: '33333333-3333-4333-8333-333333333333',
  criterionLabel: null,
  state: 'void',
  assessedAt,
  citations: [],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  sessionEpoch.value = 0;
  sessionState.value = {
    identityId: '66666666-6666-4666-8666-666666666666',
    sessionId: '77777777-7777-4777-8777-777777777777',
    userId: '88888888-8888-4888-8888-888888888888',
    practiceId,
    displayName: 'Test Clinician',
    capabilities: ['annotate'],
    principal: 'user',
    expiresAt: '2026-09-08T01:00:00Z',
    authorizationRevision: '1',
  };
  resetRuntimeCommandRegistryForTests();
  vi.resetAllMocks();
  projectionState.reset();
  projectionState.set(caseId, { status: 'ready', entries: [entry], error: null });
  vi.mocked(timelineApi.reassess).mockImplementation(
    async (_caseId, _entryId, commandId, state, expectedAssessedAt) => ({
      commandId,
      caseId,
      evidenceId: entryId,
      previousState: entry.state,
      state,
      expectedAssessedAt,
      assessedAt: '2026-09-07T01:01:00Z',
    }),
  );
});
afterEach(() => {
  cleanup();
  resetRuntimeCommandRegistryForTests();
});

describe('evidence reassessment command reconciliation', () => {
  it('uses the verified session practice for reassessment and command lookup', async () => {
    const { result } = renderHook(() => useEvidenceTimeline(caseId));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => result.current.reassess(entryId, 'gap'));
    const commandId = vi.mocked(timelineApi.reassess).mock.calls[0]![2];
    expect(timelineApi.reassess).toHaveBeenCalledWith(
      caseId,
      entryId,
      commandId,
      'gap',
      assessedAt,
      practiceId,
      0,
    );

    const reconciled: ReassessEvidenceResult = {
      commandId,
      caseId,
      evidenceId: entryId,
      previousState: 'void',
      state: 'gap',
      expectedAssessedAt: assessedAt,
      assessedAt: '2026-09-07T01:01:00Z',
    };
    vi.mocked(timelineApi.lookupCommand).mockResolvedValue(reconciled);
    await act(async () => {
      await expect(result.current.lookupCommand(entryId, commandId)).resolves.toEqual(reconciled);
    });
    expect(timelineApi.lookupCommand).toHaveBeenCalledWith(
      caseId,
      entryId,
      commandId,
      practiceId,
      0,
    );
  });

  it('retains an uncertain command for lookup without replaying the write', async () => {
    const { result } = renderHook(() => useEvidenceTimeline(caseId));
    await waitFor(() => expect(result.current.loading).toBe(false));
    vi.mocked(timelineApi.reassess).mockRejectedValue(new Error('Response lost'));

    await act(async () => {
      await expect(result.current.reassess(entryId, 'gap')).rejects.toThrow('Response lost');
    });
    const commandId = result.current.lastCommandId!;
    expect(commandId).toMatch(/^[0-9a-f-]{36}$/);
    expect(timelineApi.reassess).toHaveBeenCalledWith(
      caseId,
      entryId,
      commandId,
      'gap',
      assessedAt,
      practiceId,
      0,
    );

    const receipt: ReassessEvidenceResult = {
      commandId,
      caseId,
      evidenceId: entryId,
      previousState: 'void',
      state: 'gap',
      expectedAssessedAt: assessedAt,
      assessedAt: '2026-09-07T01:01:00Z',
    };
    vi.mocked(timelineApi.lookupCommand).mockResolvedValue(receipt);
    await act(async () => {
      projectionState.set(caseId, {
        status: 'ready',
        entries: [{ ...entry, state: receipt.state, assessedAt: receipt.assessedAt }],
        error: null,
      });
      await expect(result.current.lookupCommand(entryId, commandId)).resolves.toEqual(receipt);
    });
    expect(timelineApi.lookupCommand).toHaveBeenCalledWith(
      caseId,
      entryId,
      commandId,
      practiceId,
      0,
    );
    expect(timelineApi.reassess).toHaveBeenCalledTimes(1);
    expect(result.current.entries[0]?.state).toBe('gap');
    expect(result.current.lastCommandId).toBeNull();
    expect(result.current.submitting).toBe(false);
  });

  it('retains command correlation after acceptance until the projection agrees', async () => {
    const { result } = renderHook(() => useEvidenceTimeline(caseId));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => result.current.reassess(entryId, 'gap'));

    expect(timelineApi.reassess).toHaveBeenCalledTimes(1);
    expect(result.current.lastCommandId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.current.refusal).toBeNull();
    expect(result.current.submitting).toBe(false);
    expect(result.current.awaitingProjection).toBe(true);
    expect(result.current.commandOutcome).toBe('awaiting-projection');
  });

  it('reports confirmation only after the evidence read model matches the receipt', async () => {
    const { result } = renderHook(() => useEvidenceTimeline(caseId));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => result.current.reassess(entryId, 'gap'));

    expect(result.current.awaitingProjection).toBe(true);
    act(() => projectionState.set(caseId, {
      status: 'ready',
      entries: [{
        ...entry,
        state: 'gap',
        assessedAt: '2026-09-07T01:01:00Z',
      }],
      error: null,
    }));
    await waitFor(() => expect(result.current.commandOutcome).toBe('confirmed'));
    expect(result.current.lastCommandId).toBeNull();
    expect(result.current.awaitingProjection).toBe(false);
    expect(result.current.commandOutcome).toBe('confirmed');
    expect(result.current.entries[0]).toMatchObject({
      state: 'gap',
      assessedAt: '2026-09-07T01:01:00Z',
    });
  });

  it('releases command ownership when a newer concurrent assessment wins', async () => {
    const { result } = renderHook(() => useEvidenceTimeline(caseId));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => result.current.reassess(entryId, 'gap'));
    expect(result.current.awaitingProjection).toBe(true);

    act(() => projectionState.set(caseId, {
      status: 'ready',
      entries: [{
        ...entry,
        state: 'met',
        assessedAt: '2026-09-07T01:02:00Z',
      }],
      error: null,
    }));

    await waitFor(() => expect(result.current.commandOutcome).toBe('conflict'));
    expect(result.current.lastCommandId).toBeNull();
    expect(result.current.awaitingProjection).toBe(false);
    expect(result.current.commandMessage).toBe(
      'The evidence changed again after this assessment was accepted. Review the current record.',
    );
  });

  it('clears command correlation when the server returns a definitive conflict', async () => {
    const { result } = renderHook(() => useEvidenceTimeline(caseId));
    await waitFor(() => expect(result.current.loading).toBe(false));
    vi.mocked(timelineApi.reassess).mockRejectedValue(
      new ApiError(409, 'Evidence assessment changed after review'),
    );

    await act(async () => result.current.reassess(entryId, 'gap'));
    expect(result.current.lastCommandId).toBeNull();
    expect(result.current.refusal).toBe('Evidence assessment changed after review');
    expect(result.current.submitting).toBe(false);
    expect(timelineApi.reassess).toHaveBeenCalledTimes(1);
  });

  it('retains command correlation when a gateway failure leaves commit outcome uncertain', async () => {
    const { result } = renderHook(() => useEvidenceTimeline(caseId));
    await waitFor(() => expect(result.current.loading).toBe(false));
    vi.mocked(timelineApi.reassess).mockRejectedValue(
      new ApiError(503, 'Gateway unavailable after command submission'),
    );

    await act(async () => {
      await expect(result.current.reassess(entryId, 'gap')).rejects.toMatchObject({ status: 503 });
    });
    expect(result.current.lastCommandId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.current.submitting).toBe(false);
    expect(result.current.refusal).toBeNull();
    expect(timelineApi.reassess).toHaveBeenCalledTimes(1);
    await expect(result.current.reassess(entryId, 'met')).rejects.toThrow(
      'The prior evidence reassessment outcome must be reconciled.',
    );
    expect(timelineApi.reassess).toHaveBeenCalledTimes(1);
  });

  it('fences an unresolved command when the verified session scope changes', async () => {
    const { result, rerender } = renderHook(({ render }) => {
      void render;
      return useEvidenceTimeline(caseId);
    }, { initialProps: { render: 0 } });
    await waitFor(() => expect(result.current.loading).toBe(false));
    vi.mocked(timelineApi.reassess).mockRejectedValueOnce(
      new ApiError(503, 'Practice command response lost'),
    );
    await act(async () => {
      await expect(result.current.reassess(entryId, 'gap')).rejects.toMatchObject({ status: 503 });
    });
    const unresolvedId = result.current.lastCommandId;

    sessionState.value = {
      ...sessionState.value,
      sessionId: '99999999-9999-4999-8999-999999999999',
      practiceId: secondaryPracticeId,
      authorizationRevision: '2',
    };
    sessionEpoch.value = 1;
    rerender({ render: 1 });
    expect(result.current).toMatchObject({
      entries: [entry],
      loading: false,
      error: null,
      refusal: null,
      lastCommandId: null,
      submitting: false,
    });
    await act(async () => result.current.reassess(entryId, 'met'));
    expect(timelineApi.reassess).toHaveBeenLastCalledWith(
      caseId,
      entryId,
      expect.any(String),
      'met',
      assessedAt,
      secondaryPracticeId,
      1,
    );
    expect(unresolvedId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('restores a late uncertain response after navigation unmounts and remounts the hook', async () => {
    const { result, unmount } = renderHook(() => useEvidenceTimeline(caseId));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const pending = deferred<ReassessEvidenceResult>();
    vi.mocked(timelineApi.reassess).mockReturnValueOnce(pending.promise);
    let mutation!: Promise<void>;
    act(() => {
      mutation = result.current.reassess(entryId, 'gap');
    });

    unmount();
    await act(async () => {
      pending.reject(new Error('Response lost after navigation'));
      await expect(mutation).rejects.toThrow('Response lost after navigation');
    });

    const reopened = renderHook(() => useEvidenceTimeline(caseId));
    await waitFor(() => expect(reopened.result.current.loading).toBe(false));
    const commandId = reopened.result.current.lastCommandId!;
    expect(commandId).toMatch(/^[0-9a-f-]{36}$/);
    await expect(reopened.result.current.reassess(entryId, 'met')).rejects.toThrow(
      'The prior evidence reassessment outcome must be reconciled.',
    );
    expect(timelineApi.reassess).toHaveBeenCalledTimes(1);

    const reconciled: ReassessEvidenceResult = {
      commandId,
      caseId,
      evidenceId: entryId,
      previousState: 'void',
      state: 'gap',
      expectedAssessedAt: assessedAt,
      assessedAt: '2026-09-07T01:01:00Z',
    };
    vi.mocked(timelineApi.lookupCommand).mockResolvedValue(reconciled);
    await act(async () => {
      projectionState.set(caseId, {
        status: 'ready',
        entries: [{ ...entry, state: reconciled.state, assessedAt: reconciled.assessedAt }],
        error: null,
      });
      await reopened.result.current.lookupCommand(entryId, commandId);
    });
    expect(reopened.result.current.lastCommandId).toBeNull();
  });

  it('clears prior feedback and fences a late refusal after leaving and returning to a case', async () => {
    const nextCaseId = '44444444-4444-4444-8444-444444444444';
    projectionState.set(nextCaseId, { status: 'ready', entries: [], error: null });
    const { result, rerender } = renderHook(
      ({ selectedCaseId }) => useEvidenceTimeline(selectedCaseId),
      { initialProps: { selectedCaseId: caseId } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    const pending = deferred<ReassessEvidenceResult>();
    vi.mocked(timelineApi.reassess).mockReturnValueOnce(pending.promise);
    let mutation!: Promise<void>;
    act(() => {
      mutation = result.current.reassess(entryId, 'gap');
    });
    expect(result.current.lastCommandId).toBeNull();
    expect(result.current.submitting).toBe(true);

    rerender({ selectedCaseId: nextCaseId });
    expect(result.current).toMatchObject({
      entries: [],
      loading: false,
      error: null,
      refusal: null,
      lastCommandId: null,
      submitting: false,
    });
    rerender({ selectedCaseId: caseId });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      pending.reject(new ApiError(403, 'Old case refusal'));
      await mutation;
    });
    expect(result.current.refusal).toBeNull();
    expect(result.current.lastCommandId).toBeNull();
    expect(result.current.entries).toEqual([entry]);
  });

  it('rebinds to the current graph projection when the session epoch advances', async () => {
    const currentEntry = { ...entry, state: 'met' as const };
    const { result, rerender } = renderHook(
      ({ render }) => {
        void render;
        return useEvidenceTimeline(caseId);
      },
      { initialProps: { render: 0 } },
    );

    projectionState.set(caseId, { status: 'ready', entries: [currentEntry], error: null });
    sessionEpoch.value = 1;
    rerender({ render: 1 });
    expect(result.current).toMatchObject({ loading: false, error: null });
    expect(result.current.entries).toEqual([currentEntry]);
  });

  it('refuses a duplicate reassessment while the first command is pending', async () => {
    const { result } = renderHook(() => useEvidenceTimeline(caseId));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const pending = deferred<ReassessEvidenceResult>();
    vi.mocked(timelineApi.reassess).mockReturnValueOnce(pending.promise);

    let first!: Promise<void>;
    act(() => {
      first = result.current.reassess(entryId, 'gap');
    });
    expect(result.current.submitting).toBe(true);
    await expect(result.current.reassess(entryId, 'met')).rejects.toThrow(
      'An evidence reassessment is already pending.',
    );
    expect(timelineApi.reassess).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve({
        commandId: '55555555-5555-4555-8555-555555555555',
        caseId,
        evidenceId: entryId,
        previousState: 'void',
        state: 'gap',
        expectedAssessedAt: assessedAt,
        assessedAt: '2026-09-07T01:01:00Z',
      });
      await first;
    });
    expect(result.current.submitting).toBe(false);
    expect(result.current.lastCommandId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.current.awaitingProjection).toBe(true);
  });
});
