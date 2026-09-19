import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DOCUMENT_PROCESSING_FAILED_MESSAGE } from '../model/document-intake';

const statuses = vi.hoisted(() => vi.fn());
const upload = vi.hoisted(() => vi.fn());
const preview = vi.hoisted(() => ({
  state: { phase: 'closed' as const }, open: vi.fn(), close: vi.fn(), goToPage: vi.fn(),
}));

vi.mock('@/app/providers/session-provider', () => ({ useCan: () => true }));
vi.mock('../hooks/use-document-statuses', () => ({ useDocumentStatuses: statuses }));
vi.mock('../hooks/use-document-upload', () => ({ useDocumentUpload: upload }));
vi.mock('@/features/source-preview/hooks/use-source-preview', () => ({
  useSourcePreview: () => preview,
}));
vi.mock('@/features/source-preview/components/source-preview', () => ({
  SourcePreview: () => <div data-testid="source-preview" />,
}));

import { DocumentIntake } from './document-intake';

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const draft = {
  file: null, documentTypeKey: 'office-visit-note', name: '', effectiveDate: '',
};
const uploadState = {
  draft, outcome: 'idle', message: null, pending: false, canReconcile: false,
  updateDraft: vi.fn(), selectFile: vi.fn(), submit: vi.fn(), reconcile: vi.fn(),
  processingFailureMessage: DOCUMENT_PROCESSING_FAILED_MESSAGE,
};
const ready = {
  id: 'document-ready', caseId: 'case-1', documentTypeId: 'type-1',
  name: 'Synthetic office note', effectiveDate: '2026-09-18',
  contentSha256: 'a'.repeat(64), pageCount: 2, processingStatus: 'ready' as const,
  processingErrorCode: null, updatedAt: '2026-09-18T12:00:00Z', revision: 2,
};

describe('DocumentIntake', () => {
  it('renders responsive status cards, frozen failure copy, and an accessible source action', () => {
    upload.mockReturnValue(uploadState);
    statuses.mockReturnValue({
      status: 'ready', error: null,
      documents: [
        ready,
        { ...ready, id: 'document-failed', name: 'Synthetic failed note', pageCount: null, processingStatus: 'failed' },
      ],
    });

    render(<DocumentIntake caseId="case-1" caseInputRevision={3} documentSetRevision={1} />);

    expect(screen.getByLabelText('Document file').getAttribute('accept')).toBe(
      'application/pdf,text/plain,.pdf,.txt',
    );
    expect(screen.getByText(DOCUMENT_PROCESSING_FAILED_MESSAGE)).toBeTruthy();
    expect(screen.getByTestId('document-status-grid').className).toContain('sm:grid-cols-2');
    const open = screen.getByRole('button', { name: 'Open source' });
    expect(open.tabIndex).toBe(0);
    fireEvent.click(open);
    expect(preview.open).toHaveBeenCalledWith(expect.objectContaining({
      documentId: 'document-ready', pageNumber: 1,
    }));
  });

  it('announces upload progress and submits through the hook', () => {
    upload.mockReturnValue({
      ...uploadState,
      outcome: 'submitting', pending: true,
      message: 'Preparing and uploading the document…',
    });
    statuses.mockReturnValue({ status: 'ready', error: null, documents: [] });

    render(<DocumentIntake caseId="case-1" caseInputRevision={3} documentSetRevision={1} />);

    expect(screen.getByRole('progressbar', {
      name: 'Preparing and uploading the document…',
    })).toBeTruthy();
    fireEvent.submit(screen.getByRole('button', { name: 'Upload document' }).closest('form')!);
    expect(uploadState.submit).toHaveBeenCalledOnce();
  });

  it('rejoins committed status after reconstruction and preserves controls across resize', () => {
    upload.mockReturnValue(uploadState);
    statuses.mockReturnValue({ status: 'ready', error: null, documents: [ready] });
    const first = render(
      <DocumentIntake caseId="case-1" caseInputRevision={3} documentSetRevision={1} />,
    );
    expect(screen.getByText('Synthetic office note')).toBeTruthy();
    first.unmount();

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 320 });
    fireEvent(window, new Event('resize'));
    render(<DocumentIntake caseId="case-1" caseInputRevision={3} documentSetRevision={1} />);

    expect(screen.getByText('Synthetic office note')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open source' }).tabIndex).toBe(0);
    expect(screen.getByRole('button', { name: 'Upload document' }).tabIndex).toBe(0);
  });
});
