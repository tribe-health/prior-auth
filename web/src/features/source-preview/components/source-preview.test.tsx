import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SourcePreviewState, SourcePreviewTarget } from '../model/source-preview';
import { CitationAction } from './citation-action';
import { SourcePreview } from './source-preview';

afterEach(cleanup);

const target: SourcePreviewTarget = {
  id: 'citation-1',
  caseId: 'case-1',
  documentId: 'document-1',
  documentName: 'Synthetic MRI',
  effectiveDate: '2026-03-14',
  pageNumber: 2,
  relevance: 'primary',
};

const ready: SourcePreviewState = {
  phase: 'ready',
  source: {
    citationId: 'citation-1',
    documentId: 'document-1',
    documentName: 'Synthetic MRI',
    effectiveDate: '2026-03-14',
    pageNumber: 2,
    pageCount: 4,
    mediaType: 'application/pdf',
    objectUrl: 'blob:synthetic-source',
  },
};

describe('source preview composition', () => {
  it('opens a known-page citation through an explicit 44px action', () => {
    const onOpen = vi.fn();
    render(<CitationAction caseId="case-1" citation={target} onOpen={onOpen} />);

    const action = screen.getByRole('button', { name: /open source synthetic mri/i });
    expect(action.className).toContain('min-h-11');
    fireEvent.click(action);
    expect(onOpen).toHaveBeenCalledWith(target, action);
  });

  it('presents provenance, page controls and one adaptive dialog surface', () => {
    const onPageChange = vi.fn();
    const onClose = vi.fn();
    render(<SourcePreview state={ready} onClose={onClose} onPageChange={onPageChange} />);

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Synthetic MRI')).toBeTruthy();
    expect(screen.getByText('Source date 2026-03-14 · Page 2')).toBeTruthy();
    expect(screen.getByTitle('Synthetic MRI, page 2').getAttribute('src'))
      .toBe('blob:synthetic-source#page=2');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPageChange).toHaveBeenCalledWith(3);
    fireEvent.click(screen.getByRole('button', { name: /close source preview/i }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(document.querySelectorAll('[data-slot="dialog-content"]')).toHaveLength(1);
  });
});
