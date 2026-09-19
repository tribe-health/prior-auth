export const CASE_STATUSES = [
  'intake',
  'evidence',
  'policy_review',
  'awaiting_gate',
  'drafting',
  'ready',
  'submitted',
  'approved',
  'denied',
  'peer_review',
  'denial_review',
  'response_drafting',
  'response_ready',
  'resubmitted',
  'appealed',
  'withdrawn',
] as const;

export type CaseStatus = (typeof CASE_STATUSES)[number];

/** Exact identifier-only case row approved for the browser replica. */
export interface CaseRecord {
  readonly id: string;
  readonly practiceId: string;
  readonly caseNumber: string;
  readonly patientId: string;
  readonly surgeonId: string;
  readonly coordinatorId: string | null;
  readonly payerId: string;
  readonly status: CaseStatus;
  readonly dateOfService: string | null;
  readonly gateAffirmedAt: string | null;
  readonly updatedAt: string | null;
  readonly revision: number;
}
