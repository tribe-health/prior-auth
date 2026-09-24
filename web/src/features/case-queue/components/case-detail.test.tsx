import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router';

const projection = vi.hoisted(() => vi.fn());
const coverage = vi.hoisted(() => vi.fn());

vi.mock('../hooks/use-case-projection', () => ({ useCaseDetailProjection: projection }));
vi.mock('@/features/administering-entity/hooks/use-administering-entity-resolution', () => ({
  useAdministeringEntityResolution: coverage,
}));
vi.mock('@/app/providers/session-provider', () => ({ useCan: () => true }));

import { CaseDetail } from './case-detail';

const caseRecord = {
  id: 'case-1', practiceId: 'practice-1', caseNumber: 'SYNTHETIC-001',
  patientId: 'patient-1', surgeonId: 'surgeon-1', coordinatorId: null,
  patientName: 'Synthetic Patient Example', surgeonName: 'Dr. Demo Surgeon',
  payerId: 'payer-1', payerName: 'Synthetic Health Plan', status: 'intake' as const, dateOfService: '2026-09-17',
  gateAffirmedAt: null, updatedAt: null, revision: 1,
};
const resolved = {
  caseId: 'case-1', entityId: 'entity-1', entityName: 'Synthetic Utilization Partner',
  criteriaSetKey: 'criteria-2026',
  submissionChannelKey: 'payer-portal', appealPathKey: 'standard-appeal',
  sourceDocumentId: 'document-1', validFrom: '2026-01-01', validTo: null,
  sourceDocumentName: 'Synthetic delegation source', sourceDocumentVersion: 1,
  sourceDocumentEffectiveDate: '2026-01-01',
  entityRevision: 1, planRevision: 1, enrollmentRevision: 1, ruleRevision: 1,
  state: 'resolved' as const, revision: 1, caseInputRevision: 1,
  resolvedAt: '2026-09-17T12:00:00Z',
};
const actions = { resolve: vi.fn(), reconcile: vi.fn(), reload: vi.fn() };

function LocationProbe() {
  const location = useLocation();
  return <p data-testid="location">{location.pathname}{location.search}</p>;
}

beforeEach(() => {
  vi.clearAllMocks();
  projection.mockReturnValue({ status: 'ready', case: caseRecord, error: null });
});
afterEach(cleanup);

describe('CaseDetail coverage gate', () => {
  it('shows the patient, payer company, and surgeon names', () => {
    coverage.mockReturnValue({
      view: { status: 'ready', resolution: resolved, message: null, pendingCommandId: null },
      blocked: false,
      ...actions,
    });
    render(<MemoryRouter><CaseDetail caseId="case-1" /></MemoryRouter>);

    expect(screen.getByText('Synthetic Patient Example')).toBeTruthy();
    expect(screen.getByText('Synthetic Health Plan')).toBeTruthy();
    expect(screen.getByText('Dr. Demo Surgeon')).toBeTruthy();
    expect(screen.queryByText('patient-1')).toBeNull();
  });

  it('replaces evidence navigation with a named lock until coverage is resolved', () => {
    coverage.mockReturnValue({
      view: { status: 'unresolved', resolution: null, message: null, pendingCommandId: null },
      blocked: true,
      ...actions,
    });
    const rendered = render(<MemoryRouter><CaseDetail caseId="case-1" /></MemoryRouter>);
    expect(screen.getByText('Evidence blocked').getAttribute('aria-disabled')).toBe('true');
    expect(screen.queryByRole('link', { name: /Open evidence/ })).toBeNull();

    coverage.mockReturnValue({
      view: { status: 'ready', resolution: resolved, message: null, pendingCommandId: null },
      blocked: false,
      ...actions,
    });
    rendered.rerender(<MemoryRouter><CaseDetail caseId="case-1" /></MemoryRouter>);
    expect(screen.getByRole('link', { name: /Open evidence/ }).getAttribute('href'))
      .toBe('/cases/case-1/evidence');
  });

  it('routes an incomplete case to intake with the first missing field selected', () => {
    coverage.mockReturnValue({
      view: { status: 'error', resolution: null, message: null, pendingCommandId: null },
      blocked: true,
      ...actions,
    });
    render(
      <MemoryRouter initialEntries={['/cases/case-1']}>
        <CaseDetail caseId="case-1" />
        <LocationProbe />
      </MemoryRouter>,
    );

    const options = coverage.mock.calls[0]?.[1] as { onInputsIncomplete: () => void };
    act(() => options.onInputsIncomplete());

    expect(screen.getByTestId('location').textContent)
      .toBe('/cases/case-1/intake?focus=resolution&notice=case_inputs_incomplete');
  });
});
