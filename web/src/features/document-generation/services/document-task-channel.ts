import { createStore } from 'zustand/vanilla';
import { ApiError } from '@/shared/api/http-client';
import { subscribeRuntimeCommandSessionClear } from '@/shared/runtime-command-registry';
import { documentTaskApi, type DocumentTaskApi } from '../api/document-task-api';
import { object, parseDocumentTask, pausedTask, terminalTask, type DocumentTask, type DocumentTaskArtifacts, type GenerationCommand, type TaskScope } from '../model/document-task';
import { readTaskEvents, type TaskEventFrame } from './task-event-stream';

export type TaskChannelState = {
  readonly connection: 'idle' | 'connecting' | 'streaming' | 'disconnected' | 'settled';
  readonly task: DocumentTask | null;
  readonly command: GenerationCommand | null;
  readonly stage: string;
  readonly sequence: number;
  readonly provisionalText: string;
  readonly surfaces: readonly unknown[];
  readonly artifacts: DocumentTaskArtifacts | null;
  readonly message: string | null;
  readonly startRefused: boolean;
};
const empty = (): TaskChannelState => ({ connection: 'idle', task: null, command: null, stage: '', sequence: 0, provisionalText: '', surfaces: [], artifacts: null, message: null, startRefused: false });
const PREFIX = 'aso.document-task.v1:';

function scopeKey(scope: TaskScope): string { return PREFIX + JSON.stringify(scope); }
function pointerKey(scope: TaskScope): string {
  const { identityId, sessionId, authorizationRevision, practiceId, caseId, purpose } = scope;
  return PREFIX + JSON.stringify({ identityId, sessionId, authorizationRevision, practiceId, caseId, purpose });
}
function savePointer(scope: TaskScope, state: TaskChannelState): void {
  try {
    if (!state.command) { sessionStorage.removeItem(pointerKey(scope)); return; }
    // Only opaque IDs, revision tokens and purpose are retained. No text or artifacts.
    sessionStorage.setItem(pointerKey(scope), JSON.stringify({ command: state.command, taskId: state.task?.id ?? null }));
  } catch { /* The live channel still retains the original command if storage is unavailable. */ }
}
function restorePointer(scope: TaskScope): { command: GenerationCommand; taskId: string | null } | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(pointerKey(scope)) ?? 'null');
    if (!object(value) || !object(value.command) || !object(value.command.expectedRevisions)) return null;
    const command = value.command;
    const revisions = command.expectedRevisions as Record<string, unknown>;
    if (typeof command.commandId !== 'string' || command.purpose !== scope.purpose
      || !['resolutionRevision', 'criteriaSelectionRevision', 'evidenceRevision'].every((key) => typeof revisions[key] === 'string' && (revisions[key] as string).startsWith(`${scope.caseId}:`))
      || !(value.taskId === null || typeof value.taskId === 'string')) return null;
    return { command: { commandId: command.commandId, purpose: scope.purpose, expectedRevisions: {
      resolutionRevision: revisions.resolutionRevision as string, criteriaSelectionRevision: revisions.criteriaSelectionRevision as string, evidenceRevision: revisions.evidenceRevision as string,
    } }, taskId: value.taskId };
  } catch { return null; }
}

