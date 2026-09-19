import type { LetterCommandReceipt, LetterSnapshot } from '@/features/letter-workflow/model/letter-workflow';
import { parseDocumentAssembly, type DocumentAssembly } from './document-surfaces';

export type DocumentPurpose = LetterSnapshot['purpose'];
export type GenerationCommand = {
  readonly commandId: string;
  readonly purpose: DocumentPurpose;
  readonly expectedRevisions: {
    readonly resolutionRevision: string;
    readonly criteriaSelectionRevision: string;
    readonly evidenceRevision: string;
  };
};
export const TASK_STATES = ['submitted', 'working', 'input-required', 'completed', 'canceled', 'failed', 'rejected', 'auth-required'] as const;
export type DocumentTask = {
  readonly id: string;
  readonly caseId: string;
  readonly commandId: string;
  readonly purpose: DocumentPurpose;
  readonly state: typeof TASK_STATES[number];
  readonly stage: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly letterId: string | null;
  readonly errorCode: string | null;
  readonly lastSequence: number;
};
export type DocumentTaskArtifacts = { readonly assembly: DocumentAssembly; readonly letter: LetterCommandReceipt };
export type TaskScope = {
  readonly identityId: string;
  readonly sessionId: string;
  readonly authorizationRevision: string;
  readonly epoch: number;
  readonly practiceId: string;
  readonly caseId: string;
  readonly purpose: DocumentPurpose;
};

export function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function terminalTask(task: DocumentTask): boolean {
  return ['completed', 'canceled', 'failed', 'rejected'].includes(task.state);
}
export function pausedTask(task: DocumentTask): boolean {
  return task.state === 'input-required' || task.state === 'auth-required';
}
export function parseDocumentTask(value: unknown): DocumentTask {
  if (!object(value) || !['id', 'caseId', 'commandId', 'stage', 'createdAt', 'updatedAt'].every((key) => typeof value[key] === 'string' && value[key] !== '')
    || !TASK_STATES.includes(value.state as DocumentTask['state'])
    || !['prior_authorization_request', 'corrected_resubmission', 'clinical_appeal'].includes(value.purpose as string)
    || !(value.letterId === null || typeof value.letterId === 'string')
    || !(value.errorCode === null || typeof value.errorCode === 'string')
    || !Number.isSafeInteger(value.lastSequence) || (value.lastSequence as number) < 0) {
    throw new Error('The document task response is invalid.');
  }
  return value as DocumentTask;
}
export function parseTaskArtifacts(value: unknown, task: DocumentTask): DocumentTaskArtifacts {
  const result = parseLetterArtifacts(value, task.letterId ?? '', task.caseId);
  if (!result || task.state !== 'completed' || result.letter.commandId !== task.commandId) {
    throw new Error('The artifact does not match the completed document task.');
  }
  return result;
}
export function parseLetterArtifacts(value: unknown, letterId: string, caseId: string): DocumentTaskArtifacts | null {
  if (value === null) return null;
  if (!object(value) || !object(value.letter)) throw new Error('The document artifact response is invalid.');
  const assembly = parseDocumentAssembly(value.assembly);
  const letter = value.letter;
  if (!assembly || letter.letterId !== letterId || letter.caseId !== caseId || typeof letter.commandId !== 'string'
    || !Number.isSafeInteger(letter.letterVersion) || (letter.letterVersion as number) < 1
    || !Number.isSafeInteger(letter.qaRevision) || typeof letter.status !== 'string' || typeof letter.committedAt !== 'string') {
    throw new Error('The artifact does not match the completed document task.');
  }
  return { assembly, letter: letter as unknown as LetterCommandReceipt };
}
