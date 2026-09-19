import { useMemo } from 'react';
import { useGraphStore } from '@prometheus-ags/entity-graph-react';
import { useShallow } from 'zustand/react/shallow';

export type CommittedCaseGateState =
  | { readonly status: 'pending' }
  | { readonly status: 'unavailable' }
  | { readonly status: 'not-affirmed' }
  | { readonly status: 'affirmed'; readonly affirmedAt: string };

/** Read navigation authority from the committed case projection. */
export function useCommittedCaseGate(
  caseId: string,
  expectedPracticeId: string,
): CommittedCaseGateState {
  const selection = useGraphStore(useShallow((state) => ({
    caseIds: state.lists['replica:cases']?.ids ?? null,
    row: state.entities.Case?.[caseId] ?? null,
  })));

  return useMemo(() => {
    if (selection.caseIds === null) return { status: 'pending' };
    if (!selection.caseIds.includes(caseId) || !selection.row) return { status: 'unavailable' };
    if (selection.row.practice_id !== expectedPracticeId) return { status: 'unavailable' };
    const affirmedAt = selection.row.gate_affirmed_at;
    if (affirmedAt === null) return { status: 'not-affirmed' };
    if (affirmedAt instanceof Date && !Number.isNaN(affirmedAt.valueOf())) {
      return { status: 'affirmed', affirmedAt: affirmedAt.toISOString() };
    }
    if (typeof affirmedAt === 'string' && affirmedAt.length > 0) {
      return { status: 'affirmed', affirmedAt };
    }
    return { status: 'unavailable' };
  }, [caseId, expectedPracticeId, selection]);
}
