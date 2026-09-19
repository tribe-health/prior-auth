import { useCallback, useEffect, useState } from 'react';

import { useRequiredSession } from '@/app/providers/session-provider';
import { ApiError } from '@/shared/api/http-client';
import { denialResponseApi } from '../api/denial-response-api';
import { EMPTY_DENIAL_DRAFT, type DenialDetermination, type DenialDraft, type DenialResponseMode } from '../model/denial-response';

type View = {
  readonly loading: boolean;
  readonly submitting: boolean;
  readonly determination: DenialDetermination | null;
  readonly draft: DenialDraft;
  readonly message: string | null;
};

export function useDenialResponse(caseId: string) {
  const session = useRequiredSession();
  const [view, setView] = useState<View>({
    loading: true,
    submitting: false,
    determination: null,
    draft: EMPTY_DENIAL_DRAFT,
    message: null,
  });
  const load = useCallback(async () => {
    setView((current) => ({ ...current, loading: true, message: null }));
    try {
      const determination = await denialResponseApi.latest(caseId, session.practiceId);
      setView((current) => ({ ...current, loading: false, determination }));
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 404) {
        setView((current) => ({ ...current, loading: false, determination: null }));
        return;
      }
      setView((current) => ({ ...current, loading: false, message: 'The payer determination could not be loaded.' }));
    }
  }, [caseId, session.practiceId]);
  useEffect(() => { void load(); }, [load]);

  const updateDraft = useCallback((patch: Partial<DenialDraft>) => {
    setView((current) => ({ ...current, draft: { ...current.draft, ...patch }, message: null }));
  }, []);
  const record = useCallback(async () => {
    if (view.submitting) return;
    setView((current) => ({ ...current, submitting: true, message: null }));
    try {
      const determination = await denialResponseApi.record(caseId, session.practiceId, {
        commandId: crypto.randomUUID(),
        documentId: view.draft.documentId,
        decidedOn: view.draft.decidedOn,
        reasonCode: view.draft.reasonCode.trim() || null,
        reasonText: view.draft.reasonText.trim(),
        appealDeadline: view.draft.appealDeadline || null,
      });
      setView((current) => ({ ...current, submitting: false, determination }));
    } catch (cause) {
      const message = cause instanceof ApiError && cause.code === 'resource_not_found'
        ? 'Choose a processed payer determination document from this case.'
        : 'The determination was not recorded. Review the fields and try again.';
      setView((current) => ({ ...current, submitting: false, message }));
    }
  }, [caseId, session.practiceId, view.draft, view.submitting]);
  const confirmMode = useCallback(async (mode: DenialResponseMode) => {
    if (view.submitting || !view.determination) return;
    setView((current) => ({ ...current, submitting: true, message: null }));
    try {
      const receipt = await denialResponseApi.confirmMode(caseId, session.practiceId, {
        commandId: crypto.randomUUID(), expectedDeterminationId: view.determination.id, mode,
      });
      setView((current) => ({ ...current, submitting: false,
        determination: current.determination ? { ...current.determination, responseMode: receipt.mode } : null }));
    } catch (cause) {
      const text = cause instanceof ApiError && cause.code === 'stale_revision'
        ? 'The payer determination changed. Reload and choose the response path again.'
        : 'The response path was not saved. Review the current determination and try again.';
      setView((current) => ({ ...current, submitting: false, message: text }));
    }
  }, [caseId, session.practiceId, view.determination, view.submitting]);
  return { ...view, updateDraft, record, confirmMode, reload: load } as const;
}
