import type { EvidenceCounts } from '../../../shared/model/evidence-state';

export interface CaseSummary {
  id: string;
  caseNumber: string;
  patientName: string;
  payerName: string;
  surgeonName: string;
  status: string;
  gateAffirmed: boolean;
  evidence: EvidenceCounts;
}

/** What the case is waiting on, in the words a coordinator would use.
 *  Derived rather than stored so it cannot drift from the counts it describes. */
export function blockedOn(c: CaseSummary): string {
  // BOTH outstanding states are reported, never just the first.
  //
  // An earlier version returned on the first non-zero state, so a case with
  // {met: 4, gap: 3, void: 1} read "1 document to obtain" and never mentioned
  // the three contradictions needing a surgeon's argument. The coordinator
  // obtains the document, the case still does not advance, and nobody can see
  // why. That is worse than ADR-003's collapse warning: the gap was not merged
  // into the void, it was HIDDEN BEHIND it.
  //
  // The two states route work to DIFFERENT people — a void is obtained by a
  // coordinator, a gap is argued by a surgeon — so a worklist that names only
  // one of them dispatches half the work.
  const outstanding: string[] = [];

  if (c.evidence.void > 0) {
    outstanding.push(`${c.evidence.void} document${c.evidence.void > 1 ? 's' : ''} to obtain`);
  }
  if (c.evidence.gap > 0) {
    outstanding.push(`${c.evidence.gap} contradiction${c.evidence.gap > 1 ? 's' : ''} to argue`);
  }
  if (outstanding.length > 0) return outstanding.join(' · ');

  if (!c.gateAffirmed) return 'A surgeon affirmation';
  return 'Ready to draft';
}
