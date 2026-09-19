import { useMemo } from 'react';
import { useGraphStore } from '@prometheus-ags/entity-graph-react';
import { useShallow } from 'zustand/react/shallow';

import type {
  DocumentProcessingStatus,
  DocumentStatusRecord,
} from '../model/document-intake';

const DOCUMENT_LIST = 'replica:document_statuses';
const PROCESSING_STATUSES = new Set<DocumentProcessingStatus>([
  'queued', 'processing', 'ready', 'failed',
]);

type GraphRows = Record<string, Record<string, unknown>>;

interface DocumentGraphSlice {
  readonly ids: readonly string[] | null;
  readonly rows: GraphRows;
}

export type DocumentStatusesProjection =
  | { readonly status: 'pending'; readonly documents: readonly DocumentStatusRecord[]; readonly error: null }
  | { readonly status: 'ready'; readonly documents: readonly DocumentStatusRecord[]; readonly error: null }
  | { readonly status: 'error'; readonly documents: readonly DocumentStatusRecord[]; readonly error: string };

export function useDocumentStatuses(caseId: string): DocumentStatusesProjection {
  const slice = useGraphStore(useShallow((state): DocumentGraphSlice => ({
    ids: state.lists[DOCUMENT_LIST]?.ids ?? null,
    rows: state.entities.DocumentStatus ?? {},
  })));
  return useMemo(() => projectDocumentStatuses(slice, caseId), [caseId, slice]);
}

export function projectDocumentStatuses(
  slice: DocumentGraphSlice,
  caseId: string,
): DocumentStatusesProjection {
  if (slice.ids === null) return { status: 'pending', documents: [], error: null };
  try {
    const documents = slice.ids
      .map((id) => {
        const row = slice.rows[id];
        if (!row) throw new Error(`Committed document status list references missing row ${id}.`);
        return documentStatus(row);
      })
      .filter((document) => document.caseId === caseId)
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
    return { status: 'ready', documents, error: null };
  } catch (cause) {
    return {
      status: 'error',
      documents: [],
      error: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

function documentStatus(row: Record<string, unknown>): DocumentStatusRecord {
  const processingStatus = requiredString(row, 'processing_status');
  if (!PROCESSING_STATUSES.has(processingStatus as DocumentProcessingStatus)) {
    throw new Error('Committed document status has an invalid processing_status.');
  }
  return {
    id: requiredString(row, 'id'),
    caseId: requiredString(row, 'case_id'),
    documentTypeId: requiredString(row, 'document_type_id'),
    name: requiredString(row, 'name'),
    effectiveDate: requiredDate(row, 'effective_date'),
    contentSha256: requiredString(row, 'content_sha256_text'),
    pageCount: nullableInteger(row, 'page_count'),
    processingStatus: processingStatus as DocumentProcessingStatus,
    processingErrorCode: nullableString(row, 'processing_error_code'),
    updatedAt: requiredTemporal(row, 'updated_at'),
    revision: requiredInteger(row, 'revision'),
  };
}

function requiredString(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Committed document status has an invalid ${key}.`);
  }
  return value;
}

function nullableString(row: Record<string, unknown>, key: string): string | null {
  return row[key] === null ? null : requiredString(row, key);
}

function requiredTemporal(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString();
  const text = requiredString(row, key);
  if (!Number.isFinite(Date.parse(text))) {
    throw new Error(`Committed document status has an invalid ${key}.`);
  }
  return text;
}

function requiredDate(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString().slice(0, 10);
  const text = requiredString(row, key);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error(`Committed document status has an invalid ${key}.`);
  }
  return text;
}

function requiredInteger(row: Record<string, unknown>, key: string): number {
  const value = row[key];
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`Committed document status has an invalid ${key}.`);
  }
  return value as number;
}

function nullableInteger(row: Record<string, unknown>, key: string): number | null {
  return row[key] === null ? null : requiredInteger(row, key);
}
