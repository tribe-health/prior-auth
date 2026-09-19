import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

const selectCase = vi.hoisted(() => vi.fn());

vi.mock('@/app/providers/session-provider', () => ({ useCan: () => true }));
vi.mock('../hooks/use-case-projection', () => ({
  useCaseQueueProjection: () => ({
    status: 'ready',
    error: null,
    cases: [{
      id: 'case-1', practiceId: 'practice-1', caseNumber: 'SYNTHETIC-001',
      patientId: 'patient-1', surgeonId: 'surgeon-1', coordinatorId: null,
      payerId: 'payer-1', status: 'intake', dateOfService: '2026-09-17',
      gateAffirmedAt: null, updatedAt: null, revision: 1,
    }],
  }),
}));
vi.mock('../hooks/use-case-queue-view', () => ({
  useCaseQueueView: () => ({
    state: { search: '', statusFilter: 'all', selectedCaseId: null },
    setSearch: vi.fn(), setStatusFilter: vi.fn(), selectCase, reset: vi.fn(),
  }),
}));
vi.mock('../hooks/use-case-command', () => ({
  useCaseCommand: () => ({
    outcome: 'idle', message: null, pending: false, canReconcile: false,
    create: vi.fn(), update: vi.fn(), transition: vi.fn(), reconcile: vi.fn(),
  }),
}));

import { CaseQueue } from './case-queue';

describe('case queue surface', () => {
  it('renders committed identifiers and opens the responsive create form', () => {
    render(<MemoryRouter><CaseQueue /></MemoryRouter>);

    expect(screen.getByRole('heading', { name: 'Cases' })).toBeTruthy();
    expect(screen.getByText('SYNTHETIC-001')).toBeTruthy();
    expect(screen.getByRole('link', { name: /open case/i }).getAttribute('href')).toBe('/cases/case-1');

    fireEvent.click(screen.getByRole('button', { name: /new case/i }));
    expect(screen.getByRole('form', { name: 'Case intake form' })).toBeTruthy();
    expect(screen.getByLabelText('Case number')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create case' })).toBeTruthy();
  });
});