export function createDocumentTaskChannel(scope: TaskScope, api: DocumentTaskApi = documentTaskApi) {
  const store = createStore<TaskChannelState>(empty);
  let active = true;
  let controller: AbortController | null = null;
  let operation: Promise<void> | null = null;
  let recovered = false;
  const publish = (patch: Partial<TaskChannelState>) => { if (active) store.setState(patch); };
  const acceptTask = (task: DocumentTask): void => {
    const command = store.getState().command;
    if (task.caseId !== scope.caseId || task.purpose !== scope.purpose || task.commandId !== command?.commandId
      || (store.getState().task && store.getState().task?.id !== task.id)) throw new Error('The task belongs to a different request.');
    publish({ task, stage: task.stage });
    if (active) savePointer(scope, store.getState());
  };
  const consume = (frame: TaskEventFrame) => {
    if (!active) return;
    const current = store.getState();
    if (!current.task || !object(frame.data) || typeof frame.data.type !== 'string') throw new Error('Invalid task event.');
    if (!frame.id) throw new Error('The stream lost its durable event cursor.');
    const prefix = `${current.task.id}:`;
    const sequence = frame.id.startsWith(prefix) ? Number(frame.id.slice(prefix.length)) : NaN;
    if (!Number.isSafeInteger(sequence) || sequence < 1) throw new Error('Invalid task event cursor.');
    if (sequence <= current.sequence) return;
    if (sequence !== current.sequence + 1) throw new Error('The task stream skipped an event.');
    const event = frame.data;
    switch (event.type) {
      case 'RUN_STARTED':
      case 'RUN_FINISHED':
        if (event.runId !== current.task.id || event.threadId !== scope.caseId) throw new Error('The event belongs to another run.');
        break;
      case 'STEP_STARTED':
      case 'STEP_FINISHED':
        if (typeof event.stepName !== 'string') throw new Error('Invalid task stage.');
        publish({ stage: event.stepName });
        break;
      case 'TEXT_MESSAGE_START':
      case 'TEXT_MESSAGE_END':
      case 'TEXT_MESSAGE_CONTENT':
        if (event.messageId !== current.task.id) throw new Error('The text belongs to another run.');
        if (event.type === 'TEXT_MESSAGE_CONTENT') {
          if (typeof event.delta !== 'string' || current.provisionalText.length + event.delta.length > 2_000_000) throw new Error('Invalid provisional text.');
          publish({ provisionalText: current.provisionalText + event.delta });
        }
        break;
      case 'STATE_SNAPSHOT':
        if (!object(event.snapshot)) throw new Error('Invalid task snapshot.');
        acceptTask(parseDocumentTask(event.snapshot.task));
        break;
      case 'CUSTOM':
        if (event.name === 'a2ui.surface') {
          if (current.surfaces.length >= 32) throw new Error('Too many document blocks.');
          publish({ surfaces: [...current.surfaces, event.value] });
        } else publish({ message: 'An unsupported task event was received. It does not mark the draft complete.' });
        break;
      case 'RUN_ERROR':
        publish({ message: 'Document generation requires attention. Review the task status.' });
        break;
      default:
        publish({ message: 'An unsupported task event was received. It does not mark the draft complete.' });
    }
    publish({ sequence });
  };
  const follow = async () => {
    let task = store.getState().task;
    if (!active || !task) return;
    if (!terminalTask(task) && !pausedTask(task)) {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      publish({ connection: 'connecting' });
      try {
        const response = await api.stream(task, scope.practiceId, store.getState().sequence, request.signal);
        if (!active || request.signal.aborted) return;
        publish({ connection: 'streaming' });
        await readTaskEvents(response, request.signal, consume);
      } finally { if (controller === request) controller = null; }
      if (!active || request.signal.aborted) return;
      task = await api.read(task.id, scope.practiceId);
      if (!active) return;
      acceptTask(task);
    }
    if (!active) return;
    if (task.state === 'completed') {
      const artifacts = await api.artifacts(task, scope.practiceId);
      publish({ artifacts, provisionalText: '', surfaces: [], connection: 'settled', message: null });
    } else if (terminalTask(task) || pausedTask(task)) {
      publish({ connection: 'settled', provisionalText: '', surfaces: [], message: task.state === 'canceled' ? 'Document generation canceled.' : 'Document generation requires attention. Review the task status before continuing.' });
    } else publish({ connection: 'disconnected', message: 'The task connection ended. Reconnect to the same task to continue.' });
  };
  const perform = (work: () => Promise<void>) => {
    if (!active) return Promise.resolve();
    if (operation) return operation;
    const running = work().catch((cause: unknown) => {
      if (!active) return;
      const definitive = cause instanceof ApiError && !cause.isCommitOutcomeUncertain;
      publish({ connection: 'disconnected', startRefused: definitive && !store.getState().task, message: definitive
        ? 'This document action was refused. Review your access and the current case before retrying.'
        : 'The connection was interrupted. Reconnect using the same request; its outcome is not yet confirmed.' });
    }).finally(() => { if (operation === running) operation = null; });
    operation = running;
    return running;
  };
  const start = (command: GenerationCommand) => perform(async () => {
    const retained = store.getState().command;
    // An unresolved start is always retried with its original payload and ID.
    const original = retained ?? command;
    publish({ command: original, connection: 'connecting', message: null, startRefused: false });
    savePointer(scope, store.getState());
    const task = await api.start(scope.caseId, scope.practiceId, original);
    if (!active) return;
    acceptTask(task);
    await follow();
  });
  const reattach = async (task: DocumentTask) => {
    acceptTask(task);
    // A process restart can leave a working row without a live worker. Resume
    // acquires fresh host authorization and deduplicates an already-running task.
    if (!terminalTask(task) && !pausedTask(task)) {
      const resumed = await api.resume(task.id, scope.practiceId);
      if (!active) return;
      acceptTask(resumed);
    }
    await follow();
  };
  const reconnect = () => perform(async () => {
    const task = store.getState().task;
    publish({ message: null });
    if (task) {
      const fresh = await api.read(task.id, scope.practiceId);
      if (!active) return;
      await reattach(fresh);
    } else if (store.getState().command) {
      const result = await api.start(scope.caseId, scope.practiceId, store.getState().command!);
      if (!active) return;
      acceptTask(result);
      await follow();
    }
  });
  return {
    scope, store, start, reconnect,
    reset: () => {
      const state = store.getState();
      if (!active || operation || !(state.startRefused || (state.task && terminalTask(state.task) && state.task.state !== 'completed'))) return false;
      store.setState(empty(), true);
      savePointer(scope, store.getState());
      return true;
    },
    recover: () => {
      if (recovered) return Promise.resolve();
      recovered = true;
      const pointer = restorePointer(scope);
      if (!pointer) return Promise.resolve();
      publish({ command: pointer.command });
      if (!pointer.taskId) return reconnect();
      return perform(async () => {
        const task = await api.read(pointer.taskId!, scope.practiceId);
        if (!active) return;
        await reattach(task);
      });
    },
    cancel: async () => {
      const task = store.getState().task;
      if (!active || !task || terminalTask(task)) return;
      // Cancellation is independent of a reader waiting for its next frame.
      try {
        const result = await api.cancel(task.id, scope.practiceId);
        if (!active) return;
        controller?.abort();
        acceptTask(result);
        await follow();
      } catch { publish({ message: 'Cancellation is not confirmed. Reconnect to check the same task.' }); }
    },
    resume: () => perform(async () => {
      const task = store.getState().task;
      if (!task || !pausedTask(task)) return;
      const result = await api.resume(task.id, scope.practiceId);
      if (!active) return;
      acceptTask(result);
      await follow();
    }),
    dispose: (preservePointer = false) => {
      active = false;
      controller?.abort();
      controller = null;
      store.setState(empty(), true);
      try { if (!preservePointer) sessionStorage.removeItem(pointerKey(scope)); } catch { /* Storage can be disabled. */ }
    },
  };
}
export type DocumentTaskChannel = ReturnType<typeof createDocumentTaskChannel>;
const channels = new Map<string, DocumentTaskChannel>();
let unsubscribe: (() => void) | null = null;

export function getDocumentTaskChannel(scope: TaskScope): DocumentTaskChannel {
  if (!unsubscribe) unsubscribe = subscribeRuntimeCommandSessionClear((sessionId, reason) => {
    for (const [key, channel] of channels) {
      if (channel.scope.sessionId === sessionId) { channel.dispose(reason === 'revalidation'); channels.delete(key); }
    }
    try {
      for (const key of reason === 'purge' ? Object.keys(sessionStorage) : []) {
        if (key.startsWith(PREFIX) && (JSON.parse(key.slice(PREFIX.length)) as TaskScope).sessionId === sessionId) sessionStorage.removeItem(key);
      }
    } catch { /* No clinical text is persisted in recovery pointers. */ }
    // Keep the purge listener while recovery pointers are quarantined between
    // session epochs; a logout during revalidation must still erase them.
  });
  const key = scopeKey(scope);
  const channel = channels.get(key) ?? createDocumentTaskChannel(scope);
  channels.set(key, channel);
  return channel;
}
