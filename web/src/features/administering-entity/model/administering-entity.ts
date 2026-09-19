export const RESOLUTION_STATES = [
  'resolved',
  'missing',
  'ambiguous',
  'conflicting',
  'expired',
] as const;

export type ResolutionState = (typeof RESOLUTION_STATES)[number];

export interface AdministeringEntityResolution {
  readonly caseId: string;
  readonly entityId: string | null;
  readonly entityName: string | null;
  readonly criteriaSetKey: string | null;
  readonly submissionChannelKey: string | null;
  readonly appealPathKey: string | null;
  readonly sourceDocumentId: string | null;
  readonly sourceDocumentName: string | null;
  readonly sourceDocumentEffectiveDate: string | null;
  readonly sourceDocumentVersion: number | null;
  readonly entityRevision: number | null;
  readonly planRevision: number | null;
  readonly enrollmentRevision: number | null;
  readonly ruleRevision: number | null;
  readonly validFrom: string | null;
  readonly validTo: string | null;
  readonly state: ResolutionState;
  readonly revision: number;
  readonly caseInputRevision: number;
  readonly resolvedAt: string;
}

export interface ResolutionCommandReceipt {
  readonly commandId: string;
  readonly caseId: string;
  readonly state: ResolutionState;
  readonly resolutionRevision: number;
  readonly caseInputRevision: number;
  readonly committedAt: string;
  readonly entityId: string | null;
  readonly entityName: string | null;
  readonly criteriaSetKey: string | null;
  readonly submissionChannelKey: string | null;
  readonly appealPathKey: string | null;
  readonly sourceDocumentId: string | null;
  readonly sourceDocumentName: string | null;
  readonly sourceDocumentEffectiveDate: string | null;
  readonly validFrom: string | null;
  readonly validTo: string | null;
  readonly entityRevision: number | null;
  readonly planRevision: number | null;
  readonly enrollmentRevision: number | null;
  readonly ruleRevision: number | null;
  readonly sourceDocumentVersion: number | null;
}

export interface ResolveMutation {
  readonly commandId: string;
  readonly expectedCaseInputRevision: number;
}

export const RESOLUTION_COPY: Record<ResolutionState, {
  readonly label: string;
  readonly description: string;
}> = {
  resolved: {
    label: 'Resolved',
    description: 'The controlling entity and payer paths are version-matched.',
  },
  missing: {
    label: 'No active matching path',
    description: 'No active administering entity and delegation rule match this member, plan, procedure, and service date.',
  },
  ambiguous: {
    label: 'More than one entity',
    description: 'More than one administering entity matches. Configuration must be corrected.',
  },
  conflicting: {
    label: 'Conflicting paths',
    description: 'The matched entity has conflicting criteria or communication paths.',
  },
  expired: {
    label: 'Coverage path expired',
    description: 'A matching coverage path exists, but its effective period ended before the planned service date.',
  },
};
