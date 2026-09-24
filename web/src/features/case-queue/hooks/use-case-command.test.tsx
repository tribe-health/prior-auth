import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/shared/api/http-client';
import type { VerifiedSession } from '@/shared/model/session';
import { resetRuntimeCommandRegistryForTests } from '@/shared/runtime-command-registry';
import type { CaseInput } from '../model/case-command';
import type { CaseRecord } from '../model/case-record';

const SESSION: VerifiedSession = {
  identityId: 'identity-1',
  sessionId: 'session-1',
  userId: 'user-1',
  practiceId: 'practice-1',
  displayName: 'Synthetic Coordinator',
  capabilities: ['case:read', 'case_write'],
  principal: 'user',
  expiresAt: '2099-01-01T00:00:00Z',
  authorizationRevision: 'test:1',
};
const api = vi.hoisted(() => ({
  read: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  transition: vi.fn(),
  lookupCreate: vi.fn(),
  lookup: vi.fn(),
}));
const CASE_ID = '11111111-1111-4111-8111-111111111111';
const COMMAND_ID = '22222222-2222-4222-8222-222222222222';
const INPUT: CaseInput = {
  caseNumber: 'SYNTHETIC-001',
  patientId: 'patient-1',
  surgeonId: 'surgeon-1',
  coordinatorId: null,
  facilityId: null,
  payerId: 'payer-1',
  memberId: null,
  dateOfService: '2026-09-17',
  procedureCode: '22840',
  planKey: null,
  data: {},
};
const PROJECTED: CaseRecord = {
  id: CASE_ID,
  practiceId: 'practice-1',
  caseNumber: 'SYNTHETIC-001',
  patientId: 'patient-1',
  patientName: 'Synthetic Patient Example',
  surgeonId: 'surgeon-1',
  surgeonName: 'Dr. Demo Surgeon',
  coordinatorId: null,
  payerId: 'payer-1',
  payerName: 'Synthetic Health Plan',
  status: 'intake',
  dateOfService: '2026-09-17',
  gateAffirmedAt: null,
  updatedAt: null,
  revision: 1,
};
const DETAIL = {
  ...INPUT,
  id: CASE_ID,
  practiceId: 'practice-1',
  status: 'intake' as const,
  gateAffirmedAt: null,
  gateAffirmedBy: null,
  revision: 1,
  caseInputRevision: 1,
  statusRevision: 0,
  createdAt: '2026-09-17T11:00:00Z',
  updatedAt: null,
};

vi.mock('@/app/providers/session-provider', () => ({
  useRequiredSession: () => SESSION,
  useSessionEpoch: () => 3,
}));
vi.mock('../api/case-api', () => ({ caseApi: api }));

import { useCaseCommand } from './use-case-command';

beforeEach(() => {
  resetRuntimeCommandRegistryForTests();
  vi.clearAllMocks();
  api.read.mockResolvedValue(DETAIL);
  vi.spyOn(crypto, 'randomUUID').mockReturnValue(COMMAND_ID);
});
afterEach(() => {
  cleanup();
  resetRuntimeCommandRegistryForTests();
  vi.restoreAllMocks();
});

