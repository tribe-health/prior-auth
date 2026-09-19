import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/shared/api/http-client';
import type { VerifiedSession } from '@/shared/model/session';
import type { CaseDetailRecord } from '@/features/case-queue/model/case-command';
import type { AdministeringEntityResolution } from '../model/administering-entity';

const SESSION: VerifiedSession = {
  identityId: 'identity-1', sessionId: 'session-1', userId: 'user-1',
  practiceId: 'practice-1', displayName: 'Synthetic Coordinator',
  capabilities: ['case:read', 'case_write', 'resolve_administering_entity'], principal: 'user',
  expiresAt: '2099-01-01T00:00:00Z', authorizationRevision: 'test:1',
};
const resolutionApi = vi.hoisted(() => ({ read: vi.fn(), resolve: vi.fn(), lookup: vi.fn() }));
const caseApi = vi.hoisted(() => ({ read: vi.fn() }));
const RESOLUTION: AdministeringEntityResolution = {
  caseId: 'case-1', entityId: 'entity-1',
  entityName: 'Synthetic Utilization Partner',
  criteriaSetKey: 'synthetic-lumbar-fusion-2026',
  submissionChannelKey: 'manual_synthetic', appealPathKey: 'synthetic-standard-appeal',
  sourceDocumentId: 'document-1', validFrom: '2026-01-01', validTo: null,
  sourceDocumentName: 'Synthetic delegation source', sourceDocumentVersion: 1,
  sourceDocumentEffectiveDate: '2026-01-01',
  entityRevision: 1, planRevision: 1, enrollmentRevision: 1, ruleRevision: 1,
  state: 'resolved', revision: 1, caseInputRevision: 3,
  resolvedAt: '2026-09-17T12:00:00Z',
};
const CASE = {
  id: 'case-1', practiceId: 'practice-1', caseNumber: 'SYNTHETIC-001',
  patientId: 'patient-1', surgeonId: 'surgeon-1', coordinatorId: null,
  facilityId: null, payerId: 'payer-1', memberId: 'member-1',
  dateOfService: '2026-09-17', procedureCode: '22840', planKey: 'synthetic-ppo',
  data: {}, status: 'intake', gateAffirmedAt: null, gateAffirmedBy: null,
  revision: 3, caseInputRevision: 3, statusRevision: 0, documentSetRevision: 0,
  createdAt: '2026-09-17T12:00:00Z', updatedAt: null,
} satisfies CaseDetailRecord;

vi.mock('@/app/providers/session-provider', () => ({
  useRequiredSession: () => SESSION,
  useSessionEpoch: () => 4,
}));
vi.mock('../api/administering-entity-api', () => ({ administeringEntityApi: resolutionApi }));
vi.mock('@/features/case-queue/api/case-api', () => ({ caseApi }));

import { useAdministeringEntityResolution } from './use-administering-entity-resolution';

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  resolutionApi.read.mockResolvedValue(RESOLUTION);
  caseApi.read.mockResolvedValue(CASE);
  resolutionApi.resolve.mockResolvedValue({
    commandId: 'command-1', caseId: 'case-1', state: 'resolved',
    resolutionRevision: 1, caseInputRevision: 3, committedAt: RESOLUTION.resolvedAt,
  });
});
afterEach(cleanup);

