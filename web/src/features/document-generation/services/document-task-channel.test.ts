import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/api/http-client';
import { clearRuntimeCommandsForSession } from '@/shared/runtime-command-registry';
import { documentTaskApi, type DocumentTaskApi } from '../api/document-task-api';
import { parseTaskArtifacts, type DocumentTask, type GenerationCommand, type TaskScope } from '../model/document-task';
import { createDocumentTaskChannel, getDocumentTaskChannel } from './document-task-channel';

const scope: TaskScope = { identityId: 'identity-1', sessionId: 'session-1', authorizationRevision: 'r1', epoch: 0, practiceId: 'practice-1', caseId: 'case-1', purpose: 'prior_authorization_request' };
const command: GenerationCommand = { commandId: 'command-1', purpose: scope.purpose, expectedRevisions: { resolutionRevision: 'case-1:resolutionRevision:r1', criteriaSelectionRevision: 'case-1:criteriaSelectionRevision:r2', evidenceRevision: 'case-1:evidenceRevision:r3' } };
const task: DocumentTask = { id: 'task-1', caseId: scope.caseId, commandId: command.commandId, purpose: scope.purpose, state: 'working', stage: 'retrieval', createdAt: '2026-09-19T00:00:00Z', updatedAt: '2026-09-19T00:00:00Z', letterId: null, errorCode: null, lastSequence: 1 };
const completed: DocumentTask = { ...task, state: 'completed', stage: 'completed', letterId: 'letter-1', lastSequence: 3 };
const digest = `sha256:${'a'.repeat(64)}`;
const artifacts = {
  assembly: { kindKey: 'pa.initial_request', kindVersion: 1, templatePackage: 'aso-prior-auth', templateDigest: digest, canonicalMarkdown: 'Synthetic saved draft', renderedClaims: [], qa: [], contentSha256: digest },
  letter: { commandId: command.commandId, letterId: 'letter-1', caseId: scope.caseId, letterVersion: 1, qaRevision: 1, status: 'draft', committedAt: task.createdAt },
};
function frame(sequence: number, event: Record<string, unknown>, taskId = task.id) {
  return `id: ${taskId}:${sequence}\r\ndata: ${JSON.stringify(event)}\r\n\r\n`;
}
const started = frame(1, { type: 'RUN_STARTED', threadId: scope.caseId, runId: task.id });
const text = (sequence: number, delta: string) => frame(sequence, { type: 'TEXT_MESSAGE_CONTENT', messageId: task.id, delta });
function stream(body: string) { return new Response(body, { headers: { 'content-type': 'text/event-stream' } }); }
function apiMock(): DocumentTaskApi {
  return { start: vi.fn().mockResolvedValue(task), read: vi.fn().mockResolvedValue(task),
    stream: vi.fn().mockResolvedValue(stream(started)), cancel: vi.fn().mockResolvedValue({ ...task, state: 'canceled' }),
    resume: vi.fn().mockResolvedValue(task), artifacts: vi.fn().mockResolvedValue(artifacts), letterArtifacts: vi.fn().mockResolvedValue(artifacts) };
}
beforeEach(() => { sessionStorage.clear(); });
afterEach(() => { clearRuntimeCommandsForSession(scope.sessionId); vi.restoreAllMocks(); sessionStorage.clear(); });

