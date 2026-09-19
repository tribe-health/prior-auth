import { useMemo } from 'react';
import { useGraphStore } from '@prometheus-ags/entity-graph-react';
import { useShallow } from 'zustand/react/shallow';

import { EVIDENCE_STATES, type EvidenceState } from '../../../shared/model/evidence-state';
import type { TimelineCitation, TimelineEntry } from '../model/timeline-entry';

const CASE_EVIDENCE_LIST = 'replica:case_evidence';
const CITATION_LIST = 'replica:evidence_citations';
const DOCUMENT_LIST = 'replica:document_statuses';
const EVIDENCE_STATE_LIST = 'replica:evidence_states';

type GraphRows = Record<string, Record<string, unknown>>;

interface TimelineGraphSlice {
  readonly evidenceIds: readonly string[] | null;
  readonly citationIds: readonly string[] | null;
  readonly documentIds: readonly string[] | null;
  readonly stateIds: readonly string[] | null;
  readonly evidenceRows: GraphRows;
  readonly citationRows: GraphRows;
  readonly documentRows: GraphRows;
  readonly stateRows: GraphRows;
}

export type EvidenceTimelineProjection =
  | { readonly status: 'pending'; readonly entries: readonly TimelineEntry[]; readonly error: null }
  | { readonly status: 'ready'; readonly entries: readonly TimelineEntry[]; readonly error: null }
  | { readonly status: 'error'; readonly entries: readonly TimelineEntry[]; readonly error: string };

/**
 * Subscribe to the committed PEM projection for one case.
 *
 * The selector reads list membership and normalized entities in the same
 * Zustand snapshot. It never copies clinical rows into component or view state.
 */
export function useEvidenceTimelineProjection(
  caseId: string,
  expectedPracticeId: string,
): EvidenceTimelineProjection {
  const slice = useGraphStore(useShallow((state): TimelineGraphSlice => ({
    evidenceIds: state.lists[CASE_EVIDENCE_LIST]?.ids ?? null,
    citationIds: state.lists[CITATION_LIST]?.ids ?? null,
    documentIds: state.lists[DOCUMENT_LIST]?.ids ?? null,
    stateIds: state.lists[EVIDENCE_STATE_LIST]?.ids ?? null,
    evidenceRows: state.entities.CaseEvidence ?? {},
    citationRows: state.entities.EvidenceCitation ?? {},
    documentRows: state.entities.DocumentStatus ?? {},
    stateRows: state.entities.EvidenceState ?? {},
  })));

  return useMemo(
    () => projectEvidenceTimeline(slice, caseId, expectedPracticeId),
    [caseId, expectedPracticeId, slice],
  );
}

