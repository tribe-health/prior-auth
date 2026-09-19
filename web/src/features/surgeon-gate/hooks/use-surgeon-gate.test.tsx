import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, httpClient } from '../../../shared/api/http-client';
import { resetRuntimeCommandRegistryForTests } from '../../../shared/runtime-command-registry';
import type { GateCommandResult, GateSnapshot } from '../model/gate-state';
import { useSurgeonGate } from './use-surgeon-gate';

const { sessionEpoch } = vi.hoisted(() => ({ sessionEpoch: { value: 0 } }));

vi.mock('../../../shared/api/http-client', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../shared/api/http-client')>(),
  httpClient: { get: vi.fn(), post: vi.fn() },
}));

vi.mock('../../../app/providers/session-provider', () => ({
  useSession: () => null,
  useSessionEpoch: () => sessionEpoch.value,
}));

const caseId = '11111111-1111-4111-8111-111111111111';
const practiceId = '22222222-2222-4222-8222-222222222222';
const secondaryPracticeId = '44444444-4444-4444-8444-444444444444';
const snapshot: GateSnapshot = {
  caseId,
  affirmed: ['policy', 'section', 'pathway', 'plan'],
  gateAffirmedAt: '2026-09-06T12:00:00Z',
  gateAffirmedBy: '33333333-3333-4333-8333-333333333333',
};

function receipt(commandId: string, action: 'affirm' | 'remove' = 'affirm'): GateCommandResult {
  return {
    commandId,
    caseId,
    kind: 'plan',
    action,
    gate: action === 'affirm' ? snapshot : {
      ...snapshot,
      affirmed: ['policy', 'section', 'pathway'],
      gateAffirmedAt: null,
      gateAffirmedBy: null,
    },
    committedAt: '2026-09-06T12:00:00Z',
  };
}

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
  resetRuntimeCommandRegistryForTests();
  vi.resetAllMocks();
  vi.mocked(httpClient.get).mockResolvedValue(snapshot);
});
afterEach(() => {
  cleanup();
  resetRuntimeCommandRegistryForTests();
});

