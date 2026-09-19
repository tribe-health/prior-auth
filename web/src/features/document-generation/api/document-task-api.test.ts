import { afterEach, describe, expect, it, vi } from 'vitest';
import { httpClient } from '@/shared/api/http-client';
import { documentTaskApi } from './document-task-api';
import type { DocumentTask, GenerationCommand } from '../model/document-task';

const task: DocumentTask = { id: 'task-1', caseId: 'case-1', commandId: 'command-1', purpose: 'prior_authorization_request', state: 'working', stage: 'retrieval', createdAt: '2026-09-19T00:00:00Z', updatedAt: '2026-09-19T00:00:00Z', letterId: null, errorCode: null, lastSequence: 7 };
afterEach(() => vi.restoreAllMocks());

describe('document task HTTP contract', () => {
  it('posts the original command to the durable task endpoint', async () => {
    const command: GenerationCommand = { commandId: 'command-1', purpose: task.purpose, expectedRevisions: { resolutionRevision: 'r1', criteriaSelectionRevision: 'r2', evidenceRevision: 'r3' } };
    const post = vi.spyOn(httpClient, 'post').mockResolvedValue(task);
    await documentTaskApi.start('case-1', 'practice-1', command);
    expect(post).toHaveBeenCalledWith('/api/cases/case-1/document-tasks?practiceId=practice-1', command);
  });
  it('streams only the authorized task reference and resumes with its durable cursor', async () => {
    const stream = vi.spyOn(httpClient, 'stream').mockResolvedValue(new Response());
    const signal = new AbortController().signal;
    await documentTaskApi.stream(task, 'practice-1', 7, signal);
    expect(stream).toHaveBeenCalledWith('/agent/run', expect.objectContaining({ method: 'POST', signal, headers: { 'Last-Event-ID': 'task-1:7' } }));
    const input = JSON.parse(stream.mock.calls[0]![1].body as string) as unknown;
    expect(input).toEqual({ threadId: 'case-1', runId: 'task-1', state: {}, messages: [], tools: [], context: [], forwardedProps: { task: { practiceId: 'practice-1', taskId: 'task-1' } } });
  });
  it('reads a historical saved-letter assembly as the host supplied null', async () => {
    const get = vi.spyOn(httpClient, 'get').mockResolvedValue(null);
    expect(await documentTaskApi.letterArtifacts('letter-1', 'case-1', 'practice-1')).toBeNull();
    expect(get).toHaveBeenCalledWith('/api/letters/letter-1/assembly?practiceId=practice-1');
  });
});
