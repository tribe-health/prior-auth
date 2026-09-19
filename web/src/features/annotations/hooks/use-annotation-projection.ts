import { useMemo } from 'react';
import { useGraphStore } from '@prometheus-ags/entity-graph-react';
import { useShallow } from 'zustand/react/shallow';

import type { Annotation } from '../model/annotation';

const ANNOTATION_LIST = 'replica:annotations';
type GraphRows = Record<string, Record<string, unknown>>;

interface AnnotationGraphSlice {
  readonly ids: readonly string[] | null;
  readonly rows: GraphRows;
}

export type AnnotationProjection =
  | { readonly status: 'pending'; readonly annotations: readonly Annotation[]; readonly error: null }
  | { readonly status: 'ready'; readonly annotations: readonly Annotation[]; readonly error: null }
  | { readonly status: 'error'; readonly annotations: readonly Annotation[]; readonly error: string };

export function useAnnotationProjection(
  caseId: string,
  expectedPracticeId: string,
): AnnotationProjection {
  const slice = useGraphStore(useShallow((state): AnnotationGraphSlice => ({
    ids: state.lists[ANNOTATION_LIST]?.ids ?? null,
    rows: state.entities.Annotation ?? {},
  })));
  return useMemo(
    () => projectAnnotations(slice, caseId, expectedPracticeId),
    [caseId, expectedPracticeId, slice],
  );
}

export function projectAnnotations(
  slice: AnnotationGraphSlice,
  caseId: string,
  expectedPracticeId: string,
): AnnotationProjection {
  if (slice.ids === null) return { status: 'pending', annotations: [], error: null };
  try {
    const annotations = slice.ids
      .map((id) => {
        const row = slice.rows[id];
        if (!row) throw new Error(`Committed annotation ${id} is absent from the graph.`);
        return row;
      })
      .filter((row) => string(row, 'case_id') === caseId)
      .map((row): Annotation => {
        if (string(row, 'practice_id') !== expectedPracticeId) {
          throw new Error('Committed annotation is outside the verified practice.');
        }
        return {
          id: string(row, 'id'),
          caseId: string(row, 'case_id'),
          annotationTypeId: string(row, 'annotation_type_id'),
          name: string(row, 'name'),
          body: string(row, 'body'),
          authorId: string(row, 'author_id'),
          authorLabel: string(row, 'author_label'),
          provenance: string(row, 'provenance'),
          targetEvidenceId: nullableString(row, 'target_evidence_id'),
          targetDocumentId: nullableString(row, 'target_document_id'),
          disposition: boolean(row, 'is_included') ? 'included' : 'held',
          revision: integer(row, 'revision'),
          createdAt: temporal(row.created_at),
          updatedAt: temporal(row.updated_at),
        };
      })
      .sort((left, right) => (right.updatedAt ?? '').localeCompare(left.updatedAt ?? '') || left.id.localeCompare(right.id));
    return { status: 'ready', annotations, error: null };
  } catch (cause) {
    return {
      status: 'error',
      annotations: [],
      error: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

function string(row: Record<string, unknown>, field: string): string {
  const value = row[field];
  if (typeof value !== 'string' || value.length === 0) throw new Error(`Annotation ${field} is invalid.`);
  return value;
}

function nullableString(row: Record<string, unknown>, field: string): string | null {
  const value = row[field];
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new Error(`Annotation ${field} is invalid.`);
  return value;
}

function boolean(row: Record<string, unknown>, field: string): boolean {
  const value = row[field];
  if (typeof value !== 'boolean') throw new Error(`Annotation ${field} is invalid.`);
  return value;
}

function integer(row: Record<string, unknown>, field: string): number {
  const value = row[field];
  const parsed = typeof value === 'bigint' ? Number(value) : typeof value === 'string' ? Number(value) : value;
  if (!Number.isSafeInteger(parsed) || Number(parsed) < 0) throw new Error(`Annotation ${field} is invalid.`);
  return Number(parsed);
}

function temporal(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value))) return value;
  throw new Error('Annotation timestamp is invalid.');
}