describe('case command hook', () => {
  it('waits for the committed graph row instead of publishing an optimistic case', async () => {
    api.create.mockResolvedValue({
      commandId: COMMAND_ID,
      action: 'create',
      caseId: CASE_ID,
      committedAt: '2026-09-17T12:00:00Z',
    });
    const { result, rerender } = renderHook(
      ({ projected }) => useCaseCommand(CASE_ID, projected),
      { initialProps: { projected: null as CaseRecord | null } },
    );

    await act(() => result.current.create(INPUT));

    expect(api.create).toHaveBeenCalledWith('practice-1', {
      commandId: COMMAND_ID,
      caseId: CASE_ID,
      input: INPUT,
    });
    expect(result.current.outcome).toBe('awaiting-projection');
    expect(result.current.pending).toBe(true);

    rerender({ projected: PROJECTED });
    await waitFor(() => expect(result.current.outcome).toBe('confirmed'));
    expect(result.current.pending).toBe(false);
  });

  it('retains an uncertain create command and reconciles it without resubmitting', async () => {
    api.create.mockRejectedValue(new ApiError(503, 'case_service_unavailable'));
    api.lookupCreate.mockResolvedValue({
      commandId: COMMAND_ID,
      action: 'create',
      caseId: CASE_ID,
      committedAt: '2026-09-17T12:00:00Z',
    });
    const { result, rerender } = renderHook(
      ({ projected }) => useCaseCommand(CASE_ID, projected),
      { initialProps: { projected: null as CaseRecord | null } },
    );

    await act(async () => {
      await expect(result.current.create(INPUT)).rejects.toMatchObject({ status: 503 });
    });
    expect(result.current.outcome).toBe('uncertain');
    expect(result.current.canReconcile).toBe(true);

    await act(() => result.current.reconcile());
    expect(api.lookupCreate).toHaveBeenCalledWith(COMMAND_ID, 'practice-1');
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(result.current.outcome).toBe('awaiting-projection');

    rerender({ projected: PROJECTED });
    await waitFor(() => expect(result.current.outcome).toBe('confirmed'));
  });

  it('surfaces a capability refusal and releases the command slot', async () => {
    api.create.mockRejectedValue(new ApiError(403, 'case_access_denied'));
    const { result } = renderHook(() => useCaseCommand(CASE_ID, null));

    await act(() => result.current.create(INPUT));

    expect(result.current.outcome).toBe('refused');
    expect(result.current.pending).toBe(false);
    expect(result.current.message).toContain('permission');
  });

  it('does not confirm an update when the authorized detail read has stale protected input', async () => {
    api.update.mockResolvedValue({
      commandId: COMMAND_ID,
      action: 'update',
      caseId: CASE_ID,
      committedAt: '2026-09-17T12:00:00Z',
    });
    api.read.mockResolvedValue({
      ...DETAIL,
      revision: 2,
      caseInputRevision: 2,
      updatedAt: '2026-09-17T12:00:00Z',
      memberId: 'stale-member',
    });
    const changed = { ...INPUT, memberId: 'committed-member' };
    const { result, rerender } = renderHook(
      ({ projected }) => useCaseCommand(CASE_ID, projected),
      { initialProps: { projected: PROJECTED as CaseRecord | null } },
    );

    await act(() => result.current.update(changed, 1));
    rerender({ projected: { ...PROJECTED, revision: 2 } });

    await waitFor(() => expect(result.current.outcome).toBe('conflict'));
    expect(api.read).toHaveBeenCalledWith(CASE_ID, 'practice-1');
    expect(result.current.message).toContain('current values');
  });

  it('retains the submitted transition target while reconciling an uncertain response', async () => {
    api.transition.mockRejectedValue(new ApiError(503, 'case_service_unavailable'));
    api.lookup.mockResolvedValue({
      commandId: COMMAND_ID,
      action: 'transition',
      caseId: CASE_ID,
      committedAt: '2026-09-17T12:00:00Z',
    });
    const { result, rerender } = renderHook(
      ({ projected }) => useCaseCommand(CASE_ID, projected),
      { initialProps: { projected: PROJECTED as CaseRecord | null } },
    );

    await act(async () => {
      await expect(result.current.transition('evidence', 0, 1)).rejects.toMatchObject({
        status: 503,
      });
    });
    rerender({ projected: { ...PROJECTED, status: 'evidence', revision: 2 } });

    await act(() => result.current.reconcile());
    await waitFor(() => expect(result.current.outcome).toBe('confirmed'));
    expect(api.lookup).toHaveBeenCalledWith(CASE_ID, COMMAND_ID, 'practice-1');
  });
});
