import { useCallback, useId, useMemo } from 'react';

import {
  useRequiredSession,
  useSessionEpoch,
} from '@/app/providers/session-provider';
import { viewScope } from '@/shared/scoped-view-store';
import { useScopedViewStore } from '@/shared/use-scoped-view-store';
import type { CaseStatus } from '../model/case-record';

export type CaseStatusFilter = 'all' | CaseStatus;

export interface CaseQueueViewState {
  readonly search: string;
  readonly statusFilter: CaseStatusFilter;
  readonly selectedCaseId: string | null;
}

const INITIAL_QUEUE_VIEW: CaseQueueViewState = Object.freeze({
  search: '',
  statusFilter: 'all',
  selectedCaseId: null,
});

/** Own transient queue interaction state for exactly one mounted view. */
export function useCaseQueueView() {
  const session = useRequiredSession();
  const epoch = useSessionEpoch();
  const viewInstanceId = useId();
  const scope = useMemo(
    () => viewScope(session, epoch, 'case-queue', viewInstanceId),
    [epoch, session, viewInstanceId],
  );
  const [state, lease] = useScopedViewStore(scope, () => INITIAL_QUEUE_VIEW);

  const setSearch = useCallback((search: string) => {
    lease.publish((current) => ({ ...current, search }));
  }, [lease]);
  const setStatusFilter = useCallback((statusFilter: CaseStatusFilter) => {
    lease.publish((current) => ({ ...current, statusFilter }));
  }, [lease]);
  const selectCase = useCallback((selectedCaseId: string | null) => {
    lease.publish((current) => ({ ...current, selectedCaseId }));
  }, [lease]);
  const reset = useCallback(() => {
    lease.publish(() => INITIAL_QUEUE_VIEW);
  }, [lease]);

  return {
    state,
    setSearch,
    setStatusFilter,
    selectCase,
    reset,
  } as const;
}
