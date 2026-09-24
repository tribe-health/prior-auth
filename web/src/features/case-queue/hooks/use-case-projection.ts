import { useMemo } from 'react';
import { useGraphStore } from '@prometheus-ags/entity-graph-react';
import { useShallow } from 'zustand/react/shallow';

import { useRequiredSession } from '@/app/providers/session-provider';
import {
  CASE_STATUSES,
  type CaseRecord,
  type CaseStatus,
} from '../model/case-record';

const CASE_LIST = 'replica:cases';
type GraphRows = Record<string, Record<string, unknown>>;

export interface CaseGraphSlice {
  readonly ids: readonly string[] | null;
  readonly rows: GraphRows;
}

export type CaseQueueProjection =
  | { readonly status: 'pending'; readonly cases: readonly CaseRecord[]; readonly error: null }
  | { readonly status: 'ready'; readonly cases: readonly CaseRecord[]; readonly error: null }
  | { readonly status: 'error'; readonly cases: readonly CaseRecord[]; readonly error: string };

export type CaseSelectionProjection =
  | { readonly status: 'pending'; readonly case: null; readonly error: null }
  | { readonly status: 'ready'; readonly case: CaseRecord; readonly error: null }
  | { readonly status: 'unavailable'; readonly case: null; readonly error: null }
  | { readonly status: 'error'; readonly case: null; readonly error: string };

function useCaseGraphSlice(): CaseGraphSlice {
  return useGraphStore(useShallow((state): CaseGraphSlice => ({
    ids: state.lists[CASE_LIST]?.ids ?? null,
    rows: state.entities.Case ?? {},
  })));
}

/** Subscribe to the ordered committed queue and rejoin every current Case row. */
export function useCaseQueueProjection(): CaseQueueProjection {
  const session = useRequiredSession();
  const slice = useCaseGraphSlice();
  return useMemo(
    () => projectCaseQueue(slice, session.practiceId),
    [session.practiceId, slice],
  );
}

/** Select one committed case for the case-detail route. */
export function useCaseDetailProjection(caseId: string): CaseSelectionProjection {
  const session = useRequiredSession();
  const slice = useCaseGraphSlice();
  return useMemo(
    () => projectCaseSelection(slice, caseId, session.practiceId),
    [caseId, session.practiceId, slice],
  );
}

/** Select the same committed case identity for the intake route. */
export function useCaseIntakeProjection(caseId: string): CaseSelectionProjection {
  const session = useRequiredSession();
  const slice = useCaseGraphSlice();
  return useMemo(
    () => projectCaseSelection(slice, caseId, session.practiceId),
    [caseId, session.practiceId, slice],
  );
}

export function projectCaseQueue(
  slice: CaseGraphSlice,
  expectedPracticeId: string,
): CaseQueueProjection {
  if (slice.ids === null) return { status: 'pending', cases: [], error: null };
  try {
    return {
      status: 'ready',
      cases: slice.ids.map((id) => projectListedCase(slice.rows, id, expectedPracticeId)),
      error: null,
    };
  } catch (cause) {
    return {
      status: 'error',
      cases: [],
      error: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

export function projectCaseSelection(
  slice: CaseGraphSlice,
  caseId: string,
  expectedPracticeId: string,
): CaseSelectionProjection {
  if (slice.ids === null) return { status: 'pending', case: null, error: null };
  if (!slice.ids.includes(caseId)) {
    return { status: 'unavailable', case: null, error: null };
  }
  try {
    return {
      status: 'ready',
      case: projectListedCase(slice.rows, caseId, expectedPracticeId),
      error: null,
    };
  } catch (cause) {
    return {
      status: 'error',
      case: null,
      error: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

function projectListedCase(
  rows: GraphRows,
  id: string,
  expectedPracticeId: string,
): CaseRecord {
  const row = rows[id];
  if (!row) throw new Error(`Committed case list references missing row ${id}.`);
  const practiceId = requiredString(row, 'practice_id');
  if (practiceId !== expectedPracticeId) {
    throw new Error(`Committed case ${id} is outside the verified practice.`);
  }
  const rowId = requiredString(row, 'id');
  if (rowId !== id) throw new Error(`Committed case ${id} has a mismatched id.`);
  return {
    id: rowId,
    practiceId,
    caseNumber: requiredString(row, 'case_number'),
    patientId: requiredString(row, 'patient_id'),
    patientName: requiredString(row, 'patient_name'),
    surgeonId: requiredString(row, 'surgeon_id'),
    surgeonName: requiredString(row, 'surgeon_name'),
    coordinatorId: nullableString(row, 'coordinator_id'),
    payerId: requiredString(row, 'payer_id'),
    payerName: requiredString(row, 'payer_name'),
    status: requiredStatus(row.status),
    dateOfService: nullableDate(row.date_of_service),
    gateAffirmedAt: nullableTemporal(row.gate_affirmed_at),
    updatedAt: nullableTemporal(row.updated_at),
    revision: nonNegativeInteger(row.revision, 'revision'),
  };
}

function requiredString(row: Record<string, unknown>, field: string): string {
  const value = row[field];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Committed case has an invalid ${field}.`);
  }
  return value;
}

function nullableString(row: Record<string, unknown>, field: string): string | null {
  const value = row[field];
  if (value === null) return null;
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Committed case has an invalid ${field}.`);
  }
  return value;
}

function requiredStatus(value: unknown): CaseStatus {
  if (typeof value === 'string' && (CASE_STATUSES as readonly string[]).includes(value)) {
    return value as CaseStatus;
  }
  throw new Error('Committed case has an invalid status.');
}

function nullableDate(value: unknown): string | null {
  if (value === null) return null;
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  throw new Error('Committed case has an invalid date_of_service.');
}

function nullableTemporal(value: unknown): string | null {
  if (value === null) return null;
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString();
  if (typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value))) {
    return value;
  }
  throw new Error('Committed case has an invalid timestamp.');
}

function nonNegativeInteger(value: unknown, field: string): number {
  const parsed = typeof value === 'bigint'
    ? Number(value)
    : typeof value === 'string'
      ? Number(value)
      : value;
  if (!Number.isSafeInteger(parsed) || Number(parsed) < 0) {
    throw new Error(`Committed case has an invalid ${field}.`);
  }
  return Number(parsed);
}
