import { useMemo } from 'react';
import { useGraphStore } from '@prometheus-ags/entity-graph-react';
import { useShallow } from 'zustand/react/shallow';

import { TASK_STATES, type DocumentPurpose, type DocumentTask } from '../model/document-task';

const TASK_STATUS_LIST = 'replica:document_task_statuses';
const PURPOSES = new Set<DocumentPurpose>([
  'prior_authorization_request',
  'corrected_resubmission',
  'clinical_appeal',
]);

type GraphRows = Record<string, Record<string, unknown>>;

interface TaskStatusGraphSlice {
  readonly ids: readonly string[] | null;
  readonly rows: GraphRows;
}

export type ReplicatedDocumentTaskStatus = Pick<
  DocumentTask,
  'id' | 'caseId' | 'purpose' | 'state' | 'stage' | 'lastSequence' | 'updatedAt'
>;

export type DocumentTaskStatusProjection =
  | { readonly status: 'pending'; readonly task: null; readonly error: null }
  | { readonly status: 'ready'; readonly task: ReplicatedDocumentTaskStatus | null; readonly error: null }
  | { readonly status: 'error'; readonly task: null; readonly error: string };

export function useDocumentTaskStatus(
  caseId: string,
  purpose: DocumentPurpose,
): DocumentTaskStatusProjection {
  const slice = useGraphStore(useShallow((state): TaskStatusGraphSlice => ({
    ids: state.lists[TASK_STATUS_LIST]?.ids ?? null,
    rows: state.entities.DocumentTaskStatus ?? {},
  })));
  return useMemo(
    () => projectDocumentTaskStatus(slice, caseId, purpose),
    [caseId, purpose, slice],
  );
}

export function projectDocumentTaskStatus(
  slice: TaskStatusGraphSlice,
  caseId: string,
  purpose: DocumentPurpose,
): DocumentTaskStatusProjection {
  if (slice.ids === null) return { status: 'pending', task: null, error: null };
  try {
    const task = slice.ids
      .map((id) => {
        const row = slice.rows[id];
        if (!row) throw new Error(`Committed task status list references missing row ${id}.`);
        return taskStatus(row);
      })
      .filter((candidate) => candidate.caseId === caseId && candidate.purpose === purpose)
      .sort((left, right) => {
        const time = Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
        return time || right.lastSequence - left.lastSequence || right.id.localeCompare(left.id);
      })[0] ?? null;
    return { status: 'ready', task, error: null };
  } catch (cause) {
    return {
      status: 'error',
      task: null,
      error: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

function taskStatus(row: Record<string, unknown>): ReplicatedDocumentTaskStatus {
  const purpose = requiredString(row, 'purpose');
  const state = requiredString(row, 'state');
  if (!PURPOSES.has(purpose as DocumentPurpose)) {
    throw new Error('Committed task status has an invalid purpose.');
  }
  if (!TASK_STATES.includes(state as DocumentTask['state'])) {
    throw new Error('Committed task status has an invalid state.');
  }
  return {
    id: requiredString(row, 'id'),
    caseId: requiredString(row, 'case_id'),
    purpose: purpose as DocumentPurpose,
    state: state as DocumentTask['state'],
    stage: requiredString(row, 'stage'),
    lastSequence: requiredNonnegativeInteger(row, 'last_sequence'),
    updatedAt: requiredTemporal(row, 'updated_at'),
  };
}

function requiredString(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Committed task status has an invalid ${key}.`);
  }
  return value;
}

function requiredNonnegativeInteger(row: Record<string, unknown>, key: string): number {
  const value = row[key];
  const parsed = typeof value === 'bigint'
    ? Number(value)
    : typeof value === 'string' && /^\d+$/.test(value)
      ? Number(value)
      : value;
  if (!Number.isSafeInteger(parsed) || (parsed as number) < 0) {
    throw new Error(`Committed task status has an invalid ${key}.`);
  }
  return parsed as number;
}

function requiredTemporal(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString();
  const text = requiredString(row, key);
  if (!Number.isFinite(Date.parse(text))) {
    throw new Error(`Committed task status has an invalid ${key}.`);
  }
  return text;
}
