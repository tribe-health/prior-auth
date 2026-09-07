/**
 * `tallyStates` — the safe entry point.
 *
 * `countStates(entries)` cannot express "I have no entries because none have
 * arrived". Passing it `[]` in that situation is what produced a mid-hydration
 * case reporting "Ready to draft", so the load state has to be an argument
 * rather than an inference.
 */
import { describe, expect, it } from 'vitest';

import { countStates, tallyStates } from './evidence-timeline';

// Structural fixtures. `TimelineEntry` is deliberately not exported, and
// widening a component's public surface for a test would be the wrong trade —
// only `state` is read by the functions under test.
const entries = [
  { state: 'met' },
  { state: 'gap' },
  { state: 'gap' },
  { state: 'void' },
] as unknown as Parameters<typeof countStates>[0];

describe('tallyStates', () => {
  it('reports a mid-hydration timeline as NOT loaded', () => {
    // null entries = "not arrived", which is a different fact from "arrived
    // and empty" and must not read as all-zero counts.
    const tally = tallyStates(null);
    expect(tally.loaded).toBe(false);
  });

  it('reports a loaded empty timeline as loaded, with zeros', () => {
    const tally = tallyStates([]);
    expect(tally).toEqual({ loaded: true, counts: { met: 0, gap: 0, void: 0 } });
  });

  it('a mid-hydration timeline does not equal a loaded empty one', () => {
    // The exact confusion the change exists to remove.
    expect(tallyStates(null)).not.toEqual(tallyStates([]));
  });

  it('counts each state when loaded', () => {
    const tally = tallyStates(entries);
    expect(tally).toEqual({ loaded: true, counts: { met: 1, gap: 2, void: 1 } });
  });

  it('agrees with countStates for loaded entries', () => {
    // tallyStates only wraps; it must not change the arithmetic.
    const tally = tallyStates(entries);
    if (!tally.loaded) throw new Error('expected loaded');
    expect(tally.counts).toEqual(countStates(entries));
  });
});
