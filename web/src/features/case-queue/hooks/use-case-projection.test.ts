import { describe, expect, it } from 'vitest';

import {
  projectCaseQueue,
  projectCaseSelection,
  type CaseGraphSlice,
} from './use-case-projection';

const slice = (practiceId = 'practice-1'): CaseGraphSlice => ({
  ids: ['case-2', 'case-1'],
  rows: {
    'case-1': {
      id: 'case-1',
      practice_id: practiceId,
      case_number: 'SYNTHETIC-001',
      patient_id: 'patient-1',
      patient_name: 'Synthetic Patient One',
      surgeon_id: 'surgeon-1',
      surgeon_name: 'Dr. Synthetic One',
      coordinator_id: null,
      payer_id: 'payer-1',
      payer_name: 'Synthetic Health Plan One',
      status: 'intake',
      date_of_service: new Date('2026-09-19T00:00:00Z'),
      gate_affirmed_at: null,
      updated_at: new Date('2026-09-17T12:00:00Z'),
      revision: '1',
      member_id: 'must-not-project',
      procedure_code: 'must-not-project',
      plan_key: 'must-not-project',
    },
    'case-2': {
      id: 'case-2',
      practice_id: practiceId,
      case_number: 'SYNTHETIC-002',
      patient_id: 'patient-2',
      patient_name: 'Synthetic Patient Two',
      surgeon_id: 'surgeon-2',
      surgeon_name: 'Dr. Synthetic Two',
      coordinator_id: 'coordinator-2',
      payer_id: 'payer-2',
      payer_name: 'Synthetic Health Plan Two',
      status: 'evidence',
      date_of_service: null,
      gate_affirmed_at: '2026-09-17T11:00:00Z',
      updated_at: null,
      revision: 2n,
    },
  },
});

describe('committed case projections', () => {
  it('preserves ordered list membership and normalizes exact identifier-only rows', () => {
    expect(projectCaseQueue(slice(), 'practice-1')).toEqual({
      status: 'ready',
      error: null,
      cases: [
        {
          id: 'case-2',
          practiceId: 'practice-1',
          caseNumber: 'SYNTHETIC-002',
          patientId: 'patient-2',
          patientName: 'Synthetic Patient Two',
          surgeonId: 'surgeon-2',
          surgeonName: 'Dr. Synthetic Two',
          coordinatorId: 'coordinator-2',
          payerId: 'payer-2',
          payerName: 'Synthetic Health Plan Two',
          status: 'evidence',
          dateOfService: null,
          gateAffirmedAt: '2026-09-17T11:00:00Z',
          updatedAt: null,
          revision: 2,
        },
        expect.objectContaining({
          id: 'case-1',
          dateOfService: '2026-09-19',
          updatedAt: '2026-09-17T12:00:00.000Z',
          revision: 1,
        }),
      ],
    });
  });

  it('returns pending until the committed list exists', () => {
    expect(projectCaseQueue({ ids: null, rows: {} }, 'practice-1')).toEqual({
      status: 'pending', cases: [], error: null,
    });
  });

  it('does not expose resolution inputs from an over-wide replica row', () => {
    const projection = projectCaseSelection(slice(), 'case-1', 'practice-1');
    expect(projection.status).toBe('ready');
    if (projection.status !== 'ready') return;

    expect(projection.case).not.toHaveProperty('memberId');
    expect(projection.case).not.toHaveProperty('procedureCode');
    expect(projection.case).not.toHaveProperty('planKey');
  });

  it('refuses a listed case from another practice instead of filtering it silently', () => {
    const projection = projectCaseQueue(slice('practice-2'), 'practice-1');
    expect(projection.status).toBe('error');
    expect(projection.error).toMatch(/outside the verified practice/i);
  });

  it('returns unavailable for detail or intake when the id is outside the committed list', () => {
    expect(projectCaseSelection(slice(), 'case-3', 'practice-1')).toEqual({
      status: 'unavailable', case: null, error: null,
    });
  });

  it('refuses missing rows and unknown lifecycle states', () => {
    const missing = projectCaseQueue({ ids: ['case-1'], rows: {} }, 'practice-1');
    expect(missing.status).toBe('error');
    expect(missing.error).toMatch(/missing row/i);

    const invalid = slice();
    invalid.rows['case-1']!.status = 'invented';
    const selected = projectCaseSelection(invalid, 'case-1', 'practice-1');
    expect(selected.status).toBe('error');
    expect(selected.error).toMatch(/invalid status/i);
  });
});
