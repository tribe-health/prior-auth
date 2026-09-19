import { describe, expect, it } from 'vitest';

import { projectDocumentStatuses } from './use-document-statuses';

const DOCUMENT = {
  id: 'document-1', case_id: 'case-1', document_type_id: 'type-1',
  name: 'Synthetic office note', effective_date: '2026-09-18',
  content_sha256_text: 'a'.repeat(64), page_count: 2,
  processing_status: 'ready', processing_error_code: null,
  updated_at: new Date('2026-09-18T12:00:00Z'), revision: 2,
};

describe('document status projection', () => {
  it('joins the committed list to normalized rows and filters by case', () => {
    const result = projectDocumentStatuses({
      ids: ['document-1', 'document-2'],
      rows: {
        'document-1': DOCUMENT,
        'document-2': { ...DOCUMENT, id: 'document-2', case_id: 'case-2' },
      },
    }, 'case-1');

    expect(result).toEqual({
      status: 'ready', error: null,
      documents: [{
        id: 'document-1', caseId: 'case-1', documentTypeId: 'type-1',
        name: 'Synthetic office note', effectiveDate: '2026-09-18',
        contentSha256: 'a'.repeat(64), pageCount: 2, processingStatus: 'ready',
        processingErrorCode: null, updatedAt: '2026-09-18T12:00:00.000Z', revision: 2,
      }],
    });
  });

  it('does not turn a missing normalized row into an empty document list', () => {
    expect(projectDocumentStatuses({ ids: ['document-1'], rows: {} }, 'case-1')).toEqual({
      status: 'error', documents: [],
      error: 'Committed document status list references missing row document-1.',
    });
  });
});
