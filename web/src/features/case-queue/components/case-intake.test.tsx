import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';

const projection = vi.hoisted(() => vi.fn());
const detail = vi.hoisted(() => vi.fn());
const command = vi.hoisted(() => vi.fn());

vi.mock('../hooks/use-case-projection', () => ({ useCaseIntakeProjection: projection }));
vi.mock('../hooks/use-case-detail', () => ({ useCaseDetail: detail }));
vi.mock('../hooks/use-case-command', () => ({ useCaseCommand: command }));
vi.mock('@/app/providers/session-provider', () => ({ useCan: () => true }));
vi.mock('@/features/document-intake/components/document-intake', () => ({
  DocumentIntake: () => <div>Document intake mounted</div>,
}));

import { Component as IntakeChecklistRoute } from '@/app/routes/intake-checklist-route';

afterEach(cleanup);

describe('CaseIntake resolution input recovery', () => {
  it('renders the routed guidance and focuses the first missing input after loading case detail', () => {
    const caseSummary = {
      id: 'case-1', practiceId: 'practice-1', caseNumber: 'SYNTHETIC-001',
      patientId: 'patient-1', surgeonId: 'surgeon-1', coordinatorId: null,
      payerId: 'payer-1', status: 'intake' as const, dateOfService: '2026-09-17',
      gateAffirmedAt: null, updatedAt: null, revision: 1,
    };
    const caseInput = {
      caseNumber: 'SYNTHETIC-001', patientId: 'patient-1', surgeonId: 'surgeon-1',
      coordinatorId: null, facilityId: null, payerId: 'payer-1', memberId: 'member-1',
      dateOfService: '2026-09-17', procedureCode: '22840', planKey: null, data: {},
    };
    projection.mockReturnValue({ status: 'ready', case: caseSummary, error: null });
    detail.mockReturnValue({
      loading: false,
      error: null,
      record: {
        ...caseInput, ...caseSummary, statusRevision: 0,
        caseInputRevision: 1, documentSetRevision: 0,
      },
      draft: caseInput,
      updateDraft: vi.fn(),
      reload: vi.fn(),
    });
    command.mockReturnValue({
      pending: false,
      outcome: 'idle',
      message: null,
      canReconcile: false,
      reconcile: vi.fn(),
      update: vi.fn(),
      transition: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={[
        '/cases/case-1/intake?focus=resolution&notice=case_inputs_incomplete',
      ]}>
        <Routes>
          <Route path="/cases/:caseId/intake" element={<IntakeChecklistRoute />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText(
      'Complete the member, plan, procedure, and service date before continuing.',
    )).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText('Plan key'));
    expect(screen.getByText('Document intake mounted')).toBeTruthy();
  });
});
