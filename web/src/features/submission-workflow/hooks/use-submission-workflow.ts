import { useCallback, useEffect, useId, useMemo, useRef } from 'react';
import { useStore } from 'zustand';
import { useRequiredSession, useSessionEpoch } from '@/app/providers/session-provider';
import { viewScope } from '@/shared/scoped-view-store';
import { useScopedViewStore } from '@/shared/use-scoped-view-store';
import { submissionWorkflowApi } from '../api/submission-workflow-api';
import { acknowledgementBody, EMPTY_ACKNOWLEDGEMENT, signedCurrentPacket, type AcknowledgementDraft, type ReceiptView, type SubmissionPacket } from '../model/submission-workflow';
import { submissionCommandOwner } from '../services/submission-command-owner';

interface View {
  readonly phase: 'loading' | 'ready' | 'error';
  readonly packet: SubmissionPacket | null;
  readonly receiptView: ReceiptView | null;
  readonly draft: AcknowledgementDraft;
  readonly draftSubmissionId: string | null;
  readonly message: string | null;
}
export function useSubmissionWorkflow(caseId: string, mode: 'packet' | 'receipt') {
  const session = useRequiredSession();
  const epoch = useSessionEpoch();
  const id = useId();
  const scope = useMemo(() => viewScope(session, epoch, caseId, id), [caseId, epoch, id, session]);
  const [view, lease] = useScopedViewStore<View>(scope, () => ({ phase: 'loading', packet: null, receiptView: null, draft: EMPTY_ACKNOWLEDGEMENT, draftSubmissionId: null, message: null }));
  const owner = useMemo(() => submissionCommandOwner({ identityId: session.identityId, sessionId: session.sessionId, authorizationRevision: session.authorizationRevision, practiceId: session.practiceId, epoch, caseId }), [caseId, epoch, session.authorizationRevision, session.identityId, session.practiceId, session.sessionId]);
  const command = useStore(owner.store);
  const loadSequence = useRef(0);
  const reload = useCallback(async () => {
    const sequence = ++loadSequence.current;
    lease.publish((current) => ({ ...current, phase: 'loading', message: null }));
    try {
      const result = await lease.execute(async () => mode === 'packet'
        ? { packet: await submissionWorkflowApi.packet(caseId, session.practiceId), receiptView: null }
        : await submissionWorkflowApi.receipt(caseId, session.practiceId).then((receiptView) => ({ packet: receiptView.packet, receiptView })));
      if (result.status === 'stale' || sequence !== loadSequence.current) return;
      lease.publish((current) => ({ ...current, phase: 'ready', ...result.value,
        draftSubmissionId: result.value.packet.submission?.id ?? null,
        draft: current.draftSubmissionId !== (result.value.packet.submission?.id ?? null)
          ? { ...EMPTY_ACKNOWLEDGEMENT, pageCount: result.value.packet.submission ? String(result.value.packet.submission.totalPages) : '' } : current.draft }));
    } catch {
      if (sequence !== loadSequence.current) return;
      lease.publish((current) => ({ ...current, phase: 'error', packet: null, receiptView: null, message: 'The submission record could not be loaded. Retry to review the current packet.' }));
    }
  }, [caseId, lease, mode, session.practiceId]);
  useEffect(() => { void reload(); }, [command.completedOperations, reload]);
  const updateDraft = useCallback((patch: Partial<AcknowledgementDraft>) => {
    if (owner.store.getState().pending) return;
    lease.publish((current) => ({ ...current, draft: { ...current.draft, ...patch }, message: null }));
  }, [lease, owner]);
  const submit = useCallback(async () => {
    if (view.phase !== 'ready' || !view.packet || !signedCurrentPacket(view.packet) || !view.packet.letter || owner.store.getState().pending) return;
    await owner.run({ kind: 'submit', body: { commandId: crypto.randomUUID(), expectedLetterRevision: view.packet.letter.revision } });
  }, [owner, view]);
  const acknowledge = useCallback(async () => {
    if (view.phase !== 'ready' || !view.packet?.submission || view.receiptView?.receipt || owner.store.getState().pending) return;
    const body = acknowledgementBody(view.draft, view.packet.submission.id, crypto.randomUUID());
    if (!body) {
      lease.publish((current) => ({ ...current, message: 'Enter the payer reference, acknowledgement time, and a whole page count of zero or more.' }));
      return;
    }
    await owner.run({ kind: 'acknowledge', body });
  }, [lease, owner, view]);
  return { ...view, command, updateDraft, submit, acknowledge, reconcile: owner.reconcile, reload } as const;
}
