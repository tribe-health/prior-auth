import { httpClient } from '@/shared/api/http-client';
import { parseDocumentTask, parseLetterArtifacts, parseTaskArtifacts, type DocumentTask, type GenerationCommand } from '../model/document-task';

const query = (practiceId: string) => `?practiceId=${encodeURIComponent(practiceId)}`;
const taskPath = (taskId: string) => `/api/document-tasks/${encodeURIComponent(taskId)}`;

export const documentTaskApi = {
  letterArtifacts: async (letterId: string, caseId: string, practiceId: string) => parseLetterArtifacts(await httpClient.get<unknown>(`/api/letters/${encodeURIComponent(letterId)}/assembly${query(practiceId)}`), letterId, caseId),
  start: async (caseId: string, practiceId: string, command: GenerationCommand) => parseDocumentTask(await httpClient.post<unknown>(
    `/api/cases/${encodeURIComponent(caseId)}/document-tasks${query(practiceId)}`, command,
  )),
  read: async (taskId: string, practiceId: string) => parseDocumentTask(await httpClient.get<unknown>(`${taskPath(taskId)}${query(practiceId)}`)),
  cancel: async (taskId: string, practiceId: string) => parseDocumentTask(await httpClient.post<unknown>(`${taskPath(taskId)}/cancel${query(practiceId)}`, {})),
  resume: async (taskId: string, practiceId: string) => parseDocumentTask(await httpClient.post<unknown>(`${taskPath(taskId)}/resume${query(practiceId)}`, {})),
  artifacts: async (task: DocumentTask, practiceId: string) => parseTaskArtifacts(await httpClient.get<unknown>(`${taskPath(task.id)}/artifacts${query(practiceId)}`), task),
  stream: (task: DocumentTask, practiceId: string, afterSequence: number, signal: AbortSignal) => httpClient.stream('/agent/run', {
    method: 'POST', signal,
    headers: afterSequence > 0 ? { 'Last-Event-ID': `${task.id}:${afterSequence}` } : {},
    body: JSON.stringify({ threadId: task.caseId, runId: task.id, state: {}, messages: [], tools: [], context: [], forwardedProps: { task: { practiceId, taskId: task.id } } }),
  }),
};
export type DocumentTaskApi = typeof documentTaskApi;
