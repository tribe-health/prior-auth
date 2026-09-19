import { describe, expect, it } from 'vitest';

import { projectEvidenceTimeline } from './use-evidence-timeline-projection';

describe('evidence timeline temporal projection', () => {
  it('normalizes PGlite Date values from DATE and TIMESTAMPTZ columns', () => {
    const projection = projectEvidenceTimeline({
      evidenceIds: ['evidence-1'],
      citationIds: ['citation-1'],
      documentIds: ['document-1'],
      stateIds: ['met', 'gap', 'void'],
      evidenceRows: {
        'evidence-1': {
          id: 'evidence-1',
          practice_id: 'practice-1',
          case_id: 'case-1',
          criterion_id: 'criterion-1',
          state: 'met',
          assessed_at: new Date('2026-01-16T12:00:00.000Z'),
        },
      },
      citationRows: {
        'citation-1': {
          id: 'citation-1',
          practice_id: 'practice-1',
          case_evidence_id: 'evidence-1',
          document_id: 'document-1',
          page_number: 1,
          relevance: 'supports',
        },
      },
      documentRows: {
        'document-1': {
          id: 'document-1',
          name: 'Synthetic source',
          effective_date: new Date('2026-01-15T00:00:00.000Z'),
        },
      },
      stateRows: {
        met: { key: 'met' },
        gap: { key: 'gap' },
        void: { key: 'void' },
      },
    }, 'case-1', 'practice-1');

    expect(projection).toMatchObject({
      status: 'ready',
      entries: [{
        assessedAt: '2026-01-16T12:00:00.000Z',
        citations: [{ effectiveDate: '2026-01-15' }],
      }],
    });
  });
});
