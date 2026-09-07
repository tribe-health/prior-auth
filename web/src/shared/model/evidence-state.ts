// Three evidence states, never two.
//
// `void` is not a weak `gap`. A gap is a chart that says no and must be
// ARGUED; a void is a chart that is silent and must be OBTAINED. They route
// work to different people, which is why the union has three members and the
// UI has three treatments.

export const EVIDENCE_STATES = ['met', 'gap', 'void'] as const;
export type EvidenceState = (typeof EVIDENCE_STATES)[number];

export interface EvidenceCounts {
  met: number;
  gap: number;
  void: number;
}

/**
 * Counts, or the fact that they are not known yet.
 *
 * ── Why this is not a fourth state ──────────────────────────────────────────
 *
 * ADR-003 fixes `EvidenceState` as a CLOSED three-member union, shared across
 * three languages. "Not loaded" is not a fourth thing a chart can say about a
 * criterion — it is a statement about the *reader*, not the evidence. Adding it
 * to the union would put a UI concern into a clinical contract and break every
 * exhaustive match in every language.
 *
 * So it wraps the counts instead. The three states stay closed; what changes is
 * that a caller must now say whether it has them.
 *
 * ── The defect this closes ──────────────────────────────────────────────────
 *
 * `countStates` seeds `{met: 0, gap: 0, void: 0}`, which is correct for a
 * loaded case with no entries and indistinguishable from a case still
 * hydrating. `blockedOn` falls through every `> 0` check on all-zero counts and
 * returns **"Ready to draft"** — so a partially loaded case tells a coordinator
 * it is ready. The zeros are honest; the missing distinction is what is not.
 */
export type EvidenceTally =
  | { readonly loaded: true; readonly counts: EvidenceCounts }
  | { readonly loaded: false };

/** The tally for counts that have arrived. */
export function loadedTally(counts: EvidenceCounts): EvidenceTally {
  return { loaded: true, counts };
}

/** The tally for a case whose evidence has not arrived yet. */
export function pendingTally(): EvidenceTally {
  return { loaded: false };
}

/**
 * Counts if loaded, otherwise null.
 *
 * For callers that genuinely have something to do in both cases. A caller that
 * would render clinical text should branch on `loaded` instead, so the compiler
 * makes it handle the unloaded case rather than letting `null` decay into
 * zeros.
 */
export function countsOrNull(tally: EvidenceTally): EvidenceCounts | null {
  return tally.loaded ? tally.counts : null;
}

/** Token role per state. Colour is reinforcement; the label carries meaning. */
export const evidenceTokenRole: Record<EvidenceState, string> = {
  met: 'status-met',
  gap: 'status-gap',
  void: 'status-void',
};

export const evidenceLabel: Record<EvidenceState, string> = {
  met: 'Met',
  gap: 'Not met',
  void: 'Not documented',
};

/** What the state asks a human to do — the reason the distinction exists. */
export const evidenceAction: Record<EvidenceState, string> = {
  met: 'Cite it',
  gap: 'Argue it',
  void: 'Obtain it',
};
