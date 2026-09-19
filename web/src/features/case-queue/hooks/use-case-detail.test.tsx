import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { VerifiedSession } from '@/shared/model/session';
import type { CaseDetailRecord } from '../model/case-command';

const SESSION: VerifiedSession = {
  identityId: 'identity-1', sessionId: 'session-1', userId: 'user-1',
  practiceId: 'practice-1', displayName: 'Synthetic Coordinator',
  capabilities: ['case:read', 'case_write'], principal: 'user',
  expiresAt: '2099-01-01T00:00:00Z', authorizationRevision: 'test:1',
};
const api = vi.hoisted(() => ({ read: vi.fn() }));
const RECORD: CaseDetailRecord = {
  id: 'case-1', practiceId: 'practice-1', caseNumber: 'SYNTHETIC-001',
  patientId: 'patient-1', surgeonId: 'surgeon-1', coordinatorId: null,
  facilityId: null, payerId: 'payer-1', memberId: null,
  dateOfService: '2026-09-17', procedureCode: '22840', planKey: null,
  data: {}, status: 'intake', gateAffirmedAt: null, gateAffirmedBy: null,
  revision: 1, caseInputRevision: 1, statusRevision: 0, documentSetRevision: 0,
  createdAt: '2026-09-17T12:00:00Z', updatedAt: null,
};

vi.mock('@/app/providers/session-provider', () => ({
  useRequiredSession: () => SESSION,
  useSessionEpoch: () => 4,
}));
vi.mock('../api/case-api', () => ({ caseApi: api }));

import { useCaseDetail } from './use-case-detail';

beforeEach(() => {
  vi.clearAllMocks();
  api.read.mockResolvedValue(RECORD);
});
afterEach(cleanup);

describe('case detail read model', () => {
  it('reloads committed server data after reconstruction instead of restoring a durable client copy', async () => {
    const first = renderHook(() => useCaseDetail('case-1', 1));
    await waitFor(() => expect(first.result.current.record).toEqual(RECORD));
    first.unmount();

    const updated = { ...RECORD, memberId: 'member-2', revision: 2, caseInputRevision: 2 };
    api.read.mockResolvedValue(updated);
    const second = renderHook(() => useCaseDetail('case-1', 2));
    await waitFor(() => expect(second.result.current.record).toEqual(updated));

    expect(api.read).toHaveBeenCalledTimes(2);
    expect(api.read).toHaveBeenLastCalledWith('case-1', 'practice-1');
    expect(second.result.current.draft?.memberId).toBe('member-2');
  });
});
