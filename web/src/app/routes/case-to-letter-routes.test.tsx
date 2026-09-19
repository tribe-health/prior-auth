import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';

const evidenceAssembly = vi.hoisted(() => vi.fn());
const surgeonGate = vi.hoisted(() => vi.fn());
const gateReviewContext = vi.hoisted(() => vi.fn());
const letterWorkflow = vi.hoisted(() => vi.fn());
const capabilities = vi.hoisted(() => new Set<string>());

vi.mock('@/app/providers/session-provider', () => ({
  useCan: (capability: string) => capabilities.has(capability),
  useRequiredSession: () => ({ practiceId: 'practice-1' }),
}));
vi.mock('@/features/evidence-assembly/hooks/use-evidence-assembly', () => ({
  useEvidenceAssembly: evidenceAssembly,
}));
vi.mock('@/features/source-preview/hooks/use-source-preview', () => ({
  useSourcePreview: () => ({
    state: { phase: 'closed' }, open: vi.fn(), close: vi.fn(), goToPage: vi.fn(),
  }),
}));
vi.mock('@/features/source-preview/components/source-preview', () => ({ SourcePreview: () => null }));
vi.mock('@/features/evidence-timeline/components/evidence-timeline', () => ({ EvidenceTimeline: () => null }));
vi.mock('@/features/surgeon-gate/hooks/use-surgeon-gate', () => ({ useSurgeonGate: surgeonGate }));
vi.mock('@/features/surgeon-gate/hooks/use-gate-review-context', () => ({ useGateReviewContext: gateReviewContext }));
vi.mock('@/features/letter-workflow/hooks/use-letter-workflow', () => ({ useLetterWorkflow: letterWorkflow }));
vi.mock('@/features/letter-signing/components/letter-signing-card', () => ({ LetterSigningCard: () => <p>Ready for signature</p> }));

import { Component as EvidenceRoute } from './evidence-timeline-route';
import { Component as LetterRoute } from './letter-composer-route';
import { Component as GateRoute } from './surgeon-gate-route';

const POLICY = {
  id: 'policy-1', payerId: 'payer-1', name: 'Lumbar fusion medical policy',
  policyNumber: 'SURG-2026-014', version: '4', effectiveFrom: '2026-01-01',
  effectiveTo: null, sourceDocumentId: 'document-1',
} as const;
const CRITERION = {
  id: 'criterion-1', payerId: 'payer-1', practiceId: null, evidenceGrade: 'published',
  policyId: 'policy-1', section: '4.1', ordinal: 1, documentId: 'document-1',
  sourcePageNumber: 1, label: 'Operative-level imaging',
  requirement: 'Imaging documents nerve root compression at the proposed operative level.',
  contentSha256: 'a'.repeat(64), procedureFamily: null, isMandatory: true,
  validFrom: '2026-01-01', validTo: null, supersededBy: null,
} as const;
const GATE_CONTEXT = {
  policy: {
    value: 'Lumbar fusion medical policy — SURG-2026-014, version 4; effective 2026-01-01',
    source: 'Criteria selection case-1:criteriaSelectionRevision:r1',
  },
  section: { value: 'Section 4.1', source: 'Criteria selection case-1:criteriaSelectionRevision:r1' },
  pathway: { value: 'Lumbar fusion', source: 'Criteria selection case-1:criteriaSelectionRevision:r1' },
  plan: { value: 'Procedure 22840', source: 'Case input revision 1' },
} as const;

function route(path: string, element: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="/cases/:caseId/*" element={element} /></Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  evidenceAssembly.mockReset();
  surgeonGate.mockReset();
  gateReviewContext.mockReset();
  letterWorkflow.mockReset();
  capabilities.clear();
  capabilities.add('affirm_gate');
  capabilities.add('letter_generate');
  capabilities.add('letter_review');
  capabilities.add('letter_approve');
  gateReviewContext.mockReturnValue({
    loading: false,
    error: null,
    context: GATE_CONTEXT,
  });
});
afterEach(cleanup);

