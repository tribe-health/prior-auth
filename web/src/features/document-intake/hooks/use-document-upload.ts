import { useCallback, useEffect, useId, useMemo, useSyncExternalStore } from 'react';

import { useRequiredSession, useSessionEpoch } from '@/app/providers/session-provider';
import { ApiError } from '@/shared/api/http-client';
import { viewScope } from '@/shared/scoped-view-store';
import {
  claimRuntimeCommand,
  clearRuntimeCommand,
  getRuntimeCommand,
  markRuntimeCommandAwaitingProjection,
  markRuntimeCommandUncertain,
  subscribeRuntimeCommand,
  type RuntimeCommandScope,
} from '@/shared/runtime-command-registry';
import { useScopedViewStore } from '@/shared/use-scoped-view-store';
import { documentIntakeApi, sha256File } from '../api/document-intake-api';
import {
  DOCUMENT_PROCESSING_FAILED_MESSAGE,
  EMPTY_DOCUMENT_UPLOAD_DRAFT,
  MAX_DOCUMENT_UPLOAD_BYTES,
  documentErrorMessage,
  mediaTypeFor,
  type DocumentStatusRecord,
  type DocumentUploadDraft,
} from '../model/document-intake';

export type DocumentUploadOutcome =
  | 'idle'
  | 'submitting'
  | 'uncertain'
  | 'awaiting-projection'
  | 'confirmed'
  | 'refused'
  | 'conflict';

interface DocumentUploadView {
  readonly draft: DocumentUploadDraft;
  readonly outcome: DocumentUploadOutcome;
  readonly message: string | null;
}

