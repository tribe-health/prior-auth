import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { VerifiedSession } from '@/shared/model/session';

const SESSION: VerifiedSession = {
  identityId: 'identity-1',
  sessionId: 'session-1',
  userId: 'user-1',
  practiceId: 'practice-1',
  displayName: 'Synthetic user',
  capabilities: [],
  principal: 'user',
  expiresAt: '2099-01-01T00:00:00Z',
  authorizationRevision: 'membership:1',
};

vi.mock('@/app/providers/session-provider', () => ({
  useRequiredSession: () => SESSION,
  useSessionEpoch: () => 7,
}));

import { useCaseQueueView } from './use-case-queue-view';

describe('case queue scoped view state', () => {
  it('keeps filter and selection independent across two mounted views', () => {
    const first = renderHook(() => useCaseQueueView());
    const second = renderHook(() => useCaseQueueView());

    act(() => {
      first.result.current.setSearch('SYNTHETIC-001');
      first.result.current.setStatusFilter('intake');
      first.result.current.selectCase('case-1');
    });

    expect(first.result.current.state).toEqual({
      search: 'SYNTHETIC-001',
      statusFilter: 'intake',
      selectedCaseId: 'case-1',
    });
    expect(second.result.current.state).toEqual({
      search: '',
      statusFilter: 'all',
      selectedCaseId: null,
    });

    act(() => second.result.current.selectCase('case-2'));
    expect(first.result.current.state.selectedCaseId).toBe('case-1');
    expect(second.result.current.state.selectedCaseId).toBe('case-2');
  });
});
