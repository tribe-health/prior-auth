import { httpClient } from '@/shared/api/http-client';
import type { LetterCommandReceipt, LetterSnapshot } from '../model/letter-workflow';

const query = (practiceId: string) => `?practiceId=${encodeURIComponent(practiceId)}`;

export const letterWorkflowApi = {
  generate: (caseId: string, practiceId: string, body: unknown) => httpClient.post<LetterCommandReceipt>(
    `/api/cases/${encodeURIComponent(caseId)}/letters${query(practiceId)}`, body,
  ),
  read: (letterId: string, practiceId: string) => httpClient.get<LetterSnapshot>(
    `/api/letters/${encodeURIComponent(letterId)}${query(practiceId)}`,
  ),
  review: (letterId: string, practiceId: string, body: unknown) => httpClient.post<LetterCommandReceipt>(
    `/api/letters/${encodeURIComponent(letterId)}/qa${query(practiceId)}`, body,
  ),
  approve: (letterId: string, practiceId: string, body: unknown) => httpClient.post<LetterCommandReceipt>(
    `/api/letters/${encodeURIComponent(letterId)}/approve${query(practiceId)}`, body,
  ),
  lookup: (caseId: string, commandId: string, practiceId: string) => httpClient.get<LetterCommandReceipt>(
    `/api/cases/${encodeURIComponent(caseId)}/letter-commands/${encodeURIComponent(commandId)}${query(practiceId)}`,
  ),
};