/** Build the UI projection from one committed graph snapshot. */
export function projectEvidenceTimeline(
  slice: TimelineGraphSlice,
  caseId: string,
  expectedPracticeId: string,
): EvidenceTimelineProjection {
  if (
    slice.evidenceIds === null
    || slice.citationIds === null
    || slice.documentIds === null
    || slice.stateIds === null
  ) {
    return { status: 'pending', entries: [], error: null };
  }

  try {
    const stateIds = requireEvidenceStateReferences(slice.stateIds, slice.stateRows);
    const evidence = slice.evidenceIds
      .map((id) => requireListedRow(slice.evidenceRows, id, 'case evidence'))
      .filter((row) => requiredString(row, 'case_id', 'case evidence') === caseId);
    const evidenceIds = new Set(evidence.map((row) => requiredString(row, 'id', 'case evidence')));
    const citationsByEvidence = new Map<string, TimelineCitation[]>();

    for (const citationId of slice.citationIds) {
      const row = requireListedRow(slice.citationRows, citationId, 'evidence citation');
      const evidenceId = requiredString(row, 'case_evidence_id', 'evidence citation');
      if (!evidenceIds.has(evidenceId)) continue;
      assertPractice(row, expectedPracticeId, 'evidence citation');

      const documentId = requiredString(row, 'document_id', 'evidence citation');
      if (!slice.documentIds.includes(documentId)) {
        throw new Error(`Evidence citation ${citationId} references a document outside the committed list.`);
      }
      const document = requireListedRow(slice.documentRows, documentId, 'document');
      const citations = citationsByEvidence.get(evidenceId) ?? [];
      citations.push({
        id: requiredString(row, 'id', 'evidence citation'),
        documentId,
        documentName: requiredString(document, 'name', 'document'),
        effectiveDate: requiredDateString(document, 'effective_date', 'document'),
        pageNumber: nullableNumber(row, 'page_number', 'evidence citation'),
        relevance: requiredString(row, 'relevance', 'evidence citation'),
      });
      citationsByEvidence.set(evidenceId, citations);
    }

    const entries = evidence.map((row): TimelineEntry => {
      assertPractice(row, expectedPracticeId, 'case evidence');
      const id = requiredString(row, 'id', 'case evidence');
      return {
        id,
        caseId: requiredString(row, 'case_id', 'case evidence'),
        policyCriterionId: requiredString(row, 'criterion_id', 'case evidence'),
        criterionLabel: null,
        // State is authoritative data. Citation presence is orthogonal and
        // must never turn a gap or a met assertion into a void.
        state: evidenceState(row.state, stateIds),
        assessedAt: nullableTemporalString(row, 'assessed_at', 'case evidence'),
        citations: (citationsByEvidence.get(id) ?? []).sort(compareCitations),
      };
    });

    entries.sort(compareEntries);
    return { status: 'ready', entries, error: null };
  } catch (cause) {
    return {
      status: 'error',
      entries: [],
      error: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

function requireListedRow(rows: GraphRows, id: string, label: string): Record<string, unknown> {
  const row = rows[id];
  if (!row) throw new Error(`Committed ${label} list references missing row ${id}.`);
  return row;
}

function requiredString(row: Record<string, unknown>, key: string, label: string): string {
  const value = row[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Committed ${label} has an invalid ${key}.`);
  }
  return value;
}

function requiredTemporalString(row: Record<string, unknown>, key: string, label: string): string {
  const value = row[key];
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString();
  return requiredString(row, key, label);
}

function requiredDateString(row: Record<string, unknown>, key: string, label: string): string {
  const value = row[key];
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return value.toISOString().slice(0, 10);
  }
  const text = requiredString(row, key, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error(`Committed ${label} has an invalid ${key}.`);
  }
  return text;
}

function nullableTemporalString(row: Record<string, unknown>, key: string, label: string): string | null {
  const value = row[key];
  if (value === null) return null;
  return requiredTemporalString(row, key, label);
}

function nullableNumber(row: Record<string, unknown>, key: string, label: string): number | null {
  const value = row[key];
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Committed ${label} has an invalid ${key}.`);
  }
  return value;
}

function requireEvidenceStateReferences(
  ids: readonly string[],
  rows: GraphRows,
): ReadonlySet<string> {
  const expected = new Set<string>(EVIDENCE_STATES);
  const actual = new Set(ids);
  if (ids.length !== expected.size || actual.size !== expected.size) {
    throw new Error('Committed evidence-state references must contain distinct met, gap, and void rows.');
  }
  for (const state of expected) {
    if (!actual.has(state)) {
      throw new Error('Committed evidence-state references must contain distinct met, gap, and void rows.');
    }
    const row = requireListedRow(rows, state, 'evidence state');
    if (requiredString(row, 'key', 'evidence state') !== state) {
      throw new Error(`Committed evidence-state reference ${state} has a mismatched key.`);
    }
  }
  return actual;
}

function evidenceState(value: unknown, references: ReadonlySet<string>): EvidenceState {
  if (
    typeof value === 'string'
    && references.has(value)
    && (EVIDENCE_STATES as readonly string[]).includes(value)
  ) {
    return value as EvidenceState;
  }
  throw new Error('Committed case evidence has an invalid state; refusing to infer met, gap, or void.');
}

function assertPractice(
  row: Record<string, unknown>,
  expectedPracticeId: string,
  label: string,
): void {
  if (requiredString(row, 'practice_id', label) !== expectedPracticeId) {
    throw new Error(`Committed ${label} is outside the verified practice.`);
  }
}

function compareEntries(left: TimelineEntry, right: TimelineEntry): number {
  if (left.assessedAt === null && right.assessedAt !== null) return 1;
  if (left.assessedAt !== null && right.assessedAt === null) return -1;
  return (left.assessedAt ?? '').localeCompare(right.assessedAt ?? '') || left.id.localeCompare(right.id);
}

function compareCitations(left: TimelineCitation, right: TimelineCitation): number {
  return right.effectiveDate.localeCompare(left.effectiveDate) || left.id.localeCompare(right.id);
}
