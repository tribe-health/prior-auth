import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/providers/session-provider', () => ({ useCan: () => true }));

import { AdministeringEntityPanel } from './administering-entity-panel';

const resolution = {
  caseId: 'case-1', entityId: 'entity-1', entityName: 'Synthetic Utilization Partner',
  criteriaSetKey: 'criteria-2026',
  submissionChannelKey: 'payer-portal', appealPathKey: 'standard-appeal',
  sourceDocumentId: 'document-1', validFrom: '2026-01-01', validTo: null,
  sourceDocumentName: 'Synthetic delegation source', sourceDocumentVersion: 1,
  sourceDocumentEffectiveDate: '2026-01-01',
  entityRevision: 2, planRevision: 3, enrollmentRevision: 4, ruleRevision: 5,
  state: 'resolved' as const, revision: 1, caseInputRevision: 1,
  resolvedAt: '2026-09-17T12:00:00Z',
};

describe('AdministeringEntityPanel', () => {
  it('renders the resolved path as responsive fields and exposes refresh actions', () => {
    const onResolve = vi.fn();
    const onReload = vi.fn();
    render(<AdministeringEntityPanel
      view={{ status: 'ready', resolution, message: null, pendingCommandId: null }}
      onResolve={onResolve}
      onReconcile={vi.fn()}
      onReload={onReload}
    />);

    expect(screen.getByTestId('resolved-coverage-path').textContent).toContain('criteria-2026');
    expect(screen.getByTestId('resolved-coverage-path').textContent).toContain('Synthetic Utilization Partner');
    expect(screen.getByTestId('resolved-coverage-path').textContent).toContain('Synthetic delegation source');
    expect(screen.getByTestId('resolved-coverage-path').textContent).toContain('Version 1');
    expect(screen.getByTestId('resolved-coverage-path').textContent).toContain('Revision 2');
    expect(screen.getByTestId('resolved-coverage-path').textContent).toContain('Revision 3');
    expect(screen.getByTestId('resolved-coverage-path').textContent).toContain('Revision 4');
    expect(screen.getByTestId('resolved-coverage-path').textContent).toContain('Revision 5');
    expect(screen.getByTestId('resolved-coverage-path').textContent).toContain('payer-portal');
    fireEvent.click(screen.getByRole('button', { name: 'Resolve again' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reload committed result' }));
    expect(onResolve).toHaveBeenCalledOnce();
    expect(onReload).toHaveBeenCalledOnce();
  });

  it('labels the SQL valid-to boundary as exclusive', () => {
    render(<AdministeringEntityPanel
      view={{
        status: 'ready',
        resolution: { ...resolution, validTo: '2026-10-01' },
        message: null,
        pendingCommandId: null,
      }}
      onResolve={vi.fn()}
      onReconcile={vi.fn()}
      onReload={vi.fn()}
    />);
    expect(screen.getAllByText('Effective until (exclusive)').length).toBeGreaterThan(0);
    expect(screen.getAllByText('2026-10-01').length).toBeGreaterThan(0);
    expect(screen.queryByText('Effective through')).toBeNull();
  });

  it('names a parked state and states that downstream work is blocked', () => {
    render(<AdministeringEntityPanel
      view={{
        status: 'ready',
        resolution: { ...resolution, state: 'ambiguous', entityId: null,
          criteriaSetKey: null, submissionChannelKey: null, appealPathKey: null,
          sourceDocumentId: null, validFrom: null },
        message: null,
        pendingCommandId: null,
      }}
      onResolve={vi.fn()}
      onReconcile={vi.fn()}
      onReload={vi.fn()}
    />);
    expect(screen.getAllByText('More than one entity').length).toBeGreaterThan(0);
    expect(screen.getByText(/Downstream work remains blocked/)).toBeTruthy();
  });

  it('describes a missing active entity without calling the rule expired', () => {
    render(<AdministeringEntityPanel
      view={{
        status: 'ready',
        resolution: { ...resolution, state: 'missing', entityId: null,
          criteriaSetKey: null, submissionChannelKey: null, appealPathKey: null,
          sourceDocumentId: null, validFrom: null },
        message: null,
        pendingCommandId: null,
      }}
      onResolve={vi.fn()}
      onReconcile={vi.fn()}
      onReload={vi.fn()}
    />);
    expect(screen.getAllByText('No active matching path').length).toBeGreaterThan(0);
    expect(screen.getByText(/No active administering entity and delegation rule match/)).toBeTruthy();
    expect(screen.queryByText(/expired/)).toBeNull();
  });

  it.each(['plan', 'member enrollment'])('uses coverage-path wording when the %s ended first', () => {
    render(<AdministeringEntityPanel
      view={{
        status: 'ready',
        resolution: { ...resolution, state: 'expired', entityId: null,
          criteriaSetKey: null, submissionChannelKey: null, appealPathKey: null,
          sourceDocumentId: null, validFrom: null },
        message: null,
        pendingCommandId: null,
      }}
      onResolve={vi.fn()}
      onReconcile={vi.fn()}
      onReload={vi.fn()}
    />);
    expect(screen.getAllByText('Coverage path expired').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/matching coverage path exists/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/rule expired|rule exists|rule is not effective/i)).toBeNull();
  });
});
