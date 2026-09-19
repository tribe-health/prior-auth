export interface SigningTarget {
  letterId: string;
  caseId: string;
  letterVersion: number;
  qaRevision: number;
  signatureVersion: number | null;
  status: string;
  approvedByActor: boolean;
  isCurrent: boolean;
  gateAffirmed: boolean;
  qaComplete: boolean;
  sourcesComplete: boolean;
}

export interface SignLetterResult {
  commandId: string;
  letterId: string;
  caseId: string;
  letterVersion: number;
  qaRevision: number;
  signatureId: string;
  signatureVersion: number;
  signedAt: string;
}

export function signingBlockers(target: SigningTarget): readonly string[] {
  const blockers: string[] = [];
  if (target.status !== 'approved' || !target.approvedByActor || !target.isCurrent) {
    blockers.push('The current letter revision is not approved by this surgeon.');
  }
  if (!target.gateAffirmed) blockers.push('Surgeon affirmation is required at step 06.');
  if (!target.qaComplete) blockers.push('Letter QA has a blocking item.');
  if (!target.sourcesComplete) blockers.push('Every assertion needs a source document.');
  if (target.signatureVersion === null) blockers.push('The signature revision is unavailable.');
  return blockers;
}
