import type { CaseStatus } from './case-record';

export interface CaseInput {
  readonly caseNumber: string;
  readonly patientId: string;
  readonly surgeonId: string;
  readonly coordinatorId: string | null;
  readonly facilityId: string | null;
  readonly payerId: string;
  readonly memberId: string | null;
  readonly dateOfService: string | null;
  readonly procedureCode: string | null;
  readonly planKey: string | null;
  readonly data: Readonly<Record<string, unknown>>;
}

export const RESOLUTION_INPUT_FIELDS = [
  'memberId',
  'planKey',
  'procedureCode',
  'dateOfService',
] as const;

export type ResolutionInputField = (typeof RESOLUTION_INPUT_FIELDS)[number];

export const CASE_INPUTS_INCOMPLETE_MESSAGE =
  'Complete the member, plan, procedure, and service date before continuing.';

export function firstMissingResolutionInput(input: CaseInput): ResolutionInputField | null {
  return RESOLUTION_INPUT_FIELDS.find((field) => {
    const value = input[field];
    return value == null || value.trim() === '';
  }) ?? null;
}

export function isResolutionInputField(value: string | null): value is ResolutionInputField {
  return value != null && RESOLUTION_INPUT_FIELDS.includes(value as ResolutionInputField);
}

export interface CaseDetailRecord extends CaseInput {
  readonly id: string;
  readonly practiceId: string;
  readonly status: CaseStatus;
  readonly gateAffirmedAt: string | null;
  readonly gateAffirmedBy: string | null;
  readonly revision: number;
  readonly caseInputRevision: number;
  readonly statusRevision: number;
  readonly documentSetRevision: number;
  readonly createdAt: string;
  readonly updatedAt: string | null;
}

export interface CaseCommandReceipt {
  readonly commandId: string;
  readonly action: 'create' | 'update' | 'transition';
  readonly caseId: string;
  readonly committedAt: string;
}

export interface CreateCaseMutation {
  readonly commandId: string;
  readonly caseId: string;
  readonly input: CaseInput;
}

export interface UpdateCaseMutation {
  readonly commandId: string;
  readonly expectedRevision: number;
  readonly input: CaseInput;
}

export interface TransitionCaseMutation {
  readonly commandId: string;
  readonly expectedStatusRevision: number;
  readonly targetStatus: CaseStatus;
}

export const EMPTY_CASE_INPUT: CaseInput = Object.freeze({
  caseNumber: '',
  patientId: '',
  surgeonId: '',
  coordinatorId: null,
  facilityId: null,
  payerId: '',
  memberId: null,
  dateOfService: null,
  procedureCode: null,
  planKey: null,
  data: Object.freeze({}),
});
