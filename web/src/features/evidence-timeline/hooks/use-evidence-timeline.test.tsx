import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../../shared/api/http-client';
import { resetRuntimeCommandRegistryForTests } from '../../../shared/runtime-command-registry';
import { readTimeline, timelineApi } from '../api/timeline-api';
import type { ReassessEvidenceResult, TimelineEntry } from '../model/timeline-entry';
import { useEvidenceTimeline } from './use-evidence-timeline';

const { localStore } = vi.hoisted(() => ({ localStore: {} }));

vi.mock('../../../app/providers/graph-provider', () => ({
  useLocalStore: () => localStore,
}));

vi.mock('../api/timeline-api', () => ({
  readTimeline: vi.fn(),
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
  resetRuntimeCommandRegistryForTests();
  vi.resetAllMocks();
  vi.mocked(readTimeline).mockResolvedValue([entry]);
});
afterEach(() => {
  cleanup();
  resetRuntimeCommandRegistryForTests();
});

describe('evidence reassessment command reconciliation', () => {
  it('sends the selected secondary practice for reassessment and command lookup', async () => {
    const { result } = renderHook(() =>
      useEvidenceTimeline(caseId, { practiceId: secondaryPracticeId }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => result.current.reassess(entryId, 'gap'));
    const commandId = vi.mocked(timelineApi.reassess).mock.calls[0]![2];
    expect(timelineApi.reassess).toHaveBeenCalledWith(
      caseId,
      entryId,
      commandId,
      'gap',
      assessedAt,
      secondaryPracticeId,
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
      secondaryPracticeId,
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
      undefined,
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
      await expect(result.current.lookupCommand(entryId, commandId)).resolves.toEqual(receipt);
    });
    expect(timelineApi.lookupCommand).toHaveBeenCalledWith(caseId, entryId, commandId, undefined);
    expect(timelineApi.reassess).toHaveBeenCalledTimes(1);
    expect(result.current.entries[0]?.state).toBe('void');
    expect(result.current.lastCommandId).toBeNull();
    expect(result.current.submitting).toBe(false);
  });

  it('clears command correlation after a definitive successful response', async () => {
    const { result } = renderHook(() => useEvidenceTimeline(caseId));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => result.current.reassess(entryId, 'gap'));

    expect(timelineApi.reassess).toHaveBeenCalledTimes(1);
    expect(result.current.lastCommandId).toBeNull();
    expect(result.current.refusal).toBeNull();
    expect(result.current.submitting).toBe(false);
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

  it('keeps an unresolved command in its practice while another practice is active', async () => {
    const { result, rerender } = renderHook(
      ({ selectedPractice }) => useEvidenceTimeline(caseId, { practiceId: selectedPractice }),
      { initialProps: { selectedPractice: practiceId } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    vi.mocked(timelineApi.reassess).mockRejectedValueOnce(
      new ApiError(503, 'Practice command response lost'),
    );
    await act(async () => {
      await expect(result.current.reassess(entryId, 'gap')).rejects.toMatchObject({ status: 503 });
    });
    const unresolvedId = result.current.lastCommandId;

    rerender({ selectedPractice: secondaryPracticeId });
    expect(result.current).toMatchObject({
      entries: [],
      loading: true,
      error: null,
      refusal: null,
      lastCommandId: null,
      submitting: false,
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => result.current.reassess(entryId, 'met'));
    expect(timelineApi.reassess).toHaveBeenLastCalledWith(
      caseId,
      entryId,
      expect.any(String),
      'met',
      assessedAt,
      secondaryPracticeId,
    );

    rerender({ selectedPractice: practiceId });
    expect(result.current.lastCommandId).toBe(unresolvedId);
    await expect(result.current.reassess(entryId, 'met')).rejects.toThrow(
      'The prior evidence reassessment outcome must be reconciled.',
    );
  });

  it('restores a late uncertain response after navigation unmounts and remounts the hook', async () => {
    const { result, unmount } = renderHook(() =>
      useEvidenceTimeline(caseId, { practiceId }));
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

    const reopened = renderHook(() => useEvidenceTimeline(caseId, { practiceId }));
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
      await reopened.result.current.lookupCommand(entryId, commandId);
    });
    expect(reopened.result.current.lastCommandId).toBeNull();
  });

  it('clears prior feedback and fences a late refusal after leaving and returning to a case', async () => {
    const nextCaseId = '44444444-4444-4444-8444-444444444444';
    vi.mocked(readTimeline).mockImplementation(async (db, selectedCaseId) => {
      void db;
      return selectedCaseId === caseId ? [entry] : [];
    });
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
      loading: true,
      error: null,
      refusal: null,
      lastCommandId: null,
      submitting: false,
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
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
    expect(result.current.lastCommandId).toBeNull();
  });
});