describe('administering-entity resolution view model', () => {
  it('reconstructs the durable resolution after a page remount', async () => {
    const first = renderHook(() => useAdministeringEntityResolution('case-1'));
    await waitFor(() => expect(first.result.current.view.resolution).toEqual(RESOLUTION));
    first.unmount();

    const parked = { ...RESOLUTION, entityId: null, criteriaSetKey: null,
      submissionChannelKey: null, appealPathKey: null, sourceDocumentId: null,
      validFrom: null, state: 'expired' as const, revision: 2 };
    resolutionApi.read.mockResolvedValue(parked);
    const second = renderHook(() => useAdministeringEntityResolution('case-1'));
    await waitFor(() => expect(second.result.current.view.resolution).toEqual(parked));
    expect(second.result.current.blocked).toBe(true);
    expect(resolutionApi.read).toHaveBeenCalledTimes(2);
  });

  it('reads the current case-input revision before resolving and publishes committed output', async () => {
    resolutionApi.read
      .mockRejectedValueOnce(new ApiError(404, 'resource_not_found'))
      .mockResolvedValue(RESOLUTION);
    const hook = renderHook(() => useAdministeringEntityResolution('case-1'));
    await waitFor(() => expect(hook.result.current.view.status).toBe('unresolved'));

    await act(async () => { await hook.result.current.resolve(); });

    expect(caseApi.read).toHaveBeenCalledWith('case-1', 'practice-1');
    expect(resolutionApi.resolve).toHaveBeenCalledWith(
      'case-1',
      'practice-1',
      expect.objectContaining({ expectedCaseInputRevision: 3 }),
    );
    expect(hook.result.current.view.resolution).toEqual(RESOLUTION);
    expect(hook.result.current.blocked).toBe(false);
  });

  it('retains the committed command ID when the post-commit reload fails', async () => {
    resolutionApi.read
      .mockRejectedValueOnce(new ApiError(404, 'resource_not_found'))
      .mockRejectedValueOnce(new Error('reload unavailable'));
    const hook = renderHook(() => useAdministeringEntityResolution('case-1'));
    await waitFor(() => expect(hook.result.current.view.status).toBe('unresolved'));

    await act(async () => { await hook.result.current.resolve(); });

    expect(hook.result.current.view).toMatchObject({
      status: 'uncertain',
      pendingCommandId: 'command-1',
    });
    expect(hook.result.current.blocked).toBe(true);
  });

  it('clears a committed command when its current row was invalidated before reload', async () => {
    resolutionApi.read
      .mockRejectedValueOnce(new ApiError(404, 'resource_not_found'))
      .mockRejectedValueOnce(new ApiError(404, 'resource_not_found'));
    const hook = renderHook(() => useAdministeringEntityResolution('case-1'));
    await waitFor(() => expect(hook.result.current.view.status).toBe('unresolved'));

    await act(async () => { await hook.result.current.resolve(); });

    expect(hook.result.current.view).toMatchObject({
      status: 'unresolved',
      pendingCommandId: null,
      message: 'The saved coverage path was invalidated. Resolve it again.',
    });
    expect(hook.result.current.blocked).toBe(true);
  });

  it('clears a reconciled command when its current row was invalidated', async () => {
    resolutionApi.read
      .mockResolvedValueOnce(RESOLUTION)
      .mockRejectedValueOnce(new ApiError(404, 'resource_not_found'));
    resolutionApi.resolve.mockRejectedValue(new ApiError(503, 'upstream_unavailable'));
    const hook = renderHook(() => useAdministeringEntityResolution('case-1'));
    await waitFor(() => expect(hook.result.current.view.status).toBe('ready'));
    await act(async () => { await hook.result.current.resolve(); });
    const commandId = hook.result.current.view.pendingCommandId;
    resolutionApi.lookup.mockResolvedValue({ commandId });

    await act(async () => { await hook.result.current.reconcile(); });

    expect(hook.result.current.view).toMatchObject({
      status: 'unresolved',
      pendingCommandId: null,
      message: 'The saved coverage path was invalidated. Resolve it again.',
    });
    expect(hook.result.current.blocked).toBe(true);
  });

  it('recovers an uncertain command ID after the view remounts', async () => {
    resolutionApi.read.mockRejectedValue(new ApiError(404, 'resource_not_found'));
    resolutionApi.resolve.mockRejectedValue(new ApiError(503, 'upstream_unavailable'));
    resolutionApi.lookup.mockRejectedValue(new Error('lookup unavailable'));
    const first = renderHook(() => useAdministeringEntityResolution('case-1'));
    await waitFor(() => expect(first.result.current.view.status).toBe('unresolved'));

    await act(async () => { await first.result.current.resolve(); });
    const commandId = resolutionApi.resolve.mock.calls[0]?.[2].commandId as string;
    expect(first.result.current.view).toMatchObject({
      status: 'uncertain', pendingCommandId: commandId,
    });
    first.unmount();

    const second = renderHook(() => useAdministeringEntityResolution('case-1'));
    await waitFor(() => expect(second.result.current.view).toMatchObject({
      status: 'uncertain', pendingCommandId: commandId,
    }));
  });

  it('checks an uncertain re-resolution before accepting an older committed row', async () => {
    resolutionApi.resolve.mockRejectedValue(new ApiError(503, 'upstream_unavailable'));
    const first = renderHook(() => useAdministeringEntityResolution('case-1'));
    await waitFor(() => expect(first.result.current.view.resolution).toEqual(RESOLUTION));
    await act(async () => { await first.result.current.resolve(); });
    const commandId = resolutionApi.resolve.mock.calls[0]?.[2].commandId as string;
    first.unmount();

    const updated = { ...RESOLUTION, revision: 2, resolvedAt: '2026-09-17T12:05:00Z' };
    resolutionApi.lookup.mockResolvedValue({ commandId });
    resolutionApi.read.mockResolvedValue(updated);
    const second = renderHook(() => useAdministeringEntityResolution('case-1'));
    await waitFor(() => expect(second.result.current.view.resolution).toEqual(updated));
    expect(resolutionApi.lookup).toHaveBeenCalledWith('case-1', commandId, 'practice-1');
    expect(resolutionApi.lookup.mock.invocationCallOrder[0])
      .toBeLessThan(resolutionApi.read.mock.invocationCallOrder.at(-1)!);
  });

  it('reissues the same command when lookup races a late commit', async () => {
    resolutionApi.resolve.mockRejectedValue(new ApiError(503, 'upstream_unavailable'));
    const first = renderHook(() => useAdministeringEntityResolution('case-1'));
    await waitFor(() => expect(first.result.current.view.resolution).toEqual(RESOLUTION));
    await act(async () => { await first.result.current.resolve(); });
    const commandId = resolutionApi.resolve.mock.calls[0]?.[2].commandId as string;
    first.unmount();

    resolutionApi.lookup.mockRejectedValue(new ApiError(404, 'resource_not_found'));
    const updated = { ...RESOLUTION, revision: 2, resolvedAt: '2026-09-17T12:05:00Z' };
    resolutionApi.resolve.mockImplementation(
      (_caseId, _practiceId, mutation: { commandId: string }) => Promise.resolve({
        commandId: mutation.commandId,
        caseId: 'case-1',
        state: 'resolved',
        resolutionRevision: 2,
        caseInputRevision: 3,
        committedAt: updated.resolvedAt,
      }),
    );
    resolutionApi.read.mockResolvedValue(updated);
    const second = renderHook(() => useAdministeringEntityResolution('case-1'));
    await waitFor(() => expect(second.result.current.view.resolution).toEqual(updated));
    expect(resolutionApi.resolve).toHaveBeenLastCalledWith(
      'case-1',
      'practice-1',
      { commandId, expectedCaseInputRevision: 3 },
    );
    const lookupOrder = resolutionApi.lookup.mock.invocationCallOrder.at(-1)!;
    const retryOrder = resolutionApi.resolve.mock.invocationCallOrder.at(-1)!;
    const readOrder = resolutionApi.read.mock.invocationCallOrder.at(-1)!;
    expect(lookupOrder).toBeLessThan(retryOrder);
    expect(retryOrder).toBeLessThan(readOrder);
    expect(second.result.current.view.pendingCommandId).toBeNull();
  });

  it('does not retain a command when the case read fails before dispatch', async () => {
    resolutionApi.read
      .mockRejectedValueOnce(new ApiError(404, 'resource_not_found'))
      .mockRejectedValueOnce(new ApiError(404, 'resource_not_found'))
      .mockResolvedValue(RESOLUTION);
    caseApi.read
      .mockRejectedValueOnce(new ApiError(503, 'upstream_unavailable'))
      .mockResolvedValue(CASE);

    const first = renderHook(() => useAdministeringEntityResolution('case-1'));
    await waitFor(() => expect(first.result.current.view.status).toBe('unresolved'));
    await act(async () => { await first.result.current.resolve(); });
    expect(first.result.current.view).toMatchObject({
      status: 'error', pendingCommandId: null,
    });
    expect(resolutionApi.resolve).not.toHaveBeenCalled();
    first.unmount();

    const second = renderHook(() => useAdministeringEntityResolution('case-1'));
    await waitFor(() => expect(second.result.current.view.status).toBe('unresolved'));
    await act(async () => { await second.result.current.resolve(); });
    await waitFor(() => expect(second.result.current.view.resolution).toEqual(RESOLUTION));
    expect(resolutionApi.lookup).not.toHaveBeenCalled();
    expect(resolutionApi.resolve).toHaveBeenCalledOnce();
  });

  it('clears a stale absent command and permits a fresh resolution', async () => {
    resolutionApi.resolve
      .mockRejectedValueOnce(new ApiError(503, 'upstream_unavailable'))
      .mockRejectedValueOnce(new ApiError(409, 'stale_revision', 'stale_revision'))
      .mockResolvedValue({
        commandId: 'fresh-command', caseId: 'case-1', state: 'resolved',
        resolutionRevision: 3, caseInputRevision: 4,
        committedAt: '2026-09-17T12:10:00Z',
      });
    caseApi.read
      .mockResolvedValueOnce(CASE)
      .mockResolvedValue({ ...CASE, caseInputRevision: 4 });
    const updated = {
      ...RESOLUTION, revision: 3, caseInputRevision: 4,
      resolvedAt: '2026-09-17T12:10:00Z',
    };
    resolutionApi.read
      .mockResolvedValueOnce(RESOLUTION)
      .mockRejectedValueOnce(new ApiError(404, 'resource_not_found'))
      .mockResolvedValue(updated);

    const first = renderHook(() => useAdministeringEntityResolution('case-1'));
    await waitFor(() => expect(first.result.current.view.resolution).toEqual(RESOLUTION));
    await act(async () => { await first.result.current.resolve(); });
    const staleCommandId = resolutionApi.resolve.mock.calls[0]?.[2].commandId as string;
    first.unmount();

    resolutionApi.lookup.mockRejectedValue(new ApiError(404, 'resource_not_found'));
    const second = renderHook(() => useAdministeringEntityResolution('case-1'));
    await waitFor(() => expect(second.result.current.view).toMatchObject({
      status: 'unresolved', pendingCommandId: null,
    }));

    await act(async () => { await second.result.current.resolve(); });
    await waitFor(() => expect(second.result.current.view.resolution).toEqual(updated));
    const freshMutation = resolutionApi.resolve.mock.calls.at(-1)?.[2];
    expect(freshMutation).toMatchObject({ expectedCaseInputRevision: 4 });
    expect(freshMutation.commandId).not.toBe(staleCommandId);
  });

  it('clears an absent command when the serialized retry finds incomplete inputs', async () => {
    const onInputsIncomplete = vi.fn();
    resolutionApi.resolve
      .mockRejectedValueOnce(new ApiError(503, 'upstream_unavailable'))
      .mockRejectedValueOnce(new ApiError(422, 'case_inputs_incomplete', 'case_inputs_incomplete'));
    resolutionApi.read
      .mockResolvedValueOnce(RESOLUTION)
      .mockRejectedValueOnce(new ApiError(404, 'resource_not_found'));

    const first = renderHook(() => useAdministeringEntityResolution('case-1'));
    await waitFor(() => expect(first.result.current.view.resolution).toEqual(RESOLUTION));
    await act(async () => { await first.result.current.resolve(); });
    first.unmount();

    resolutionApi.lookup.mockRejectedValue(new ApiError(404, 'resource_not_found'));
    const second = renderHook(() => useAdministeringEntityResolution(
      'case-1',
      { onInputsIncomplete },
    ));
    await waitFor(() => expect(second.result.current.view).toMatchObject({
      status: 'unresolved',
      pendingCommandId: null,
      message: 'Complete the member, plan, procedure, and service date before continuing.',
    }));
    expect(onInputsIncomplete).toHaveBeenCalledOnce();
  });

  it('preserves incomplete-input guidance after checking a saved command', async () => {
    const onInputsIncomplete = vi.fn();
    resolutionApi.read
      .mockRejectedValueOnce(new ApiError(404, 'resource_not_found'))
      .mockRejectedValueOnce(new ApiError(404, 'resource_not_found'));
    resolutionApi.resolve
      .mockRejectedValueOnce(new ApiError(503, 'upstream_unavailable'))
      .mockRejectedValueOnce(new ApiError(422, 'case_inputs_incomplete', 'case_inputs_incomplete'));
    const hook = renderHook(() => useAdministeringEntityResolution(
      'case-1',
      { onInputsIncomplete },
    ));
    await waitFor(() => expect(hook.result.current.view.status).toBe('unresolved'));
    await act(async () => { await hook.result.current.resolve(); });
    await waitFor(() => expect(hook.result.current.view.status).toBe('uncertain'));

    resolutionApi.lookup.mockRejectedValue(new ApiError(404, 'resource_not_found'));
    await act(async () => { await hook.result.current.reconcile(); });
    expect(hook.result.current.view).toMatchObject({
      status: 'unresolved',
      pendingCommandId: null,
      message: 'Complete the member, plan, procedure, and service date before continuing.',
    });
    expect(onInputsIncomplete).toHaveBeenCalledOnce();
  });
});