describe('the surgeon gate uses authenticated command DTOs', () => {
  it('adapts snapshots and mutation receipts while sending only kind and a fresh command ID', async () => {
    const { result } = renderHook(() => useSurgeonGate(caseId, { practiceId }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(httpClient.get).toHaveBeenCalledWith(`/api/cases/${caseId}/gate?practiceId=${practiceId}`);
    expect(result.current.state).toEqual({ affirmed: true, outstanding: [] });

    vi.mocked(httpClient.post).mockImplementation(async (_path, body) =>
      receipt((body as { commandId: string }).commandId, 'remove'));
    await act(async () => result.current.remove('plan'));
    const removalId = (vi.mocked(httpClient.post).mock.calls[0]![1] as { commandId: string })
      .commandId;
    expect(removalId).toMatch(/^[0-9a-f-]{36}$/);
    expect(httpClient.post).toHaveBeenLastCalledWith(
      `/api/cases/${caseId}/gate/remove?practiceId=${practiceId}`,
      { commandId: removalId, kind: 'plan' },
    );
    expect(result.current.state).toEqual({ affirmed: false, outstanding: ['plan'] });
    expect(result.current.lastCommandId).toBeNull();
    expect(result.current.submitting).toBe(false);

    vi.mocked(httpClient.post).mockImplementation(async (_path, body) =>
      receipt((body as { commandId: string }).commandId));
    await act(async () => result.current.affirm('plan'));
    const affirmationId = (vi.mocked(httpClient.post).mock.calls[1]![1] as { commandId: string })
      .commandId;
    expect(affirmationId).not.toBe(removalId);
    expect(httpClient.post).toHaveBeenLastCalledWith(
      `/api/cases/${caseId}/gate/affirm?practiceId=${practiceId}`,
      { commandId: affirmationId, kind: 'plan' },
    );
    expect(result.current.state).toEqual({ affirmed: true, outstanding: [] });
    expect(httpClient.post).toHaveBeenCalledTimes(2);
    expect(result.current.lastCommandId).toBeNull();
    expect(result.current.submitting).toBe(false);
  });

  it('retains an uncertain command for explicit lookup without retrying the write', async () => {
    const { result } = renderHook(() => useSurgeonGate(caseId));
    await waitFor(() => expect(result.current.loading).toBe(false));
    vi.mocked(httpClient.post).mockRejectedValue(new Error('Response lost'));

    await act(async () => {
      await expect(result.current.remove('plan')).rejects.toThrow('Response lost');
    });
    const commandId = result.current.lastCommandId!;
    expect(commandId).toMatch(/^[0-9a-f-]{36}$/);
    expect(httpClient.post).toHaveBeenCalledTimes(1);
    expect(result.current.state).toEqual({ affirmed: true, outstanding: [] });

    const committed = receipt(commandId, 'remove');
    const current: GateSnapshot = { ...committed.gate, affirmed: ['policy', 'pathway'] };
    vi.mocked(httpClient.get).mockResolvedValueOnce(committed).mockResolvedValueOnce(current);
    await act(async () => {
      await expect(result.current.lookupCommand(commandId)).resolves.toEqual(committed);
    });
    expect(httpClient.get).toHaveBeenNthCalledWith(2,
      `/api/cases/${caseId}/gate/commands/${commandId}`,
    );
    expect(httpClient.get).toHaveBeenLastCalledWith(`/api/cases/${caseId}/gate`);
    expect(result.current.state).toEqual({ affirmed: false, outstanding: ['section', 'plan'] });
    expect(httpClient.post).toHaveBeenCalledTimes(1);
    expect(result.current.lastCommandId).toBeNull();
    expect(result.current.submitting).toBe(false);

    vi.mocked(httpClient.get).mockRejectedValue(new ApiError(404, 'Command not found'));
    await expect(result.current.lookupCommand(commandId)).rejects.toMatchObject({ status: 404 });
    expect(httpClient.post).toHaveBeenCalledTimes(1);
  });

  it('surfaces a refusal without converting the committed gate to an unaffirmed state', async () => {
    const { result } = renderHook(() => useSurgeonGate(caseId));
    await waitFor(() => expect(result.current.loading).toBe(false));
    vi.mocked(httpClient.post).mockRejectedValue(new ApiError(403, 'Gate access denied'));
    await act(async () => result.current.remove('plan'));
    expect(result.current.refusal).toBe('Gate access denied');
    expect(result.current.lastCommandId).toBeNull();
    expect(result.current.state).toEqual({ affirmed: true, outstanding: [] });
    expect(httpClient.post).toHaveBeenCalledTimes(1);
    expect(result.current.submitting).toBe(false);
  });

  it('retains command correlation when a gateway failure leaves commit outcome uncertain', async () => {
    const { result } = renderHook(() => useSurgeonGate(caseId));
    await waitFor(() => expect(result.current.loading).toBe(false));
    vi.mocked(httpClient.post).mockRejectedValue(
      new ApiError(502, 'Bad gateway after command submission'),
    );

    await act(async () => {
      await expect(result.current.remove('plan')).rejects.toMatchObject({ status: 502 });
    });
    expect(result.current.lastCommandId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.current.submitting).toBe(false);
    expect(result.current.refusal).toBeNull();
    expect(httpClient.post).toHaveBeenCalledTimes(1);
    await expect(result.current.affirm('plan')).rejects.toThrow(
      'The prior gate command outcome must be reconciled.',
    );
    expect(httpClient.post).toHaveBeenCalledTimes(1);
  });

  it('keeps an unresolved command in its practice while another practice is active', async () => {
    const { result, rerender } = renderHook(
      ({ selectedPractice }) => useSurgeonGate(caseId, { practiceId: selectedPractice }),
      { initialProps: { selectedPractice: practiceId } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    vi.mocked(httpClient.post).mockRejectedValueOnce(
      new ApiError(503, 'Practice command response lost'),
    );
    await act(async () => {
      await expect(result.current.remove('plan')).rejects.toMatchObject({ status: 503 });
    });
    const unresolvedId = result.current.lastCommandId;

    rerender({ selectedPractice: secondaryPracticeId });
    expect(result.current).toMatchObject({
      state: null,
      loading: true,
      error: null,
      refusal: null,
      lastCommandId: null,
      submitting: false,
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    vi.mocked(httpClient.post).mockImplementationOnce(async (_path, body) =>
      receipt((body as { commandId: string }).commandId, 'remove'));
    await act(async () => result.current.remove('plan'));
    expect(httpClient.post).toHaveBeenLastCalledWith(
      `/api/cases/${caseId}/gate/remove?practiceId=${secondaryPracticeId}`,
      expect.objectContaining({ kind: 'plan' }),
    );

    rerender({ selectedPractice: practiceId });
    expect(result.current.lastCommandId).toBe(unresolvedId);
    await expect(result.current.affirm('plan')).rejects.toThrow(
      'The prior gate command outcome must be reconciled.',
    );
  });

  it('restores a late uncertain response after navigation unmounts and remounts the hook', async () => {
    const { result, unmount } = renderHook(() => useSurgeonGate(caseId, { practiceId }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const pending = deferred<GateCommandResult>();
    vi.mocked(httpClient.post).mockReturnValueOnce(pending.promise);
    let mutation!: Promise<void>;
    act(() => {
      mutation = result.current.remove('plan');
    });

    unmount();
    await act(async () => {
      pending.reject(new Error('Response lost after navigation'));
      await expect(mutation).rejects.toThrow('Response lost after navigation');
    });

    const reopened = renderHook(() => useSurgeonGate(caseId, { practiceId }));
    await waitFor(() => expect(reopened.result.current.loading).toBe(false));
    const commandId = reopened.result.current.lastCommandId!;
    expect(commandId).toMatch(/^[0-9a-f-]{36}$/);
    await expect(reopened.result.current.affirm('plan')).rejects.toThrow(
      'The prior gate command outcome must be reconciled.',
    );
    expect(httpClient.post).toHaveBeenCalledTimes(1);

    const committed = receipt(commandId, 'remove');
    vi.mocked(httpClient.get).mockResolvedValueOnce(committed).mockResolvedValueOnce(committed.gate);
    await act(async () => {
      await reopened.result.current.lookupCommand(commandId);
    });
    expect(httpClient.get).toHaveBeenNthCalledWith(
      3,
      `/api/cases/${caseId}/gate/commands/${commandId}?practiceId=${practiceId}`,
    );
    expect(reopened.result.current.lastCommandId).toBeNull();
  });

  it.each(['case', 'practice'])('clears prior data and command feedback immediately on a %s switch', async (selection) => {
    const { result, rerender } = renderHook(
      ({ selectedCase, selectedPractice }) => useSurgeonGate(selectedCase, { practiceId: selectedPractice }),
      { initialProps: { selectedCase: caseId, selectedPractice: practiceId } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    vi.mocked(httpClient.post).mockRejectedValue(new ApiError(403, 'Old refusal'));
    await act(async () => result.current.remove('plan'));
    expect(result.current.refusal).toBe('Old refusal');
    expect(result.current.lastCommandId).toBeNull();
    const nextRead = deferred<GateSnapshot>();
    vi.mocked(httpClient.get).mockReturnValueOnce(nextRead.promise);
    rerender({
      selectedCase: selection === 'case' ? 'next-case' : caseId,
      selectedPractice: selection === 'practice' ? 'next-practice' : practiceId,
    });
    expect(result.current).toMatchObject({
      state: null, loading: true, error: null, refusal: null, lastCommandId: null,
      submitting: false,
    });
    await act(async () => nextRead.resolve(snapshot));
  });

  it.each(['case', 'practice'])('fences a late read after a %s switch', async (selection) => {
    const oldRead = deferred<GateSnapshot>();
    vi.mocked(httpClient.get).mockReturnValueOnce(oldRead.promise);
    const { result, rerender } = renderHook(
      ({ selectedCase, selectedPractice }) => useSurgeonGate(selectedCase, { practiceId: selectedPractice }),
      { initialProps: { selectedCase: caseId, selectedPractice: practiceId } },
    );
    vi.mocked(httpClient.get).mockResolvedValueOnce(receipt('synthetic', 'remove').gate);
    rerender({
      selectedCase: selection === 'case' ? 'next-case' : caseId,
      selectedPractice: selection === 'practice' ? 'next-practice' : practiceId,
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => oldRead.resolve(snapshot));
    expect(result.current.state).toEqual({ affirmed: false, outstanding: ['plan'] });
    expect(result.current.error).toBeNull();
  });

  it.each(['success', 'refusal'])('fences a late mutation %s after leaving and returning to a scope', async (outcome) => {
    const { result, rerender } = renderHook(
      ({ selectedPractice }) => useSurgeonGate(caseId, { practiceId: selectedPractice }),
      { initialProps: { selectedPractice: practiceId } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    const pending = deferred<GateCommandResult>();
    vi.mocked(httpClient.post).mockReturnValueOnce(pending.promise);
    let mutation!: Promise<void>;
    act(() => { mutation = result.current.remove('plan'); });
    rerender({ selectedPractice: 'next-practice' });
    await waitFor(() => expect(result.current.loading).toBe(false));
    rerender({ selectedPractice: practiceId });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      if (outcome === 'success') pending.resolve(receipt('synthetic', 'remove'));
      else pending.reject(new ApiError(403, 'Old refusal'));
      await mutation;
    });
    expect(result.current).toMatchObject({
      state: { affirmed: true, outstanding: [] }, error: null, refusal: null, lastCommandId: null,
      submitting: false,
    });
  });

  it.each(['receipt', 'refresh'])('fences a late lookup %s after a practice switch', async (stage) => {
    const { result, rerender } = renderHook(
      ({ selectedPractice }) => useSurgeonGate(caseId, { practiceId: selectedPractice }),
      { initialProps: { selectedPractice: practiceId } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    const pendingReceipt = deferred<GateCommandResult>();
    const pendingRead = deferred<GateSnapshot>();
    const committed = receipt('synthetic', 'remove');
    vi.mocked(httpClient.get).mockReturnValueOnce(pendingReceipt.promise);
    let lookup!: Promise<GateCommandResult>;
    act(() => { lookup = result.current.lookupCommand(committed.commandId); });
    if (stage === 'refresh') {
      vi.mocked(httpClient.get).mockReturnValueOnce(pendingRead.promise);
      await act(async () => pendingReceipt.resolve(committed));
    }
    rerender({ selectedPractice: 'next-practice' });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      if (stage === 'receipt') {
        vi.mocked(httpClient.get).mockResolvedValueOnce(committed.gate);
        pendingReceipt.resolve(committed);
      } else {
        pendingRead.resolve(committed.gate);
      }
      expect(await lookup).toEqual(committed);
    });
    expect(result.current).toMatchObject({
      state: { affirmed: true, outstanding: [] }, error: null, refusal: null, lastCommandId: null,
    });
  });

  it('clears a prior read error when the practice changes', async () => {
    vi.mocked(httpClient.get).mockRejectedValueOnce(new Error('Old read failed'));
    const { result, rerender } = renderHook(
      ({ selectedPractice }) => useSurgeonGate(caseId, { practiceId: selectedPractice }),
      { initialProps: { selectedPractice: practiceId } },
    );
    await waitFor(() => expect(result.current.error).toBe('Old read failed'));
    const nextRead = deferred<GateSnapshot>();
    vi.mocked(httpClient.get).mockReturnValueOnce(nextRead.promise);
    rerender({ selectedPractice: 'next-practice' });
    expect(result.current).toMatchObject({ state: null, error: null, loading: true });
    await act(async () => nextRead.resolve(snapshot));
  });

  it('clears prior authority state and fences a late read when the session epoch advances', async () => {
    const oldRead = deferred<GateSnapshot>();
    const currentSnapshot = receipt('synthetic', 'remove').gate;
    vi.mocked(httpClient.get)
      .mockReturnValueOnce(oldRead.promise)
      .mockResolvedValueOnce(currentSnapshot);
    const { result, rerender } = renderHook(
      ({ render }) => {
        void render;
        return useSurgeonGate(caseId, { practiceId });
      },
      { initialProps: { render: 0 } },
    );

    sessionEpoch.value = 1;
    rerender({ render: 1 });
    expect(result.current).toMatchObject({ state: null, loading: true, error: null });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.state).toEqual({ affirmed: false, outstanding: ['plan'] });

    await act(async () => oldRead.resolve(snapshot));
    expect(result.current.state).toEqual({ affirmed: false, outstanding: ['plan'] });
  });

  it('refuses a duplicate gate mutation while the first command is pending', async () => {
    const { result } = renderHook(() => useSurgeonGate(caseId));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const pending = deferred<GateCommandResult>();
    vi.mocked(httpClient.post).mockReturnValueOnce(pending.promise);

    let first!: Promise<void>;
    act(() => {
      first = result.current.remove('plan');
    });
    expect(result.current.submitting).toBe(true);
    expect(result.current.lastCommandId).toBeNull();
    await expect(result.current.affirm('plan')).rejects.toThrow('A gate command is already pending.');
    expect(httpClient.post).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve(receipt('55555555-5555-4555-8555-555555555555', 'remove'));
      await first;
    });
    expect(result.current.submitting).toBe(false);
    expect(result.current.lastCommandId).toBeNull();
  });
});
