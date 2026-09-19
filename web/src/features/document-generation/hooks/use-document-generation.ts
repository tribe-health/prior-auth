import { useEffect, useMemo } from 'react';
import { useStore } from 'zustand';
import { useRequiredSession, useSessionEpoch } from '@/app/providers/session-provider';
import type { DocumentPurpose } from '../model/document-task';
import { getDocumentTaskChannel } from '../services/document-task-channel';
import { useDocumentTaskStatus } from './use-document-task-status';

export function useDocumentGeneration(caseId: string, purpose: DocumentPurpose) {
  const session = useRequiredSession();
  const epoch = useSessionEpoch();
  const replicatedStatus = useDocumentTaskStatus(caseId, purpose);
  const channel = useMemo(() => getDocumentTaskChannel({
    identityId: session.identityId, sessionId: session.sessionId, authorizationRevision: session.authorizationRevision,
    epoch, practiceId: session.practiceId, caseId, purpose,
  }), [caseId, epoch, purpose, session.authorizationRevision, session.identityId, session.practiceId, session.sessionId]);
  const state = useStore(channel.store);
  useEffect(() => { void channel.recover(); }, [channel]);
  // Route unmount removes the React subscription, while the one session-owned
  // channel keeps its cursor. The session fence disposes the reader and payloads.
  return { state, replicatedStatus, start: channel.start, reconnect: channel.reconnect, cancel: channel.cancel, resume: channel.resume, reset: channel.reset };
}
