import { useCallback, useEffect, useState } from 'react';

import { useRequiredSession } from '@/app/providers/session-provider';
import { administeringEntityApi } from '@/features/administering-entity/api/administering-entity-api';
import type { AdministeringEntityResolution } from '@/features/administering-entity/model/administering-entity';
import { caseApi } from '@/features/case-queue/api/case-api';
import type { CaseDetailRecord } from '@/features/case-queue/model/case-command';
import { ApiError } from '@/shared/api/http-client';
import { criteriaSelectionApi } from '../api/criteria-selection-api';
import type {
  CriteriaCatalogSnapshot,
  CriteriaSelectionSnapshot,
} from '../model/criteria-selection';

interface ReadyState {
  readonly status: 'ready' | 'saving';
  readonly caseRecord: CaseDetailRecord;
  readonly resolution: AdministeringEntityResolution;
  readonly catalog: CriteriaCatalogSnapshot;
  readonly selection: CriteriaSelectionSnapshot | null;
  readonly message: string | null;
}

type CriteriaSelectionView =
  | { readonly status: 'loading'; readonly message: null }
  | { readonly status: 'error'; readonly message: string }
  | ReadyState;

function message(cause: unknown): string {
  if (!(cause instanceof ApiError)) return 'The criteria selection could not be loaded.';
  switch (cause.code) {
    case 'criteria_selection_blocked':
      return 'Resolve the coverage path before selecting policy criteria.';
    case 'criteria_selection_invalid':
      return 'These criteria do not form one effective policy snapshot.';
    case 'stale_revision':
      return 'The coverage path or policy catalog changed. Review the current policy and try again.';
    case 'action_forbidden':
      return 'Your current access cannot select criteria for this case.';
    default:
      return 'The criteria service is temporarily unavailable. Your committed work is unchanged.';
  }
}

export function useCriteriaSelection(caseId: string) {
  const session = useRequiredSession();
  const [view, setView] = useState<CriteriaSelectionView>({ status: 'loading', message: null });

  const load = useCallback(async () => {
    setView({ status: 'loading', message: null });
    try {
      const [caseRecord, resolution] = await Promise.all([
        caseApi.read(caseId, session.practiceId),
        administeringEntityApi.read(caseId, session.practiceId),
      ]);
      const catalog = await criteriaSelectionApi.catalog(caseRecord.payerId, session.practiceId);
      let selection: CriteriaSelectionSnapshot | null = null;
      try {
        selection = await criteriaSelectionApi.read(caseId, session.practiceId);
      } catch (cause) {
        if (!(cause instanceof ApiError && cause.status === 404)) throw cause;
      }
      setView({ status: 'ready', caseRecord, resolution, catalog, selection, message: null });
    } catch (cause) {
      setView({ status: 'error', message: message(cause) });
    }
  }, [caseId, session.practiceId]);

  useEffect(() => { void load(); }, [load]);

  const selectPolicy = useCallback(async (policyId: string) => {
    if (view.status !== 'ready') return;
    const criteria = view.catalog.criteria.filter((criterion) =>
      criterion.policyId === policyId && criterion.supersededBy === null);
    if (criteria.length === 0 || view.resolution.state !== 'resolved') return;
    const commandId = crypto.randomUUID();
    setView({ ...view, status: 'saving', message: null });
    const mutation = {
      commandId,
      expectedRevisions: {
        resolutionRevision: `${caseId}:resolutionRevision:r${view.resolution.revision}`,
        criteriaCatalogRevision: view.catalog.criteriaCatalogRevision,
      },
      criterionIds: criteria.map((criterion) => criterion.id),
    } as const;
    try {
      await criteriaSelectionApi.select(caseId, session.practiceId, mutation);
      await load();
    } catch (cause) {
      if (cause instanceof ApiError && cause.isCommitOutcomeUncertain) {
        try {
          await criteriaSelectionApi.lookup(caseId, commandId, session.practiceId);
          await load();
          return;
        } catch {
          setView({ ...view, message: 'The result is unknown. Reload the committed selection before trying again.' });
          return;
        }
      }
      setView({ ...view, message: message(cause) });
    }
  }, [caseId, load, session.practiceId, view]);

  return { view, reload: load, selectPolicy } as const;
}
