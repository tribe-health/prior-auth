import { createStore } from 'zustand/vanilla';
import { ApiError } from '@/shared/api/http-client';
import { subscribeRuntimeCommandSessionClear } from '@/shared/runtime-command-registry';
import type { PendingSubmissionCommand } from '../model/submission-workflow';
import { submissionWorkflowApi, type SubmissionWorkflowApi } from '../api/submission-workflow-api';

export interface SubmissionScope {
  readonly identityId: string;
  readonly sessionId: string;
  readonly authorizationRevision: string;
  readonly practiceId: string;
  readonly epoch: number;
  readonly caseId: string;
}
interface CommandState {
  readonly pending: PendingSubmissionCommand | null;
  readonly busy: boolean;
  readonly message: string | null;
  readonly completedOperations: number;
}
const empty = (): CommandState => ({ pending: null, busy: false, message: null, completedOperations: 0 });

export function createSubmissionCommandOwner(scope: SubmissionScope, api: SubmissionWorkflowApi = submissionWorkflowApi, pending: PendingSubmissionCommand | null = null) {
  const store = createStore<CommandState>(() => ({ ...empty(), pending }));
  let active = true;
  let running: Promise<void> | null = null;
  const publish = (patch: Partial<CommandState>) => { if (active) store.setState(patch); };
  const confirm = (command: PendingSubmissionCommand) => publish({ pending: null, message: command.kind === 'submit' ? 'Packet sent. Payer acknowledgement is separate.' : 'Payer acknowledgement recorded.' });
  const post = async (command: PendingSubmissionCommand) => {
    const commandId = command.body.commandId;
    if (command.kind === 'submit') {
      const packet = await api.submit(scope.caseId, scope.practiceId, command.body);
      if (packet.submission?.commandId !== commandId) throw new Error('Submission command outcome is not confirmed.');
    } else {
      const view = await api.acknowledge(scope.caseId, scope.practiceId, command.body);
      if (view.receipt?.commandId !== commandId || view.receipt.submissionId !== command.body.submissionId) throw new Error('Acknowledgement command outcome is not confirmed.');
    }
    confirm(command);
  };
  const perform = (work: () => Promise<void>) => {
    if (!active) return Promise.resolve();
    if (running) return running;
    publish({ busy: true, message: null });
    const result = work().catch((cause: unknown) => {
      if (!active) return;
      if (cause instanceof ApiError && !cause.isCommitOutcomeUncertain) {
        publish({ pending: null, message: cause.status === 409
          ? 'The packet changed. Reload and review the current signed letter before continuing.'
          : 'This action was refused. Review your access and the current packet before trying again.' });
      } else publish({ message: 'The command outcome is not confirmed. Check status before starting another request.' });
    }).finally(() => {
      if (running === result) running = null;
      publish({ busy: false, completedOperations: store.getState().completedOperations + 1 });
    });
    running = result;
    return result;
  };
  return {
    scope, store,
    run: (command: PendingSubmissionCommand) => perform(async () => {
      const retained = store.getState().pending ?? command;
      publish({ pending: retained });
      await post(retained);
    }),
    reconcile: () => perform(async () => {
      const command = store.getState().pending;
      if (!command) return;
      if (command.kind === 'submit') {
        const packet = await api.packet(scope.caseId, scope.practiceId);
        if (!active) return;
        if (packet.submission?.commandId === command.body.commandId) { confirm(command); return; }
      } else {
        const view = await api.receipt(scope.caseId, scope.practiceId);
        if (!active) return;
        if (view.receipt?.commandId === command.body.commandId && view.receipt.submissionId === command.body.submissionId) { confirm(command); return; }
      }
      await post(command);
    }),
    dispose: () => { active = false; store.setState(empty(), true); },
  };
}
const owners = new Map<string, ReturnType<typeof createSubmissionCommandOwner>>();
// Only unresolved command bodies survive quarantine, in memory and under the exact
// verified scope. Live stores are disposed before another session can render.
const retained = new Map<string, { readonly sessionId: string; readonly command: PendingSubmissionCommand }>();
const recoveryKey = (scope: SubmissionScope) => JSON.stringify([
  scope.identityId, scope.sessionId, scope.authorizationRevision, scope.practiceId, scope.caseId,
]);
let unsubscribe: (() => void) | null = null;
export function submissionCommandOwner(scope: SubmissionScope) {
  if (!unsubscribe) unsubscribe = subscribeRuntimeCommandSessionClear((sessionId, reason) => {
    for (const [key, owner] of owners) if (owner.scope.sessionId === sessionId) {
      const command = owner.store.getState().pending;
      if (reason === 'revalidation' && command) retained.set(recoveryKey(owner.scope), { sessionId, command });
      owner.dispose();
      owners.delete(key);
    }
    if (reason === 'purge') {
      for (const [key, entry] of retained) if (entry.sessionId === sessionId) retained.delete(key);
    }
    // Keep the purge listener while a command is quarantined between mounts.
    if (!owners.size && !retained.size) { unsubscribe?.(); unsubscribe = null; }
  });
  const key = JSON.stringify(scope);
  const existing = owners.get(key);
  if (existing) return existing;
  const recovery = recoveryKey(scope);
  const command = retained.get(recovery)?.command ?? null;
  retained.delete(recovery);
  const owner = createSubmissionCommandOwner(scope, submissionWorkflowApi, command);
  owners.set(key, owner);
  return owner;
}
