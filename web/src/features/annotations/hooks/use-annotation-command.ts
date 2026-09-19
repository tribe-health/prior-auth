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
import {
  memoryDraftRepository,
  type AnnotationDraftInput,
} from '@/features/drafts/services/memory-draft-repository';
import { annotationApi } from '../api/annotation-api';
import type { Annotation, AnnotationResult } from '../model/annotation';

type Outcome = 'idle' | 'refused' | 'conflict' | 'uncertain' | 'awaiting-projection' | 'confirmed';
interface CommandView { readonly outcome: Outcome; readonly message: string | null }

function resultFingerprint(result: AnnotationResult): string {
  return JSON.stringify([
    result.annotationId,
    result.annotationTypeId,
    result.name,
    result.body,
    result.authorId,
    result.authorLabel,
    result.provenance,
    result.targetEvidenceId,
    result.targetDocumentId,
    result.disposition,
    result.revision,
  ]);
}

function projectionFingerprint(annotation: Annotation): string {
  return JSON.stringify([
    annotation.id,
    annotation.annotationTypeId,
    annotation.name,
    annotation.body,
    annotation.authorId,
    annotation.authorLabel,
    annotation.provenance,
    annotation.targetEvidenceId,
    annotation.targetDocumentId,
    annotation.disposition,
    annotation.revision,
  ]);
}

export function useAnnotationCommand(caseId: string, annotations: readonly Annotation[]) {
  const session = useRequiredSession();
  const epoch = useSessionEpoch();
  const viewInstanceId = useId();
  const commandScope = useMemo<RuntimeCommandScope>(() => ({
    feature: 'annotations',
    sessionId: session.sessionId,
    authorizationRevision: session.authorizationRevision,
    epoch,
    identityId: session.identityId,
    practiceId: session.practiceId,
    caseId,
  }), [caseId, epoch, session]);
  const owner = useSyncExternalStore(
    useCallback((listener: () => void) => subscribeRuntimeCommand(commandScope, listener), [commandScope]),
    useCallback(() => getRuntimeCommand(commandScope), [commandScope]),
    useCallback(() => getRuntimeCommand(commandScope), [commandScope]),
  );
  const scope = useMemo(
    () => viewScope(session, epoch, caseId, viewInstanceId),
    [caseId, epoch, session, viewInstanceId],
  );
  const [view, lease] = useScopedViewStore<CommandView>(scope, () => ({ outcome: 'idle', message: null }));
  const publish = useCallback((outcome: Outcome, message: string | null) => {
    lease.publish(() => ({ outcome, message }));
  }, [lease]);

  useEffect(() => {
    if (owner?.status !== 'awaiting-projection' || !owner.targetId || !owner.expectedProjection) return;
    const projected = annotations.find((candidate) => candidate.id === owner.targetId);
    if (!projected) return;
    const expectedRevision = Number(owner.expectedProjection.revision);
    if (
      projected.revision === expectedRevision
      && projected.disposition === owner.expectedProjection.state
      && projectionFingerprint(projected) === owner.expectedProjection.fingerprint
    ) {
      clearRuntimeCommand(commandScope, owner.id);
      memoryDraftRepository.openAnnotation(caseId, projected.id)?.discard();
      publish('confirmed', 'Annotation saved and confirmed.');
    } else if (projected.revision === expectedRevision) {
      clearRuntimeCommand(commandScope, owner.id);
      publish('conflict', 'The committed annotation does not match the accepted result. Review the current annotation.');
    } else if (projected.revision > expectedRevision) {
      clearRuntimeCommand(commandScope, owner.id);
      publish('conflict', 'The annotation changed again. Review the current annotation.');
    }
  }, [annotations, caseId, commandScope, owner, publish]);

  const accept = useCallback((commandId: string, result: AnnotationResult, message: string) => {
    markRuntimeCommandAwaitingProjection(commandScope, commandId, {
      state: result.disposition,
      revision: String(result.revision),
      fingerprint: resultFingerprint(result),
    });
    publish('awaiting-projection', message);
  }, [commandScope, publish]);

  const save = useCallback(async (annotationId: string, draft: AnnotationDraftInput) => {
    if (getRuntimeCommand(commandScope)) throw new Error('An annotation command is already pending.');
    const commandId = crypto.randomUUID();
    if (!claimRuntimeCommand(commandScope, { id: commandId, targetId: annotationId, status: 'submitting' })) {
      throw new Error('An annotation command is already pending.');
    }
    publish('idle', null);
    try {
      const result = await annotationApi.save(caseId, annotationId, session.practiceId, {
        commandId,
        annotationId,
        annotationTypeId: draft.annotationTypeId,
        name: draft.name,
        data: { assertion: draft.body },
        body: draft.body,
        targetEvidenceId: draft.targetEvidenceId,
        targetDocumentId: draft.targetDocumentId,
        disposition: draft.disposition,
        expectedRevision: draft.expectedRevision,
      }, epoch);
      accept(commandId, result, 'Annotation accepted. Waiting for the committed record.');
      return result;
    } catch (cause) {
      if (cause instanceof ApiError && (cause.isCapabilityDenied || cause.isPreconditionUnmet)) {
        clearRuntimeCommand(commandScope, commandId);
        publish(cause.isCapabilityDenied ? 'refused' : 'conflict', cause.message);
        return null;
      }
      if (cause instanceof ApiError && !cause.isCommitOutcomeUncertain) {
        clearRuntimeCommand(commandScope, commandId);
      } else {
        markRuntimeCommandUncertain(commandScope, commandId);
        publish('uncertain', 'The annotation result is unknown. Check the command before trying again.');
      }
      throw cause;
    }
  }, [accept, caseId, commandScope, epoch, publish, session.practiceId]);

  const lookupCommand = useCallback(async () => {
    const current = getRuntimeCommand(commandScope);
    if (!current?.targetId) throw new Error('No annotation command needs reconciliation.');
    try {
      const result = await annotationApi.lookupCommand(
        caseId,
        current.targetId,
        current.id,
        session.practiceId,
        epoch,
      );
      accept(current.id, result, 'The command completed. Waiting for the committed annotation.');
      return result;
    } catch (cause) {
      if (cause instanceof ApiError && cause.isCapabilityDenied) {
        clearRuntimeCommand(commandScope, current.id);
        publish('refused', cause.message);
        return null;
      }
      if (cause instanceof ApiError && cause.isPreconditionUnmet) {
        clearRuntimeCommand(commandScope, current.id);
        publish('conflict', cause.message);
        return null;
      }
      if (cause instanceof ApiError && cause.status === 404) {
        clearRuntimeCommand(commandScope, current.id);
        publish('conflict', 'The prior annotation command did not complete. Review the current annotation.');
        return null;
      }
      throw cause;
    }
  }, [accept, caseId, commandScope, epoch, publish, session.practiceId]);

  return {
    outcome: view.outcome,
    message: view.message,
    pending: owner !== null,
    submitting: owner?.status === 'submitting',
    canReconcile: owner?.status === 'uncertain' || owner?.status === 'awaiting-projection',
    save,
    lookupCommand,
  };
}
