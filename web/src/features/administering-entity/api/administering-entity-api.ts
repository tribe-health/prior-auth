import { httpClient } from '@/shared/api/http-client';
import type {
  AdministeringEntityResolution,
  ResolutionCommandReceipt,
  ResolveMutation,
} from '../model/administering-entity';

function practiceSelection(practiceId: string): string {
  return `?practiceId=${encodeURIComponent(practiceId)}`;
}

function resource(caseId: string, practiceId: string): string {
  return `/api/cases/${encodeURIComponent(caseId)}/administering-entity`
    + practiceSelection(practiceId);
}

export const administeringEntityApi = {
  read: (caseId: string, practiceId: string) =>
    httpClient.get<AdministeringEntityResolution>(resource(caseId, practiceId)),

  resolve: (caseId: string, practiceId: string, mutation: ResolveMutation) =>
    httpClient.post<ResolutionCommandReceipt>(resource(caseId, practiceId), mutation),

  lookup: (caseId: string, commandId: string, practiceId: string) =>
    httpClient.get<ResolutionCommandReceipt>(
      `/api/cases/${encodeURIComponent(caseId)}/administering-entity/commands/`
      + `${encodeURIComponent(commandId)}${practiceSelection(practiceId)}`,
    ),
};
