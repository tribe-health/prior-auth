import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { graphState } = vi.hoisted(() => ({
  graphState: {
    lists: { 'replica:cases': { ids: ['case-1'] } },
    entities: {
      Case: {
        'case-1': {
          id: 'case-1',
          practice_id: 'practice-1',
          gate_affirmed_at: new Date('2026-09-15T12:00:00Z'),
        },
      },
    },
  },
}));

vi.mock('@prometheus-ags/entity-graph-react', () => ({
  useGraphStore: (selector: (state: typeof graphState) => unknown) => selector(graphState),
}));

vi.mock('zustand/react/shallow', () => ({
  useShallow: <T,>(selector: T) => selector,
}));

import { useCommittedCaseGate } from './use-committed-case-gate';

describe('useCommittedCaseGate', () => {
  it('accepts PGlite Date values and exposes a stable ISO affirmation revision', () => {
    const { result } = renderHook(() => useCommittedCaseGate('case-1', 'practice-1'));
    expect(result.current).toEqual({
      status: 'affirmed',
      affirmedAt: '2026-09-15T12:00:00.000Z',
    });
  });
});
