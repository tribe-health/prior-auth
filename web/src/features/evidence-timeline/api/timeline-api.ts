// The read path and the write path are different paths, on purpose.
//
// READS come from the local PGlite store, which Electric keeps current
// (ADR-007). No query cache sits in front of it — the synced store already
// knows freshness, and a cache would be a second answer to the same question
// (ADR-001).
//
// WRITES go to the Axum API over HTTP. They never touch the local store
// directly, because clinical authority is checked on the server at three
// layers (ADR-002) and a local write would bypass all three. The local copy
// updates when the change syncs back — which is what makes the round trip the
// confirmation rather than an optimistic guess.

import type { PGlite } from '@electric-sql/pglite';

import { httpClient } from '../../../shared/api/http-client';
import type { EvidenceState } from '../../../shared/model/evidence-state';
import { EVIDENCE_STATES } from '../../../shared/model/evidence-state';
import type { TimelineCitation, TimelineEntry } from '../model/timeline-entry';

interface EntryRow {
  id: string;
  case_id: string;
  policy_criterion_id: string;
  state: string;
  assessed_at: string | null;
}

interface CitationRow {
  id: string;
  case_evidence_id: string;
  document_id: string;
  document_name: string;
  effective_date: string;
  page_number: number | null;
  relevance: string;
}

/**
 * Read the timeline for one case out of the local store.
 *
 * Two queries and an in-memory join, not one query with a join, because the
 * citation set is per entry and a single flat result would need de-duplicating
 * by hand — the same work, done less legibly.
 */
export async function readTimeline(db: PGlite, caseId: string): Promise<TimelineEntry[]> {
  const entries = await db.query<EntryRow>(
    `SELECT id, case_id, policy_criterion_id, state, assessed_at
       FROM case_evidence
      WHERE case_id = $1
      ORDER BY assessed_at NULLS LAST, id`,
    [caseId],
  );

  const citations = await db.query<CitationRow>(
    `SELECT c.id, c.case_evidence_id, c.document_id,
            d.name AS document_name, d.effective_date,
            c.page_number, c.relevance
       FROM evidence_citations c
       JOIN documents d ON d.id = c.document_id
       JOIN case_evidence e ON e.id = c.case_evidence_id
      WHERE e.case_id = $1
      ORDER BY d.effective_date DESC`,
    [caseId],
  );

  const byEntry = new Map<string, TimelineCitation[]>();
  for (const row of citations.rows) {
    const list = byEntry.get(row.case_evidence_id) ?? [];
    list.push({
      id: row.id,
      documentId: row.document_id,
      documentName: row.document_name,
      effectiveDate: row.effective_date,
      pageNumber: row.page_number,
      relevance: row.relevance,
    });
    byEntry.set(row.case_evidence_id, list);
  }

  return entries.rows.map((row) => ({
    id: row.id,
    caseId: row.case_id,
    policyCriterionId: row.policy_criterion_id,
    // Not synced — see TimelineEntry.criterionLabel. Explicitly null rather
    // than echoing the id back as though it were a label.
    criterionLabel: null,
    state: toEvidenceState(row.state),
    assessedAt: row.assessed_at,
    citations: byEntry.get(row.id) ?? [],
  }));
}

/**
 * Narrow a database string to the union.
 *
 * The column has a foreign key to `evidence_states`, so an unknown value means
 * the synced schema and this code disagree. That THROWS rather than defaulting:
 * a silent fallback to `gap` would tell a coordinator to argue a criterion
 * whose real state nobody knows, and defaulting to `met` would be worse.
 */
function toEvidenceState(value: string): EvidenceState {
  if ((EVIDENCE_STATES as readonly string[]).includes(value)) {
    return value as EvidenceState;
  }
  throw new Error(
    `Unknown evidence state "${value}". The synced schema and the client disagree; ` +
      `refusing to guess which of met/gap/void was meant.`,
  );
}

/** Writes. Server-side, audited, capability-checked — never a local mutation. */
export const timelineApi = {
  reassess: (caseId: string, entryId: string, state: EvidenceState) =>
    httpClient.post<void>(`/api/cases/${caseId}/evidence/${entryId}/state`, { state }),
};