export function useDocumentUpload(
  caseId: string,
  caseInputRevision: number,
  documentSetRevision: number,
  documents: readonly DocumentStatusRecord[],
) {
  const session = useRequiredSession();
  const epoch = useSessionEpoch();
  const viewInstanceId = useId();
  const commandScope = useMemo<RuntimeCommandScope>(() => ({
    feature: 'document-upload',
    sessionId: session.sessionId,
    authorizationRevision: session.authorizationRevision,
    epoch,
    identityId: session.identityId,
    practiceId: session.practiceId,
    caseId,
  }), [caseId, epoch, session]);
  const owner = useSyncExternalStore(
    useCallback(
      (listener: () => void) => subscribeRuntimeCommand(commandScope, listener),
      [commandScope],
    ),
    useCallback(() => getRuntimeCommand(commandScope), [commandScope]),
    useCallback(() => getRuntimeCommand(commandScope), [commandScope]),
  );
  const scope = useMemo(
    () => viewScope(session, epoch, caseId, viewInstanceId),
    [caseId, epoch, session, viewInstanceId],
  );
  const [view, lease] = useScopedViewStore<DocumentUploadView>(scope, () => ({
    draft: EMPTY_DOCUMENT_UPLOAD_DRAFT,
    outcome: 'idle',
    message: null,
  }));

  const publishOutcome = useCallback((outcome: DocumentUploadOutcome, message: string | null) => {
    lease.publish((current) => ({ ...current, outcome, message }));
  }, [lease]);

  useEffect(() => {
    if (owner?.status !== 'awaiting-projection' || !owner.targetId) return;
    if (!documents.some((document) => document.id === owner.targetId)) return;
    clearRuntimeCommand(commandScope, owner.id);
    lease.publish((current) => ({
      ...current,
      outcome: 'confirmed',
      message: 'Document uploaded. Processing status is now available.',
    }));
  }, [commandScope, documents, lease, owner]);

  const updateDraft = useCallback((patch: Partial<DocumentUploadDraft>) => {
    lease.publish((current) => ({ ...current, draft: { ...current.draft, ...patch } }));
  }, [lease]);

  const selectFile = useCallback((file: File | null) => {
    lease.publish((current) => ({
      ...current,
      draft: {
        ...current.draft,
        file,
        name: file && current.draft.name.length === 0 ? file.name : current.draft.name,
      },
      outcome: 'idle',
      message: null,
    }));
  }, [lease]);

  const awaitProjection = useCallback((commandId: string) => {
    markRuntimeCommandAwaitingProjection(commandScope, commandId, { state: 'present' });
    lease.publish((current) => ({
      ...current,
      draft: { ...current.draft, file: null, name: '' },
      outcome: 'awaiting-projection',
      message: 'Upload accepted. Waiting for committed processing status.',
    }));
  }, [commandScope, lease]);

  const fail = useCallback((commandId: string, cause: unknown, dispatched: boolean) => {
    if (dispatched && (!(cause instanceof ApiError) || cause.isCommitOutcomeUncertain)) {
      markRuntimeCommandUncertain(commandScope, commandId);
      publishOutcome(
        'uncertain',
        cause instanceof ApiError
          ? documentErrorMessage(cause)
          : 'The result is unknown. Check the upload before trying again.',
      );
      return;
    }
    clearRuntimeCommand(commandScope, commandId);
    publishOutcome(
      cause instanceof ApiError && cause.isCapabilityDenied ? 'refused' : 'conflict',
      documentErrorMessage(cause),
    );
  }, [commandScope, publishOutcome]);

  const submit = useCallback(async () => {
    const { file, documentTypeKey, name, effectiveDate } = view.draft;
    if (!file || !documentTypeKey || !name.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
      publishOutcome('conflict', 'Choose a file and complete its type, name, and source date.');
      return null;
    }
    if (file.size > MAX_DOCUMENT_UPLOAD_BYTES) {
      publishOutcome('conflict', 'This file exceeds the permitted size.');
      return null;
    }
    const mediaType = mediaTypeFor(file);
    if (!mediaType) {
      publishOutcome('conflict', 'Upload a supported PDF or text document.');
      return null;
    }
    if (getRuntimeCommand(commandScope)) {
      publishOutcome('conflict', 'Check the pending upload before starting another.');
      return null;
    }

    const commandId = crypto.randomUUID();
    const documentId = crypto.randomUUID();
    if (!claimRuntimeCommand(commandScope, {
      id: commandId,
      action: 'upload',
      targetId: documentId,
      status: 'submitting',
    })) {
      publishOutcome('conflict', 'Check the pending upload before starting another.');
      return null;
    }
    publishOutcome('submitting', 'Preparing and uploading the document…');
    let dispatched = false;
    try {
      const contentSha256 = await sha256File(file);
      dispatched = true;
      const receipt = await documentIntakeApi.upload(caseId, session.practiceId, {
        commandId,
        documentId,
        expectedCaseInputRevision: caseInputRevision,
        expectedDocumentSetRevision: documentSetRevision,
        documentTypeKey,
        name: name.trim(),
        effectiveDate,
        mediaType,
        contentSha256,
        file,
      });
      awaitProjection(commandId);
      return receipt;
    } catch (cause) {
      fail(commandId, cause, dispatched);
      return null;
    }
  }, [awaitProjection, caseId, caseInputRevision, commandScope, documentSetRevision, fail, publishOutcome, session.practiceId, view.draft]);

  const reconcile = useCallback(async () => {
    const current = getRuntimeCommand(commandScope);
    if (!current || current.status === 'submitting') return null;
    try {
      const receipt = await documentIntakeApi.lookup(caseId, current.id, session.practiceId);
      awaitProjection(current.id);
      return receipt;
    } catch (cause) {
      if (!(cause instanceof ApiError) || cause.isCommitOutcomeUncertain) {
        markRuntimeCommandUncertain(commandScope, current.id);
        publishOutcome('uncertain', documentErrorMessage(cause));
        return null;
      }
      clearRuntimeCommand(commandScope, current.id);
      publishOutcome(cause.isCapabilityDenied ? 'refused' : 'conflict', documentErrorMessage(cause));
      return null;
    }
  }, [awaitProjection, caseId, commandScope, publishOutcome, session.practiceId]);

  const activeOutcome = owner?.status ?? view.outcome;
  return {
    draft: view.draft,
    outcome: activeOutcome,
    message: view.message,
    pending: activeOutcome === 'submitting' || activeOutcome === 'awaiting-projection',
    canReconcile: owner?.status === 'uncertain' || owner?.status === 'awaiting-projection',
    updateDraft,
    selectFile,
    submit,
    reconcile,
    processingFailureMessage: DOCUMENT_PROCESSING_FAILED_MESSAGE,
  } as const;
}
