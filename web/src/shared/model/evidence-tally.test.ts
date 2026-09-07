/**
 * "Not loaded" is not "nothing outstanding".
 *
 * `countStates` seeds `{met: 0, gap: 0, void: 0}`, which is correct for a loaded
 * case with no matching entries and **identical** to a case still hydrating.
 * Downstream that ambiguity produced a clinical claim: `blockedOn` fell through
 * every `> 0` check and returned "Ready to draft".
 *
 * These assert the distinction now exists, and that it did not arrive by adding
 * a fourth evidence state — ADR-003 fixes that union at three members, shared
 * across three languages.
 */
import { describe, expect, it } from 'vitest';

import {
  EVIDENCE_STATES,
  countsOrNull,
  loadedTally,
  pendingTally,
  type EvidenceCounts,
} from './evidence-state';

const empty: EvidenceCounts = { met: 0, gap: 0, void: 0 };

describe('EvidenceTally', () => {
  it('distinguishes a loaded empty case from an unloaded one', () => {
    // The whole point. Before, both were `{met: 0, gap: 0, void: 0}`.
    const loaded = loadedTally(empty);
    const pending = pendingTally();

    expect(loaded.loaded).toBe(true);
    expect(pending.loaded).toBe(false);
    expect(loaded).not.toEqual(pending);
  });

  it('carries the counts when loaded', () => {
    const tally = loadedTally({ met: 4, gap: 3, void: 1 });
    expect(countsOrNull(tally)).toEqual({ met: 4, gap: 3, void: 1 });
  });

  it('carries no counts when not loaded', () => {
    expect(countsOrNull(pendingTally())).toBeNull();
  });

  it('preserves a loaded all-zero tally as loaded', () => {
    // A case genuinely having nothing outstanding must not be mistaken for one
    // that has not loaded — the inverse of the original defect.
    const tally = loadedTally(empty);
    expect(countsOrNull(tally)).toEqual(empty);
  });

  it('does NOT add a fourth evidence state', () => {
    // ADR-003: a closed three-member union, shared across three languages.
    // "Not loaded" is a statement about the reader, not about the evidence, so
    // it wraps the counts instead of joining the union.
    expect(EVIDENCE_STATES).toEqual(['met', 'gap', 'void']);
    expect(EVIDENCE_STATES).toHaveLength(3);
  });

  it('narrows to counts through the discriminant', () => {
    // Type-level intent, asserted at runtime: `loaded` is what makes `counts`
    // reachable, so a caller cannot read counts without checking.
    const tally = loadedTally({ met: 1, gap: 0, void: 0 });
    if (tally.loaded) {
      expect(tally.counts.met).toBe(1);
    } else {
      throw new Error('expected a loaded tally');
    }
  });
});
