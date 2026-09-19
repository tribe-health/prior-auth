import { useEffect, useId, useMemo, useSyncExternalStore } from 'react';

import { useRequiredSession, useSessionEpoch } from '@/app/providers/session-provider';
import { viewScope } from '@/shared/scoped-view-store';
import { useScopedViewStore } from '@/shared/use-scoped-view-store';
import {
  memoryDraftRepository,
  type AnnotationDraftInput,
} from '@/features/drafts/services/memory-draft-repository';

const NO_DRAFT = () => null;
const NO_SUBSCRIPTION = () => () => undefined;

interface EditorState {
  readonly reviewed: boolean;
  readonly composing: boolean;
}

export function useAnnotationDraft({
  caseId,
  annotationId,
  initial,
}: {
  caseId: string;
  annotationId: string;
  initial: AnnotationDraftInput;
}) {
  const session = useRequiredSession();
  const epoch = useSessionEpoch();
  const viewInstanceId = useId();
  const handle = useMemo(
    () => memoryDraftRepository.openAnnotation(caseId, annotationId),
    [annotationId, caseId, epoch, session.authorizationRevision, session.identityId,
      session.practiceId, session.sessionId],
  );
  const getSnapshot = handle?.getSnapshot ?? NO_DRAFT;
  const subscribe = handle?.subscribe ?? NO_SUBSCRIPTION;
  const draft = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const scope = useMemo(
    () => viewScope(session, epoch, caseId, viewInstanceId),
    [caseId, epoch, session, viewInstanceId],
  );
  const [editor, lease] = useScopedViewStore<EditorState>(scope, () => ({
    reviewed: draft === null,
    composing: false,
  }));
  const value = editor.reviewed ? draft ?? initial : initial;

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
    value,
    dirty: draft !== null,
    composing: editor.composing,
    hasRecoverableDraft: draft !== null && !editor.reviewed,
    retentionNotice: memoryDraftRepository.retention.notice,
    recover: () => lease.publish((current) => ({ ...current, reviewed: true })),
    discard: () => {
      const discarded = handle?.discard() ?? false;
      lease.publish((current) => ({ ...current, reviewed: true, composing: false }));
      return discarded;
    },
    save: (patch: Partial<AnnotationDraftInput>) => {
      if (!editor.reviewed || !handle) return false;
      return handle.save({ ...value, ...patch });
    },
    startComposition: () => lease.publish((current) => ({ ...current, composing: true })),
    endComposition: () => lease.publish((current) => ({ ...current, composing: false })),
  };
}