describe('mounted case-to-letter web routes', () => {
  it('assembles one source-backed criterion from the evidence route', () => {
    const assemble = vi.fn();
    evidenceAssembly.mockReturnValue({
      view: {
        status: 'ready', message: null, documentSetRevision: 1,
        selection: {
          caseId: 'case-1', policy: POLICY, criteria: [CRITERION],
          resolutionRevision: 'case-1:resolutionRevision:r1',
          criteriaCatalogRevision: 'catalog:criteriaCatalogRevision:r1',
          criteriaSelectionRevision: 'case-1:criteriaSelectionRevision:r1',
          criteriaSnapshotId: 'snapshot-1', selectedBy: 'user-1',
          selectedAt: '2026-09-18T12:00:00Z', state: 'current',
        },
        evidence: {
          caseId: 'case-1', evidenceRevision: 'case-1:evidenceRevision:r0',
          evidenceWorkRevision: 'case-1:evidenceWorkRevision:r0', entries: [],
        },
      },
      documents: {
        status: 'ready', error: null, documents: [{
          id: 'document-1', caseId: 'case-1', documentTypeId: 'type-1',
          name: 'MRI report', effectiveDate: '2026-03-14', contentSha256: 'b'.repeat(64),
          pageCount: 3, processingStatus: 'ready', processingErrorCode: null,
          updatedAt: '2026-09-18T12:00:00Z', revision: 1,
        }],
      },
      assemble,
      reload: vi.fn(),
    });
    route('/cases/case-1/evidence', <EvidenceRoute />);

    expect((screen.getByRole('button', { name: 'Save evidence revision' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: /Met/ }));
    fireEvent.change(screen.getByLabelText('Source document'), { target: { value: 'document-1' } });
    fireEvent.change(screen.getByLabelText('Page'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Exact source quote'), { target: { value: 'Nerve root compression is present.' } });
    fireEvent.change(screen.getByLabelText('Assessment rationale'), { target: { value: 'The MRI documents the operative-level finding.' } });
    expect((screen.getByRole('button', { name: 'Save evidence revision' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Page'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save evidence revision' }));

    expect(assemble).toHaveBeenCalledOnce();
    expect(assemble.mock.calls[0][0][0]).toMatchObject({
      criterionId: 'criterion-1', expectedState: 'met', documentId: 'document-1', pageNumber: 1,
    });
  });

  it('keeps all four surgeon confirmations visible and actionable', () => {
    const affirm = vi.fn();
    surgeonGate.mockReturnValue({
      loading: false, error: null, refusal: null, submitting: false,
      state: { affirmed: [], outstanding: ['policy', 'section', 'pathway', 'plan'] },
      affirm, remove: vi.fn(), lookupCommand: vi.fn(), lastCommandId: null,
    });
    route('/cases/case-1/gate', <GateRoute />);

    expect(screen.getAllByRole('button', { name: /^Affirm / })).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: 'Affirm controlling policy' }));
    expect(affirm).toHaveBeenCalledWith('policy');
  });

  it('keeps clinical facts visible without exposing affirmation to unauthorized users', () => {
    capabilities.delete('affirm_gate');
    surgeonGate.mockReturnValue({
      loading: false, error: null, refusal: null, submitting: false,
      state: { affirmed: [], outstanding: ['policy', 'section', 'pathway', 'plan'] },
      affirm: vi.fn(), remove: vi.fn(), lookupCommand: vi.fn(), lastCommandId: null,
    });
    route('/cases/case-1/gate', <GateRoute />);

    expect(screen.getByText(/SURG-2026-014/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Affirm/ })).toBeNull();
    expect(screen.getByText(/reserved to the treating surgeon/)).toBeTruthy();
  });

  it('does not allow a surgeon to affirm a missing committed fact', () => {
    gateReviewContext.mockReturnValue({
      loading: false,
      error: null,
      context: { ...GATE_CONTEXT, plan: { value: null, source: 'Case input revision 1' } },
    });
    surgeonGate.mockReturnValue({
      loading: false, error: null, refusal: null, submitting: false,
      state: { affirmed: [], outstanding: ['policy', 'section', 'pathway', 'plan'] },
      affirm: vi.fn(), remove: vi.fn(), lookupCommand: vi.fn(), lastCommandId: null,
    });
    route('/cases/case-1/gate', <GateRoute />);

    expect(screen.getByText('Required information is not recorded.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Affirm operative plan' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('generates only when the committed prerequisites and gate are ready', () => {
    const generate = vi.fn();
    letterWorkflow.mockReturnValue({
      view: {
        phase: 'ready', letter: null, message: null,
        prerequisites: {
          resolutionRevision: 'case-1:resolutionRevision:r1',
          criteriaSelectionRevision: 'case-1:criteriaSelectionRevision:r1',
          evidenceRevision: 'case-1:evidenceRevision:r1', gateComplete: true,
        },
      },
      generate, review: vi.fn(), approve: vi.fn(), reload: vi.fn(),
    });
    route('/cases/case-1/letter', <LetterRoute />);

    expect(screen.getAllByText('Ready')).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: 'Generate cited draft' }));
    expect(generate).toHaveBeenCalledOnce();
  });

  it('does not generate when any committed prerequisite is missing', () => {
    letterWorkflow.mockReturnValue({
      view: {
        phase: 'ready', letter: null, message: null,
        prerequisites: {
          resolutionRevision: 'case-1:resolutionRevision:r1',
          criteriaSelectionRevision: '', evidenceRevision: 'case-1:evidenceRevision:r1', gateComplete: true,
        },
      },
      generate: vi.fn(), review: vi.fn(), approve: vi.fn(), reload: vi.fn(),
    });
    route('/cases/case-1/letter', <LetterRoute />);

    expect((screen.getByRole('button', { name: 'Generate cited draft' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText('Required')).toHaveLength(1);
  });

  it.each([
    ['draft', 'Confirm source review', 'review'],
    ['in_review', 'Approve current revision', 'approve'],
  ] as const)('exposes the %s letter action with its source citation', (status, label, action) => {
    const review = vi.fn();
    const approve = vi.fn();
    letterWorkflow.mockReturnValue({
      view: {
        phase: 'ready', prerequisites: null, message: null,
        letter: {
          id: 'letter-1', caseId: 'case-1', purpose: 'prior_authorization_request',
          version: 1, status, bodyMarkdown: '# Prior Authorization Request\n\nThe MRI supports the request.',
          contentSha256Text: 'c'.repeat(64), generatedAt: '2026-09-18T12:00:00Z',
          approvedAt: null, signedAt: null, qaRevision: status === 'draft' ? 0 : 1, revision: 1,
          claims: [{
            id: 'claim-1', ordinal: 1, claimText: 'The MRI supports the request.',
            documentId: 'document-1', documentName: 'MRI report', pageNumber: 1,
            sourceQuote: 'Nerve root compression is present.', sourceDate: '2026-03-14',
            supportStatus: status === 'draft' ? 'pending' : 'supported',
          }],
        },
      },
      generate: vi.fn(), review, approve, reload: vi.fn(),
    });
    route('/cases/case-1/letter?letterId=letter-1', <LetterRoute />);

    expect(screen.getByText('MRI report · page 1 · 2026-03-14')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Prior Authorization Request' })).toBeTruthy();
    expect(screen.getByText(/Nerve root compression is present/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(action === 'review' ? review : approve).toHaveBeenCalledOnce();
  });

  it('keeps approval hidden when the session lacks clinical approval authority', () => {
    capabilities.delete('letter_approve');
    letterWorkflow.mockReturnValue({
      view: {
        phase: 'ready', prerequisites: null, message: null,
        letter: {
          id: 'letter-1', caseId: 'case-1', purpose: 'prior_authorization_request', version: 1,
          status: 'in_review', bodyMarkdown: '# Prior Authorization Request', contentSha256Text: 'c'.repeat(64),
          generatedAt: '2026-09-18T12:00:00Z', approvedAt: null, signedAt: null, qaRevision: 1, revision: 1,
          claims: [],
        },
      },
      generate: vi.fn(), review: vi.fn(), approve: vi.fn(), reload: vi.fn(),
    });
    route('/cases/case-1/letter?letterId=letter-1', <LetterRoute />);

    expect((screen.getByRole('button', { name: 'Approve current revision' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('heading', { name: 'Prior Authorization Request' })).toBeTruthy();
  });
});