describe('one durable document task channel', () => {
  it('retries an uncertain start with its original command and revision payload', async () => {
    const api = apiMock();
    vi.mocked(api.start).mockRejectedValueOnce(new ApiError(502, 'upstream failure'));
    const channel = createDocumentTaskChannel(scope, api);
    await channel.start(command);
    expect(channel.reset()).toBe(false);
    await channel.start({ ...command, commandId: 'must-not-replace' });
    expect(api.start).toHaveBeenNthCalledWith(2, scope.caseId, scope.practiceId, command);
    expect(channel.store.getState().task?.id).toBe(task.id);
    channel.dispose();
  });

  it('resumes at the last applied event and ignores duplicates without duplicating provisional text', async () => {
    const api = apiMock();
    vi.mocked(api.stream).mockResolvedValueOnce(stream(started + text(2, 'Synthetic first. ')))
      .mockResolvedValueOnce(stream(text(2, 'Synthetic first. ') + text(3, 'Second.')));
    const channel = createDocumentTaskChannel(scope, api);
    await channel.start(command);
    expect(channel.store.getState()).toMatchObject({ sequence: 2, provisionalText: 'Synthetic first. ', connection: 'disconnected', artifacts: null });
    await channel.reconnect();
    expect(api.stream).toHaveBeenNthCalledWith(2, task, scope.practiceId, 2, expect.any(AbortSignal));
    expect(channel.store.getState().provisionalText).toBe('Synthetic first. Second.');
    expect(api.start).toHaveBeenCalledTimes(1);
    expect(channel.store.getState().task?.state).toBe('working');
    channel.dispose();
  });

  it.each([text(3, 'Skipped.'), frame(2, { type: 'TEXT_MESSAGE_CONTENT', messageId: task.id, delta: 'Foreign.' }, 'other-task')])('refuses skipped and foreign events without advancing the cursor', async (invalid) => {
    const api = apiMock();
    vi.mocked(api.stream).mockResolvedValue(stream(started + invalid));
    const channel = createDocumentTaskChannel(scope, api);
    await channel.start(command);
    expect(channel.store.getState()).toMatchObject({ sequence: 1, provisionalText: '', artifacts: null, connection: 'disconnected' });
    channel.dispose();
  });

  it('does not treat completion prose or an unknown event as a persistence receipt', async () => {
    const api = apiMock();
    vi.mocked(api.stream).mockResolvedValue(stream(started + text(2, 'Finished and saved.') + frame(3, { type: 'FUTURE_COMPLETION', saved: true })));
    const channel = createDocumentTaskChannel(scope, api);
    await channel.start(command);
    expect(channel.store.getState().artifacts).toBeNull();
    expect(api.artifacts).not.toHaveBeenCalled();
    expect(channel.store.getState().sequence).toBe(3);
    channel.dispose();
  });

  it('loads completed artifacts only after the authoritative task status confirms persistence', async () => {
    const api = apiMock();
    vi.mocked(api.stream).mockResolvedValue(stream(started + text(2, 'Synthetic provisional') + frame(3, { type: 'RUN_FINISHED', threadId: scope.caseId, runId: task.id })));
    vi.mocked(api.read).mockResolvedValue(completed);
    const channel = createDocumentTaskChannel(scope, api);
    await channel.start(command);
    expect(channel.store.getState()).toMatchObject({ artifacts, provisionalText: '', connection: 'settled' });
    expect(api.artifacts).toHaveBeenCalledWith(completed, scope.practiceId);
    channel.dispose();
  });

  it('recovers a reload pointer without persisting text or repeating the start mutation', async () => {
    const api = apiMock();
    vi.mocked(api.stream).mockResolvedValue(stream(started + text(2, 'Synthetic secret text')));
    const prior = createDocumentTaskChannel(scope, api);
    await prior.start(command);
    const retained = Object.values(sessionStorage).join('');
    expect(retained).not.toContain('Synthetic secret text');
    expect(retained).not.toContain('canonicalMarkdown');
    const recoveryApi = apiMock();
    vi.mocked(recoveryApi.read).mockResolvedValue(completed);
    const recovered = createDocumentTaskChannel(scope, recoveryApi);
    await recovered.recover();
    expect(recoveryApi.start).not.toHaveBeenCalled();
    expect(recovered.store.getState().artifacts).toEqual(artifacts);
    prior.dispose(); recovered.dispose();
  });

  it('retains one channel across route remounts and clears its reader and all payloads at the session fence', async () => {
    const cancelReader = vi.fn();
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode(started + text(2, 'Synthetic private text') + frame(3, { type: 'CUSTOM', name: 'a2ui.surface', value: { surface: 'UnknownBlock', sourceQuote: 'Synthetic private quote' } }))); }, cancel: cancelReader });
    vi.spyOn(documentTaskApi, 'start').mockResolvedValue(task);
    vi.spyOn(documentTaskApi, 'stream').mockResolvedValue(new Response(body));
    const channel = getDocumentTaskChannel(scope);
    const running = channel.start(command);
    await vi.waitFor(() => expect(channel.store.getState().sequence).toBe(3));
    expect(getDocumentTaskChannel({ ...scope })).toBe(channel);
    expect(documentTaskApi.stream).toHaveBeenCalledTimes(1);
    clearRuntimeCommandsForSession(scope.sessionId);
    expect(cancelReader).toHaveBeenCalled();
    expect(channel.store.getState()).toMatchObject({ task: null, command: null, provisionalText: '', surfaces: [], artifacts: null });
    expect(sessionStorage.length).toBe(0);
    await running;
    const next = getDocumentTaskChannel({ ...scope, epoch: 1 });
    expect(next).not.toBe(channel);
    expect(next.store.getState().task).toBeNull();
  });

  it('cancels a waiting reader and requires an explicit reset before a new command', async () => {
    const api = apiMock();
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode(started + text(2, 'Synthetic provisional'))); } });
    vi.mocked(api.stream).mockResolvedValue(new Response(body));
    const channel = createDocumentTaskChannel(scope, api);
    const running = channel.start(command);
    await vi.waitFor(() => expect(channel.store.getState().sequence).toBe(2));
    await channel.cancel();
    await running;
    expect(channel.store.getState()).toMatchObject({ connection: 'settled', task: { state: 'canceled' }, provisionalText: '' });
    expect(channel.reset()).toBe(true);
    expect(channel.store.getState().command).toBeNull();
    channel.dispose();
  });

  it('keeps a completed cancellation race bound to the host artifact', async () => {
    const api = apiMock();
    vi.mocked(api.cancel).mockResolvedValue(completed);
    const channel = createDocumentTaskChannel(scope, api);
    await channel.start(command);
    await channel.cancel();
    expect(channel.store.getState()).toMatchObject({ task: { state: 'completed' }, artifacts });
    expect(channel.reset()).toBe(false);
    channel.dispose();
  });

  it('refuses an artifact receipt from a different case or command', () => {
    expect(() => parseTaskArtifacts({ ...artifacts, letter: { ...artifacts.letter, caseId: 'other-case' } }, completed)).toThrow();
    expect(() => parseTaskArtifacts({ ...artifacts, letter: { ...artifacts.letter, commandId: 'other-command' } }, completed)).toThrow();
    expect(() => parseTaskArtifacts(artifacts, task)).toThrow();
  });
  it('retains only the same-session recovery pointer across a revalidation epoch', async () => {
    vi.spyOn(documentTaskApi, 'start').mockResolvedValue(task);
    vi.spyOn(documentTaskApi, 'read').mockResolvedValue(task);
    vi.spyOn(documentTaskApi, 'resume').mockResolvedValue(task);
    vi.spyOn(documentTaskApi, 'stream').mockImplementation(async () => stream(started + text(2, 'Synthetic private draft')));
    const prior = getDocumentTaskChannel(scope);
    await prior.start(command);
    clearRuntimeCommandsForSession(scope.sessionId, 'revalidation');
    expect(prior.store.getState().provisionalText).toBe('');
    expect(Object.values(sessionStorage).join('')).not.toContain('Synthetic private draft');
    const current = getDocumentTaskChannel({ ...scope, epoch: 1 });
    await current.recover();
    expect(current.store.getState().command).toEqual(command);
    expect(documentTaskApi.start).toHaveBeenCalledTimes(1);
    expect(documentTaskApi.resume).toHaveBeenCalledWith(task.id, scope.practiceId);
    clearRuntimeCommandsForSession(scope.sessionId);
    expect(sessionStorage.length).toBe(0);
  });

  it('resumes an orphaned working task with its existing identity on reconnect', async () => {
    const api = apiMock();
    const channel = createDocumentTaskChannel(scope, api);
    await channel.start(command);
    await channel.reconnect();
    expect(api.resume).toHaveBeenCalledWith(task.id, scope.practiceId);
    expect(api.start).toHaveBeenCalledTimes(1);
    channel.dispose();
  });

  it('purges quarantined pointers on logout before another channel is mounted', async () => {
    vi.spyOn(documentTaskApi, 'start').mockResolvedValue(task);
    vi.spyOn(documentTaskApi, 'read').mockResolvedValue(task);
    vi.spyOn(documentTaskApi, 'stream').mockResolvedValue(stream(started));
    await getDocumentTaskChannel(scope).start(command);
    clearRuntimeCommandsForSession(scope.sessionId, 'revalidation');
    expect(sessionStorage.length).toBe(1);
    clearRuntimeCommandsForSession(scope.sessionId);
    expect(sessionStorage.length).toBe(0);
    const next = getDocumentTaskChannel({ ...scope, epoch: 1 });
    await next.recover();
    expect(next.store.getState().command).toBeNull();
  });

  it.each([{ identityId: 'other-identity' }, { sessionId: 'other-session' }, { authorizationRevision: 'r2' }, { practiceId: 'other-practice' }])(
    'does not adopt a recovery pointer under another verified scope: %j', async (changed) => {
      const api = apiMock();
      const prior = createDocumentTaskChannel(scope, api);
      await prior.start(command);
      prior.dispose(true);
      const nextApi = apiMock();
      const next = createDocumentTaskChannel({ ...scope, ...changed, epoch: 1 }, nextApi);
      await next.recover();
      expect(next.store.getState().command).toBeNull();
      expect(nextApi.read).not.toHaveBeenCalled();
      expect(nextApi.start).not.toHaveBeenCalled();
      next.dispose();
    },
  );

});
