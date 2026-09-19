import { useEffect, useId, useMemo, useSyncExternalStore } from 'react';

import { useRequiredSession, useSessionEpoch } from '@/app/providers/session-provider';
import { viewScope } from '@/shared/scoped-view-store';
import { useScopedViewStore } from '@/shared/use-scoped-view-store';
import {
  memoryDraftRepository,
} from '../services/memory-draft-repository';

const NO_DRAFT = () => null;
const NO_SUBSCRIPTION = () => () => undefined;

export function useCorrectionDraft({
  caseId,
  draftId,
  baseRevision,
}: {
  caseId: string;
  draftId: string;
  baseRevision: string | null;
}) {
  const session = useRequiredSession();
  const epoch = useSessionEpoch();
  const viewInstanceId = useId();
  const handle = useMemo(
    () => memoryDraftRepository.open(caseId, draftId),
    [caseId, draftId, epoch, session.authorizationRevision, session.identityId,
      session.practiceId, session.sessionId],
  );
  const getSnapshot = handle?.getSnapshot ?? NO_DRAFT;
  const subscribe = handle?.subscribe ?? NO_SUBSCRIPTION;
  const draft = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const scope = useMemo(
    () => viewScope(session, epoch, caseId, viewInstanceId),
    [caseId, epoch, session, viewInstanceId],
  );
  const [reviewed, lease] = useScopedViewStore(scope, () => draft === null);
  const hasRecoverableDraft = draft !== null && !reviewed;

  useEffect(() => {
    if (!draft) return;
    const warnBeforeReload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeReload);
    return () => window.removeEventListener('beforeunload', warnBeforeReload);
  }, [draft]);

  return {
    available: handle !== null,
    content: reviewed ? draft?.content ?? '' : '',
    dirty: draft !== null,
    hasRecoverableDraft,
    retentionNotice: memoryDraftRepository.retention.notice,
    recover: () => lease.publish(() => true),
    save: (content: string) => {
      if (!reviewed || !handle) return false;
      if (content.length === 0) return handle.discard();
      return handle.save({ baseRevision, content });
    },
    discard: () => handle?.discard() ?? false,
  } satisfies {
    available: boolean;
    content: string;
    dirty: boolean;
    hasRecoverableDraft: boolean;
    retentionNotice: string;
    recover: () => boolean;
    save: (content: string) => boolean;
    discard: () => boolean;
  };
}
