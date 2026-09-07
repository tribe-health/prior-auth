import type { EvidenceCounts, EvidenceTally } from '../../../shared/model/evidence-state';

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

/**
 * What the case is waiting on, when its evidence is known.
 *
 * Takes an {@link EvidenceTally} rather than a `CaseSummary` so an unloaded case
 * cannot reach the sentence-building path at all. Before this, all-zero counts
 * fell through every `> 0` check and returned **"Ready to draft"** — so a case
 * still hydrating told a coordinator it was ready to send. The counts were
 * honest; nothing distinguished "nothing outstanding" from "nothing known yet".
 */
export function blockedOnTally(tally: EvidenceTally, gateAffirmed: boolean): string | null {
  // Not a sentence. A caller that renders this must show a loading treatment,
  // and returning null rather than a placeholder string means it cannot
  // accidentally print one.
  if (!tally.loaded) return null;
  return describeOutstanding(tally.counts, gateAffirmed);
}

/** What the case is waiting on, in the words a coordinator would use.
 *  Derived rather than stored so it cannot drift from the counts it describes.
 *
 *  Retained for callers holding a fully-loaded summary. Prefer
 *  {@link blockedOnTally} where the load state is in question. */
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
  return describeOutstanding(c.evidence, c.gateAffirmed);
}

/** The sentence itself, given counts that are known to have arrived. */
function describeOutstanding(evidence: EvidenceCounts, gateAffirmed: boolean): string {
  const outstanding: string[] = [];

  if (evidence.void > 0) {
    outstanding.push(`${evidence.void} document${evidence.void > 1 ? 's' : ''} to obtain`);
  }
  if (evidence.gap > 0) {
    outstanding.push(`${evidence.gap} contradiction${evidence.gap > 1 ? 's' : ''} to argue`);
  }
  if (outstanding.length > 0) return outstanding.join(' · ');

  if (!gateAffirmed) return 'A surgeon affirmation';
  return 'Ready to draft';
}
