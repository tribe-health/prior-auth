export interface DenialDetermination {
  readonly id: string;
  readonly caseId: string;
  readonly outcome: 'denied' | 'partial';
  readonly decidedOn: string;
  readonly reasonCode: string | null;
  readonly reasonText: string;
  readonly appealDeadline: string | null;
  readonly documentId: string;
  readonly documentName: string;
  readonly responseMode: DenialResponseMode | null;
  readonly createdAt: string;
}

export type DenialResponseMode = 'corrected_resubmission' | 'clinical_appeal';

export interface ResponseModeReceipt {
  readonly commandId: string;
  readonly caseId: string;
  readonly determinationId: string;
  readonly mode: DenialResponseMode;
  readonly committedAt: string;
}

export interface DenialDraft {
  readonly documentId: string;
  readonly decidedOn: string;
  readonly reasonCode: string;
  readonly reasonText: string;
  readonly appealDeadline: string;
}

export const EMPTY_DENIAL_DRAFT: DenialDraft = Object.freeze({
  documentId: '',
  decidedOn: '',
  reasonCode: 'medical-necessity',
  reasonText: '',
  appealDeadline: '',
});
