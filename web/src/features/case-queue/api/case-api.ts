import { httpClient } from '@/shared/api/http-client';
import type {
  CaseCommandReceipt,
  CaseDetailRecord,
  CreateCaseMutation,
  TransitionCaseMutation,
  UpdateCaseMutation,
} from '../model/case-command';

function practiceSelection(practiceId: string): string {
  return `?practiceId=${encodeURIComponent(practiceId)}`;
}

function caseResource(caseId: string, practiceId: string): string {
  return `/api/cases/${encodeURIComponent(caseId)}${practiceSelection(practiceId)}`;
}

export const caseApi = {
  read: (caseId: string, practiceId: string) =>
    httpClient.get<CaseDetailRecord>(caseResource(caseId, practiceId)),

  create: (practiceId: string, mutation: CreateCaseMutation) =>
    httpClient.post<CaseCommandReceipt>(`/api/cases${practiceSelection(practiceId)}`, mutation),

  update: (caseId: string, practiceId: string, mutation: UpdateCaseMutation) =>
    httpClient.patch<CaseCommandReceipt>(caseResource(caseId, practiceId), mutation),

  transition: (
    caseId: string,
    practiceId: string,
    mutation: TransitionCaseMutation,
  ) => httpClient.post<CaseCommandReceipt>(
    `/api/cases/${encodeURIComponent(caseId)}/status${practiceSelection(practiceId)}`,
    mutation,
  ),

  lookupCreate: (commandId: string, practiceId: string) =>
    httpClient.get<CaseCommandReceipt>(
      `/api/case-commands/${encodeURIComponent(commandId)}${practiceSelection(practiceId)}`,
    ),

  lookup: (caseId: string, commandId: string, practiceId: string) =>
    httpClient.get<CaseCommandReceipt>(
      `/api/cases/${encodeURIComponent(caseId)}/commands/${encodeURIComponent(commandId)}`
        + practiceSelection(practiceId),
    ),
};
