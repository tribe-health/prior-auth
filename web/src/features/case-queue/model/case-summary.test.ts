/**
 * The worklist must not hide one outstanding state behind another.
 *
 * ADR-003's whole claim is that `gap` and `void` route work to DIFFERENT
 * people: a void is a silent chart, obtained by a coordinator; a gap is a
 * chart that says no, argued by a surgeon. A summary naming only one of them
 * dispatches half the work and nobody can see the other half.
 *
 * Found by adversarial review 2026-09-06: the original returned on the first
 * non-zero state, so {met:4, gap:3, void:1} read "1 document to obtain" and
 * never mentioned the three contradictions. There was no test file at all.
 */
import { loadedTally, pendingTally } from '../../../shared/model/evidence-state';
import { describe, expect, it } from 'vitest';

import { blockedOn, type CaseSummary, blockedOnTally } from './case-summary';

const caseWith = (
  evidence: CaseSummary['evidence'],
  gateAffirmed = false,
): CaseSummary => ({
  id: 'c1',
  caseNumber: 'ASO-2026-0001',
  patientName: 'Kaminski, Ruth',
  payerName: 'BCBS',
  surgeonName: 'Rivera',
  status: 'in_progress',
  gateAffirmed,
  evidence,
});

describe('a case waiting on both states names both', () => {
  it('reports the gap as well as the void', () => {
    const summary = blockedOn(caseWith({ met: 4, gap: 3, void: 1 }));

    // The regression: "1 document to obtain" with no mention of the gaps.
    expect(summary).toMatch(/1 document to obtain/);
    expect(summary).toMatch(/3 contradictions to argue/);
  });

  it('names only the void when there are no gaps', () => {
    expect(blockedOn(caseWith({ met: 4, gap: 0, void: 2 })))
      .toBe('2 documents to obtain');
  });

  it('names only the gap when there are no voids', () => {
    expect(blockedOn(caseWith({ met: 4, gap: 1, void: 0 })))
      .toBe('1 contradiction to argue');
  });
});

describe('evidence outranks the gate', () => {
  it('does not ask for an affirmation while evidence is still outstanding', () => {
    // A surgeon cannot usefully affirm a case whose chart is incomplete.
    const summary = blockedOn(caseWith({ met: 0, gap: 0, void: 1 }, false));
    expect(summary).not.toMatch(/affirmation/i);
    expect(summary).toMatch(/to obtain/);
  });

  it('asks for the affirmation once evidence is settled', () => {
    expect(blockedOn(caseWith({ met: 5, gap: 0, void: 0 }, false)))
      .toBe('A surgeon affirmation');
  });

  it('is ready to draft when evidence is settled and the gate is affirmed', () => {
    expect(blockedOn(caseWith({ met: 5, gap: 0, void: 0 }, true)))
      .toBe('Ready to draft');
  });
});

describe('singular and plural read correctly', () => {
  it('uses the singular for one', () => {
    expect(blockedOn(caseWith({ met: 0, gap: 1, void: 1 })))
      .toBe('1 document to obtain · 1 contradiction to argue');
  });
});

/**
 * No clinical sentence from counts that have not arrived.
 *
 * The defect: `blockedOn` falls through every `> 0` check on `{0, 0, 0}` and
 * returns **"Ready to draft"**. A case still hydrating therefore told a
 * coordinator it was ready to send — a clinical claim derived from rows that
 * had not loaded.
 */
describe('blockedOnTally — load state gates the sentence', () => {
  it('returns no sentence at all while evidence is unloaded', () => {
    // Null, not a placeholder string: a caller cannot accidentally render it.
    expect(blockedOnTally(pendingTally(), false)).toBeNull();
  });

  it('does NOT say "Ready to draft" for an unloaded case', () => {
    // The exact regression. Same inputs that previously produced it, except
    // that the tally now says the counts are unknown.
    expect(blockedOnTally(pendingTally(), true)).not.toBe('Ready to draft');
    expect(blockedOnTally(pendingTally(), true)).toBeNull();
  });

  it('says "Ready to draft" for a LOADED case with nothing outstanding', () => {
    // The inverse must still work — a genuinely clear case is not suppressed.
    expect(blockedOnTally(loadedTally({ met: 4, gap: 0, void: 0 }), true)).toBe(
      'Ready to draft',
    );
  });

  it('reports both outstanding states for a loaded case', () => {
    // Unchanged behaviour, asserted here so the refactor cannot quietly drop
    // the both-states rule that ADR-003 and this file's own comment demand.
    expect(blockedOnTally(loadedTally({ met: 4, gap: 3, void: 1 }), true)).toBe(
      '1 document to obtain · 3 contradictions to argue',
    );
  });

  it('asks for affirmation when evidence is clear but the gate is not', () => {
    expect(blockedOnTally(loadedTally({ met: 4, gap: 0, void: 0 }), false)).toBe(
      'A surgeon affirmation',
    );
  });

  it('agrees with blockedOn for a loaded summary', () => {
    // The two entry points must not diverge; blockedOn is retained for callers
    // that already hold a complete summary.
    const summary = caseWith({ met: 4, gap: 3, void: 1 });
    expect(blockedOnTally(loadedTally(summary.evidence), summary.gateAffirmed)).toBe(
      blockedOn(summary),
    );
  });
});
