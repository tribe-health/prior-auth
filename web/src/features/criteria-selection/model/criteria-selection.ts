export interface CatalogCriterion {
  readonly id: string;
  readonly payerId: string;
  readonly practiceId: string | null;
  readonly evidenceGrade: 'published' | 'obtained_by_request';
  readonly policyId: string | null;
  readonly section: string | null;
  readonly ordinal: number;
  readonly documentId: string | null;
  readonly sourcePageNumber: number | null;
  readonly label: string;
  readonly requirement: string;
  readonly contentSha256: string;
  readonly procedureFamily: string | null;
  readonly isMandatory: boolean;
  readonly validFrom: string;
  readonly validTo: string | null;
  readonly supersededBy: string | null;
}

export interface CatalogPolicy {
  readonly id: string;
  readonly payerId: string;
  readonly name: string;
  readonly policyNumber: string;
  readonly version: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly sourceDocumentId: string;
}

export interface CriteriaCatalogSnapshot {
  readonly criteriaCatalogRevision: string;
  readonly criteria: readonly CatalogCriterion[];
  readonly policies: readonly CatalogPolicy[];
}

export interface CriteriaSelectionSnapshot {
  readonly caseId: string;
  readonly resolutionRevision: string;
  readonly criteriaCatalogRevision: string;
  readonly criteriaSelectionRevision: string;
  readonly criteriaSnapshotId: string;
  readonly policy: CatalogPolicy;
  readonly criteria: readonly CatalogCriterion[];
  readonly selectedBy: string;
  readonly selectedAt: string;
  readonly state: 'current' | 'stale';
}

export interface SelectCriteriaMutation {
  readonly commandId: string;
  readonly expectedRevisions: {
    readonly resolutionRevision: string;
    readonly criteriaCatalogRevision: string;
  };
  readonly criterionIds: readonly string[];
}

export interface CriteriaSelectionReceipt {
  readonly commandId: string;
  readonly caseId: string;
  readonly criteriaSelectionRevision: string;
  readonly committedAt: string;
}
