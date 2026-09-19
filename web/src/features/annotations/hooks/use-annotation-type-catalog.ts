import { useMemo } from 'react';
import { useGraphStore } from '@prometheus-ags/entity-graph-react';
import { useShallow } from 'zustand/react/shallow';

import type { AnnotationType } from '../model/annotation';

const ANNOTATION_TYPE_LIST = 'replica:annotation_types';
type GraphRows = Record<string, Record<string, unknown>>;

interface AnnotationTypeGraphSlice {
  readonly ids: readonly string[] | null;
  readonly rows: GraphRows;
}

export type AnnotationTypeCatalog =
  | { readonly status: 'pending'; readonly types: readonly AnnotationType[]; readonly error: null }
  | { readonly status: 'ready'; readonly types: readonly AnnotationType[]; readonly error: null }
  | { readonly status: 'error'; readonly types: readonly AnnotationType[]; readonly error: string };

export function useAnnotationTypeCatalog(): AnnotationTypeCatalog {
  const slice = useGraphStore(useShallow((state): AnnotationTypeGraphSlice => ({
    ids: state.lists[ANNOTATION_TYPE_LIST]?.ids ?? null,
    rows: state.entities.AnnotationType ?? {},
  })));
  return useMemo(() => projectAnnotationTypes(slice), [slice]);
}

export function projectAnnotationTypes(slice: AnnotationTypeGraphSlice): AnnotationTypeCatalog {
  if (slice.ids === null) return { status: 'pending', types: [], error: null };
  try {
    const types = slice.ids
      .map((id): AnnotationType => {
        const row = slice.rows[id];
        if (!row) throw new Error(`Committed annotation type ${id} is absent from the graph.`);
        return {
          id: requiredString(row, 'id'),
          key: requiredString(row, 'key'),
          name: requiredString(row, 'name'),
          description: nullableString(row, 'description'),
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
    return { status: 'ready', types, error: null };
  } catch (cause) {
    return {
      status: 'error',
      types: [],
      error: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

function requiredString(row: Record<string, unknown>, field: string): string {
  const value = row[field];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Annotation type ${field} is invalid.`);
  }
  return value;
}

function nullableString(row: Record<string, unknown>, field: string): string | null {
  const value = row[field];
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new Error(`Annotation type ${field} is invalid.`);
  return value;
}
