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
