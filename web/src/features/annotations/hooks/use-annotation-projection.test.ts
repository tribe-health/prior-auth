import { describe, expect, it } from 'vitest';

import { projectAnnotations } from './use-annotation-projection';

describe('annotation graph projection', () => {
  it('keeps attribution, source target and include disposition separate from chart evidence', () => {
    const projection = projectAnnotations({
      ids: ['annotation-1'],
      rows: {
        'annotation-1': {
          id: 'annotation-1',
          practice_id: 'practice-1',
          case_id: 'case-1',
          annotation_type_id: 'type-1',
          name: 'Clinical judgment',
          body: 'Synthetic clinical opinion.',
          author_id: 'author-1',
          author_label: 'Synthetic Surgeon',
          provenance: 'surgeon',
          is_included: true,
          target_evidence_id: 'evidence-1',
          target_document_id: null,
          revision: '2',
          created_at: new Date('2026-09-15T10:00:00Z'),
          updated_at: new Date('2026-09-15T11:00:00Z'),
        },
      },
    }, 'case-1', 'practice-1');

    expect(projection).toEqual({
      status: 'ready',
      error: null,
      annotations: [{
        id: 'annotation-1',
        caseId: 'case-1',
        annotationTypeId: 'type-1',
        name: 'Clinical judgment',
        body: 'Synthetic clinical opinion.',
        authorId: 'author-1',
        authorLabel: 'Synthetic Surgeon',
        provenance: 'surgeon',
        targetEvidenceId: 'evidence-1',
        targetDocumentId: null,
        disposition: 'included',
        revision: 2,
        createdAt: '2026-09-15T10:00:00.000Z',
        updatedAt: '2026-09-15T11:00:00.000Z',
      }],
    });
  });

  it('refuses a row outside the verified practice', () => {
    const projection = projectAnnotations({
      ids: ['annotation-1'],
      rows: {
        'annotation-1': {
          id: 'annotation-1', practice_id: 'practice-2', case_id: 'case-1',
        },
      },
    }, 'case-1', 'practice-1');
    expect(projection.status).toBe('error');
    expect(projection.error).toMatch(/outside the verified practice/i);
  });
});
