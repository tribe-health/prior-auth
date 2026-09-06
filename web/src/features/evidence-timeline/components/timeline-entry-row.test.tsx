/**
 * The void-does-not-collapse test.
 *
 * ADR-003's whole claim is that `void` is not a weak `gap`. `audit.sh` check 6
 * defends the union in the model; nothing mechanical defends the rendering, so
 * this file does.
 *
 * The failure being prevented is specific and quiet: a `void` shown as a `gap`
 * tells a coordinator to ARGUE a document that does not exist, instead of
 * OBTAINING it. Both look like work getting done.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { TimelineEntryRow } from './timeline-entry-row';
import { countStates } from './evidence-timeline';
import type { TimelineEntry } from '../model/timeline-entry';

afterEach(cleanup);

const base: Omit<TimelineEntry, 'state' | 'citations'> = {
  id: 'e1',
  caseId: 'c1',
  policyCriterionId: 'pc1',
  criterionLabel: 'Six weeks conservative care documented',
  assessedAt: '2026-03-01T00:00:00Z',
};

const entry = (over: Partial<TimelineEntry> = {}): TimelineEntry => ({
  ...base,
  state: 'met',
  citations: [],
  ...over,
});

describe('a void row asks for the document to be obtained', () => {
  it('renders "Obtain it", never "Argue it"', () => {
    render(<TimelineEntryRow entry={entry({ state: 'void' })} />);

    expect(screen.getByText('Obtain it')).toBeTruthy();
    // The collapse this test exists to catch.
    expect(screen.queryByText('Argue it')).toBeNull();
  });

  it('labels itself "Not documented", not "Not met"', () => {
    render(<TimelineEntryRow entry={entry({ state: 'void' })} />);

    expect(screen.getByText('Not documented')).toBeTruthy();
    expect(screen.queryByText('Not met')).toBeNull();
  });

  it('carries a distinct state marker from a gap row', () => {
    const { container: voidRow } = render(<TimelineEntryRow entry={entry({ state: 'void' })} />);
    const v = voidRow.querySelector("[data-evidence-state='void']");
    expect(v).toBeTruthy();
    expect(voidRow.querySelector("[data-evidence-state='gap']")).toBeNull();
  });
});

describe('a gap row asks for the opposite', () => {
  it('renders "Argue it", never "Obtain it"', () => {
    render(<TimelineEntryRow entry={entry({ state: 'gap' })} />);

    expect(screen.getByText('Argue it')).toBeTruthy();
    expect(screen.queryByText('Obtain it')).toBeNull();
  });
});

describe('an unsourced assertion is visible', () => {
  it('flags a met entry with no citation', () => {
    render(<TimelineEntryRow entry={entry({ state: 'met', citations: [] })} />);
    expect(screen.getByText(/no citation on file/i)).toBeTruthy();
  });

  it('does not flag a met entry that has one', () => {
    render(
      <TimelineEntryRow
        entry={entry({
          state: 'met',
          citations: [
            {
              id: 'cit1',
              documentId: 'd1',
              documentName: 'PT Discharge Summary',
              effectiveDate: '2026-02-10',
              pageNumber: 3,
              relevance: 'primary',
            },
          ],
        })}
      />,
    );

    expect(screen.queryByText(/no citation on file/i)).toBeNull();
    expect(screen.getByText(/PT Discharge Summary · 2026-02-10 · p.3/)).toBeTruthy();
  });

  it('says so when the criterion text is not synced', () => {
    render(<TimelineEntryRow entry={entry({ criterionLabel: null })} />);
    // Not a UUID. A UUID where a sentence belongs reads as working software.
    expect(screen.getByText(/criterion unavailable offline/i)).toBeTruthy();
  });
});

describe('counting states keeps all three', () => {
  it('reports zero for a state with no entries rather than omitting it', () => {
    const counts = countStates([entry({ state: 'met' }), entry({ state: 'met' })]);
    expect(counts).toEqual({ met: 2, gap: 0, void: 0 });
  });

  it('counts void separately from gap', () => {
    const counts = countStates([entry({ state: 'gap' }), entry({ state: 'void' })]);
    expect(counts.gap).toBe(1);
    expect(counts.void).toBe(1);
  });
});
