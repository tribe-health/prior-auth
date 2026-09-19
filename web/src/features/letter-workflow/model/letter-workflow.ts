export interface LetterClaim {
  readonly id: string;
  readonly ordinal: number;
  readonly claimText: string;
  readonly documentId: string;
  readonly documentName: string;
  readonly pageNumber: number;
  readonly sourceQuote: string;
  readonly sourceDate: string;
  readonly supportStatus: 'pending' | 'supported' | 'unsupported';
}

export interface LetterSnapshot {
  readonly id: string;
  readonly caseId: string;
  readonly purpose: 'prior_authorization_request' | 'corrected_resubmission' | 'clinical_appeal';
  readonly version: number;
  readonly status: 'draft' | 'in_review' | 'approved' | 'signed' | 'superseded';
  readonly bodyMarkdown: string;
  readonly contentSha256Text: string;
  readonly generatedAt: string;
  readonly approvedAt: string | null;
  readonly signedAt: string | null;
  readonly qaRevision: number;
  readonly revision: number;
  readonly claims: readonly LetterClaim[];
}

export interface LetterCommandReceipt {
  readonly commandId: string;
  readonly letterId: string;
  readonly caseId: string;
  readonly letterVersion: number;
  readonly qaRevision: number;
  readonly status: string;
  readonly committedAt: string;
}
