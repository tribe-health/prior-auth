export type EvidenceState = 'met' | 'gap' | 'void';

export interface EvidenceCitationSnapshot {
  readonly id: string;
  readonly documentId: string;
  readonly pageNumber: number;
  readonly quote: string;
  readonly relevance: 'supports' | 'contradicts' | 'context';
  readonly documentEffectiveDate: string;
  readonly contentSha256Text: string;
}

export interface EvidenceItemSnapshot {
  readonly id: string;
  readonly criterionId: string;
  readonly criterionLabel: string;
  readonly criterionRequirement: string;
  readonly state: EvidenceState;
  readonly rationale: string;
  readonly assessedAt: string;
  readonly revision: number;
  readonly citations: readonly EvidenceCitationSnapshot[];
}

export interface EvidenceSnapshot {
  readonly caseId: string;
  readonly evidenceRevision: string;
  readonly evidenceWorkRevision: string;
  readonly entries: readonly EvidenceItemSnapshot[];
}

export interface EvidenceInput {
  readonly id: string;
  readonly criterionId: string;
  readonly expectedState: EvidenceState;
  readonly documentId: string | null;
  readonly pageNumber: number | null;
  readonly quote: string | null;
  readonly rationale: string;
}

export interface AssembleEvidenceMutation {
  readonly commandId: string;
  readonly expectedRevisions: {
    readonly documentSetRevision: string;
    readonly criteriaSelectionRevision: string;
    readonly evidenceWorkRevision: string;
  };
  readonly evidenceInputs: readonly EvidenceInput[];
}

export interface EvidenceCommandReceipt {
  readonly commandId: string;
  readonly caseId: string;
  readonly evidenceRevision: string;
  readonly committedAt: string;
}
