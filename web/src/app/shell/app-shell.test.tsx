import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';

const { gateState } = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  let status: 'pending' | 'unavailable' | 'not-affirmed' | 'affirmed' = 'affirmed';
  return {
    gateState: {
      get: () => status,
      set: (next: typeof status) => {
        status = next;
        for (const listener of listeners) listener();
      },
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
  };
});

vi.mock('@/app/navigation/use-committed-case-gate', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    useCommittedCaseGate: () => {
      const status = useSyncExternalStore(gateState.subscribe, gateState.get, gateState.get);
      return status === 'affirmed' ? { status, affirmedAt: '2026-09-15T00:00:00Z' } : { status };
    },
  };
});

vi.mock('@/app/providers/session-provider', () => ({
  useRequiredSession: () => ({ practiceId: 'practice-1' }),
  useSession: () => ({ displayName: 'Test User', capabilities: [] }),
  useSessionActions: () => ({ logout: vi.fn() }),
}));

import { AppShell } from './app-shell';

beforeEach(() => gateState.set('affirmed'));
afterEach(cleanup);

describe('the active case route follows the committed gate', () => {
  it('unmounts gated content immediately when affirmation is revoked', () => {
    render(
      <MemoryRouter initialEntries={['/cases/case-1/letter']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/cases/:caseId/letter" element={<div>Protected letter content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Protected letter content')).toBeTruthy();

    act(() => gateState.set('not-affirmed'));

    expect(screen.queryByText('Protected letter content')).toBeNull();
    expect(screen.getByRole('alert').textContent).toContain('Awaiting surgeon affirmation');
  });
});
