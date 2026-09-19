import { useCallback, useEffect, useId, useMemo } from 'react';

import { useRequiredSession, useSessionEpoch } from '@/app/providers/session-provider';
import { viewScope } from '@/shared/scoped-view-store';
import { useScopedViewStore } from '@/shared/use-scoped-view-store';
import { caseApi } from '../api/case-api';
import type { CaseDetailRecord, CaseInput } from '../model/case-command';

interface CaseDetailView {
  readonly loading: boolean;
  readonly error: string | null;
  readonly record: CaseDetailRecord | null;
  readonly draft: CaseInput | null;
}

function toInput(record: CaseDetailRecord): CaseInput {
  return {
    caseNumber: record.caseNumber,
    patientId: record.patientId,
    surgeonId: record.surgeonId,
    coordinatorId: record.coordinatorId,
    facilityId: record.facilityId,
    payerId: record.payerId,
    memberId: record.memberId,
    dateOfService: record.dateOfService,
    procedureCode: record.procedureCode,
    planKey: record.planKey,
    data: record.data,
  };
}

export function useCaseDetail(caseId: string, projectedRevision: number | null) {
  const session = useRequiredSession();
  const epoch = useSessionEpoch();
  const viewInstanceId = useId();
  const scope = useMemo(
    () => viewScope(session, epoch, caseId, viewInstanceId),
    [caseId, epoch, session, viewInstanceId],
  );
  const [view, lease] = useScopedViewStore<CaseDetailView>(scope, () => ({
    loading: true,
    error: null,
    record: null,
    draft: null,
  }));

  const load = useCallback(async () => {
    lease.publish((current) => ({ ...current, loading: true, error: null }));
    try {
      const result = await lease.execute((captured) =>
        caseApi.read(captured.caseId, captured.practiceId));
      if (result.status === 'current') {
        lease.publish(() => ({
          loading: false,
          error: null,
          record: result.value,
          draft: toInput(result.value),
        }));
      }
    } catch (cause) {
      lease.publish((current) => ({
        ...current,
        loading: false,
        error: cause instanceof Error ? cause.message : String(cause),
      }));
    }
  }, [lease]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (
      projectedRevision !== null
      && view.record !== null
      && projectedRevision > view.record.revision
      && !view.loading
    ) {
      void load();
    }
  }, [load, projectedRevision, view.loading, view.record]);

  const updateDraft = useCallback((patch: Partial<CaseInput>) => {
    lease.publish((current) => current.draft
      ? { ...current, draft: { ...current.draft, ...patch } }
      : current);
  }, [lease]);

  const resetDraft = useCallback(() => {
    lease.publish((current) => current.record
      ? { ...current, draft: toInput(current.record) }
      : current);
  }, [lease]);

  return {
    ...view,
    reload: load,
    updateDraft,
    resetDraft,
  } as const;
}
