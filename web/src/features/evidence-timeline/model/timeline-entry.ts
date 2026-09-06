// Types over the five synced tables. The join the timeline needs, and no more.
//
// These are shaped by what the PGlite subset actually carries — see
// `shared/sync/pglite-schema.ts`. Columns excluded there as PHI are absent
// here too, which is the point: a type that offered `quote` or `author_name`
// would invite a component to render something the browser never receives.

import type { EvidenceState } from '../../../shared/model/evidence-state';

/**
 * One citation supporting an evidence assertion.
 *
 * `quote` is deliberately absent — it is PHI and stays server-side. What the
 * timeline shows is that a citation EXISTS, with enough provenance to find it:
 * which document, which page, which date.
 */
export interface TimelineCitation {
  id: string;
  documentId: string;
  /** Document name — "MRI Lumbar Spine w/o contrast". Not patient-identifying. */
  documentName: string;
  effectiveDate: string;
  pageNumber: number | null;
  relevance: string;
}

/**
 * One row of the timeline: a policy criterion and where its evidence stands.
 *
 * The state is the whole point of the row. `met` carries citations; `gap` and
 * `void` carry none — and for opposite reasons, which is why they are separate
 * members and not a nullable boolean (ADR-003).
 */
export interface TimelineEntry {
  id: string;
  caseId: string;
  policyCriterionId: string;
  /**
   * Human-readable criterion — "Six weeks conservative care documented".
   *
   * `null` when unavailable, which is the CURRENT state: `policy_criteria` is
   * not one of the five synced tables, so the browser holds the criterion's id
   * and not its text. W6 chose that subset deliberately and this slice does
   * not widen it.
   *
   * Nullable rather than falling back to the UUID, because a UUID rendered
   * where a sentence belongs looks like a data bug to a clinician and like
   * working software to a developer. The component shows an explicit
   * "Criterion unavailable" instead.
   */
  criterionLabel: string | null;
  state: EvidenceState;
  assessedAt: string | null;
  citations: readonly TimelineCitation[];
}

/**
 * Is this entry adequately supported?
 *
 * `met` with no citation is NOT met — it is an unsourced assertion, and
 * `aso.css:368` calls that a rendering bug. Naming the condition here keeps
 * every caller from re-deriving it slightly differently.
 */
export function isUnsupported(entry: TimelineEntry): boolean {
  return entry.state === 'met' && entry.citations.length === 0;
}
