// Mirrors aso_host::domain::GateState. The four kinds and the all-four rule
// live in the Rust core; this type exists so the UI can render outstanding
// affirmations without inventing a second definition of "affirmed".

export const GATE_KINDS = ['policy', 'section', 'pathway', 'plan'] as const;
export type GateAffirmationKind = (typeof GATE_KINDS)[number];

export interface GateState {
  affirmed: boolean;
  outstanding: GateAffirmationKind[];
}

export const gateKindLabel: Record<GateAffirmationKind, string> = {
  policy: 'Controlling policy',
  section: 'Criterion section',
  pathway: 'Surgical pathway',
  plan: 'Operative plan',
};

export const gateKindPrompt: Record<GateAffirmationKind, string> = {
  policy: 'This is the policy and version that governs this request on the date of service.',
  section: 'This is the section of that policy the request must satisfy.',
  pathway: 'This is the operation I intend to perform.',
  plan: 'The described levels, approach and extent match my operative plan.',
};
