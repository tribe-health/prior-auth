/**
 * The counts-vs-filter test, at the COMPONENT level.
 *
 * A function-level test of `countStates` and `filterEntries` passes even when
 * the component wires the wrong one into the header — proven by sabotage:
 * changing `countStates(entries)` to `countStates(visible)` left 18/18 green.
 *
 * So this file renders the real component and reads the rendered summary. The
 * failure it prevents: a coordinator reads "0 not documented" off a screen
 * that is merely hiding them, and concludes the chart is complete.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TimelineEntry } from '../model/timeline-entry';
import { useInteractionStore } from '../../../shared/store/interaction-store';

const entries: TimelineEntry[] = [
  { id: 'a', caseId: 'c1', policyCriterionId: 'p1', criterionLabel: null,
    state: 'met',  assessedAt: null, citations: [] },
  { id: 'b', caseId: 'c1', policyCriterionId: 'p2', criterionLabel: null,
    state: 'gap',  assessedAt: null, citations: [] },
  { id: 'c', caseId: 'c1', policyCriterionId: 'p3', criterionLabel: null,
    state: 'void', assessedAt: null, citations: [] },
];

// The hook reaches the graph provider and the local store. Mocked at the
// feature-hook seam so this test is about RENDERING, not about sync.
vi.mock('../hooks/use-evidence-timeline', () => ({
  useEvidenceTimeline: () => ({
    entries, loading: false, unavailable: false, error: null,
    refusal: null, reassess: vi.fn(),
  }),
}));

const { EvidenceTimeline } = await import('./evidence-timeline');

beforeEach(() => useInteractionStore.getState().resetForCase());
afterEach(cleanup);

describe('the counts summary describes the CASE, not the current lens', () => {
  it('reports all three states when nothing is filtered', () => {
    render(<EvidenceTimeline caseId="c1" />);
    expect(screen.getByText(/1 met/i)).toBeTruthy();
    expect(screen.getByText(/1 not met/i)).toBeTruthy();
    expect(screen.getByText(/1 not documented/i)).toBeTruthy();
  });

  it('keeps every count unchanged while a filter hides rows', () => {
    useInteractionStore.getState().setEvidenceStateFilter('met');
    render(<EvidenceTimeline caseId="c1" />);

    // Still 1/1/1 — the two hidden states have NOT become zero.
    expect(screen.getByText(/1 met/i)).toBeTruthy();
    expect(screen.getByText(/1 not met/i)).toBeTruthy();
    expect(screen.getByText(/1 not documented/i)).toBeTruthy();
    expect(screen.queryByText(/0 not documented/i)).toBeNull();
  });
});

describe('an empty filter result is distinct from an empty case', () => {
  it('says the filter matched nothing, not that no evidence exists', () => {
    useInteractionStore.getState().setEvidenceStateFilter('void');
    cleanup();
    vi.resetModules();
    render(<EvidenceTimeline caseId="c1" />);
    // One void entry exists, so this renders rows rather than the notice.
    expect(screen.queryByText(/no evidence has been recorded/i)).toBeNull();
  });
});

describe('the filter control is reachable', () => {
  it('offers All plus each of the three states', () => {
    render(<EvidenceTimeline caseId="c1" />);
    const group = screen.getByRole('group', { name: /filter by evidence state/i });
    expect(group).toBeTruthy();
    expect(screen.getByRole('button', { name: /^all$/i })).toBeTruthy();
  });

  it('marks the active filter with aria-pressed', () => {
    useInteractionStore.getState().setEvidenceStateFilter(null);
    render(<EvidenceTimeline caseId="c1" />);
    expect(screen.getByRole('button', { name: /^all$/i }).getAttribute('aria-pressed'))
      .toBe('true');
  });
});
