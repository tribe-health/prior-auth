import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DocumentTaskArtifacts } from '../model/document-task';
import type { TaskChannelState } from '../services/document-task-channel';

const source = vi.hoisted(() => ({ open: vi.fn(), close: vi.fn(), goToPage: vi.fn(), state: { phase: 'closed' } }));
vi.mock('@/features/source-preview/hooks/use-source-preview', () => ({ useSourcePreview: () => source }));
vi.mock('@/features/source-preview/components/source-preview', () => ({ SourcePreview: () => null }));
import { DocumentTaskPanel } from './document-task-panel';

const state: TaskChannelState = { connection: 'disconnected', command: { commandId: 'command-1', purpose: 'prior_authorization_request', expectedRevisions: { resolutionRevision: 'r1', criteriaSelectionRevision: 'r1', evidenceRevision: 'r1' } }, task: null, sequence: 0, stage: 'persistence', provisionalText: '', surfaces: [], artifacts: null, message: 'Connection interrupted.', startRefused: false };
const digest = `sha256:${'a'.repeat(64)}`;
const artifact: DocumentTaskArtifacts = {
  assembly: { kindKey: 'pa.initial_request', kindVersion: 1, templatePackage: 'aso-prior-auth', templateDigest: digest, contentSha256: digest, canonicalMarkdown: '| Synthetic column |\n| --- |\n| Synthetic evidence |', qa: [{ check: 'criterion_coverage', severity: 'blocking', outcome: 'fail', detail: 'Synthetic criterion requires review.' }], renderedClaims: [{ ordinal: 1, text: 'Synthetic cited assertion.', criterionId: 'criterion-1', provenance: { kind: 'document', documentId: 'document-1', documentVersion: 1, title: 'Synthetic source', page: 2, effectiveDate: '2026-09-19', contentSha256: digest, sourceQuote: 'Synthetic evidence quote.' } }] },
  letter: { commandId: 'command-1', letterId: 'letter-1', caseId: 'case-1', letterVersion: 1, qaRevision: 1, status: 'draft', committedAt: '2026-09-19T00:00:00Z' },
};
const actions = { onReconnect: vi.fn(), onCancel: vi.fn(), onResume: vi.fn() };
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('document task presentation wiring', () => {
  it('shows interrupted work as provisional and keeps reconnect keyboard focusable', () => {
    render(<DocumentTaskPanel caseId="case-1" state={{ ...state, provisionalText: 'Synthetic provisional draft' }} canManage {...actions} />);
    expect(screen.queryByText('Saved to case')).toBeNull();
    expect(screen.getByText('Provisional · Not saved')).toBeTruthy();
    const reconnect = screen.getByRole('button', { name: 'Reconnect to same request' });
    reconnect.focus();
    expect(document.activeElement).toBe(reconnect);
    fireEvent.click(reconnect);
    expect(actions.onReconnect).toHaveBeenCalledTimes(1);
    const text = screen.getByLabelText('Provisional document text');
    text.focus();
    expect(document.activeElement).toBe(text);
  });
  it('renders saved shared blocks, blocking QA, and a working source intent callback', () => {
    render(<DocumentTaskPanel caseId="case-1" state={state} savedLetterId="letter-1" savedArtifacts={artifact} canManage {...actions} />);
    expect(screen.getByRole('heading', { name: 'Draft preview' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'QA findings' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Claims and sources' })).toBeTruthy();
    expect(screen.getByText('1 blocking failure')).toBeTruthy();
    expect(screen.queryByText('Provisional · Not saved')).toBeNull();
    const table = screen.getByRole('region', { name: 'Draft table' });
    table.focus();
    expect(document.activeElement).toBe(table);
    const button = screen.getByRole('button', { name: 'Open source for claim 1: Synthetic source, page 2' });
    fireEvent.click(button);
    expect(source.open).toHaveBeenCalledWith(expect.objectContaining({ caseId: 'case-1', documentId: 'document-1', pageNumber: 2, effectiveDate: '2026-09-19' }));
    expect(screen.queryByRole('button', { name: /sign|affirm/i })).toBeNull();
  });
  it('labels the authoritative signed artifact as signed', () => {
    render(<DocumentTaskPanel caseId="case-1" state={state} savedLetterId="letter-1" savedLetterStatus="signed" savedArtifacts={artifact} canManage {...actions} />);
    expect(screen.getByRole('heading', { name: 'Signed document' })).toBeTruthy();
    expect(screen.getByText(/Signed revision/)).toBeTruthy();
    expect(screen.queryByText(/Unsigned document/)).toBeNull();
  });
  it('visibly refuses streamed privileged descriptors', () => {
    render(<DocumentTaskPanel caseId="case-1" state={{ ...state, surfaces: [{ surface: 'SigningBlock', schema: 'aso.signing.v1', slot: 'main', props: {} }] }} canManage={false} {...actions} />);
    expect(screen.getByText('Generated block unavailable')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /sign|affirm/i })).toBeNull();
  });
});
