// Wire types mirror aso_host::affirmation; GateState adapts the committed
// snapshot for the existing affirmation list.

export const GATE_KINDS = ['policy', 'section', 'pathway', 'plan'] as const;
export type GateAffirmationKind = (typeof GATE_KINDS)[number];

export interface GateState {
  affirmed: boolean;
  outstanding: GateAffirmationKind[];
}

export interface GateSnapshot {
  caseId: string;
  affirmed: GateAffirmationKind[];
  gateAffirmedAt: string | null;
  gateAffirmedBy: string | null;
}

export interface GateMutation {
  commandId: string;
  kind: GateAffirmationKind;
}

export interface GateCommandResult extends GateMutation {
  caseId: string;
  action: 'affirm' | 'remove';
  gate: GateSnapshot;
  committedAt: string;
}

export function gateStateFromSnapshot(snapshot: GateSnapshot): GateState {
  const outstanding = GATE_KINDS.filter((kind) => !snapshot.affirmed.includes(kind));
  return { affirmed: outstanding.length === 0, outstanding };
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
