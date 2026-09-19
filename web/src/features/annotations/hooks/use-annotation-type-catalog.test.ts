import { describe, expect, it } from 'vitest';

import { projectAnnotationTypes } from './use-annotation-type-catalog';

describe('annotation type catalog projection', () => {
  it('stays pending until the committed list exists', () => {
    expect(projectAnnotationTypes({ ids: null, rows: {} })).toEqual({
      status: 'pending',
      types: [],
      error: null,
    });
  });

  it('projects and sorts approved annotation type fields', () => {
    expect(projectAnnotationTypes({
      ids: ['type-2', 'type-1'],
      rows: {
        'type-1': {
          id: 'type-1',
          key: 'clinical-judgment',
          name: 'Clinical Judgment',
          description: 'Synthetic description.',
        },
        'type-2': {
          id: 'type-2',
          key: 'measurement-correction',
          name: 'Measurement Correction',
          description: null,
        },
      },
    })).toEqual({
      status: 'ready',
      types: [
        {
          id: 'type-1',
          key: 'clinical-judgment',
          name: 'Clinical Judgment',
          description: 'Synthetic description.',
        },
        {
          id: 'type-2',
          key: 'measurement-correction',
          name: 'Measurement Correction',
          description: null,
        },
      ],
      error: null,
    });
  });

  it('fails explicitly when a listed type is missing or malformed', () => {
    const missing = projectAnnotationTypes({ ids: ['type-1'], rows: {} });
    expect(missing.status).toBe('error');
    expect(missing.error).toContain('absent from the graph');

    const malformed = projectAnnotationTypes({
      ids: ['type-1'],
      rows: {
        'type-1': { id: 'type-1', key: '', name: 'Clinical Judgment', description: null },
      },
    });
    expect(malformed.status).toBe('error');
    expect(malformed.error).toContain('key is invalid');
  });
});
