import { describe, expect, it } from 'vitest';

import { projectDocumentTaskStatus } from './use-document-task-status';

describe('document task status projection', () => {
  it('selects the newest task for the exact case and purpose', () => {
    const projection = projectDocumentTaskStatus({
      ids: ['older', 'other-purpose', 'newer'],
      rows: {
        older: row('older', 'prior_authorization_request', '2026-09-19T10:00:00Z', 4),
        'other-purpose': row('other-purpose', 'clinical_appeal', '2026-09-19T12:00:00Z', 8),
        newer: row('newer', 'prior_authorization_request', '2026-09-19T11:00:00Z', 7),
      },
    }, 'case-1', 'prior_authorization_request');

    expect(projection).toEqual({
      status: 'ready',
      error: null,
      task: expect.objectContaining({ id: 'newer', lastSequence: 7 }),
    });
  });

  it('fails closed when a list member has no committed entity row', () => {
    expect(projectDocumentTaskStatus({ ids: ['missing'], rows: {} }, 'case-1', 'clinical_appeal')).toEqual({
      status: 'error',
      task: null,
      error: 'Committed task status list references missing row missing.',
    });
  });

  it('accepts the exact bigint wire value without accepting fractions', () => {
    const valid = projectDocumentTaskStatus({
      ids: ['task'],
      rows: { task: { ...row('task', 'clinical_appeal', '2026-09-19T12:00:00Z', 1), last_sequence: '9' } },
    }, 'case-1', 'clinical_appeal');
    expect(valid.status === 'ready' ? valid.task?.lastSequence : null).toBe(9);

    const invalid = projectDocumentTaskStatus({
      ids: ['task'],
      rows: { task: { ...row('task', 'clinical_appeal', '2026-09-19T12:00:00Z', 1), last_sequence: 1.5 } },
    }, 'case-1', 'clinical_appeal');
    expect(invalid.status).toBe('error');
  });
});

function row(id: string, purpose: string, updatedAt: string, sequence: number) {
  return {
    id,
    case_id: 'case-1',
    purpose,
    state: 'working',
    stage: 'qa',
    last_sequence: sequence,
    updated_at: updatedAt,
  };
}
