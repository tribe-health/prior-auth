import { httpClient } from '@/shared/api/http-client';
import type { AssembleEvidenceMutation, EvidenceCommandReceipt, EvidenceSnapshot } from '../model/evidence-assembly';

function query(practiceId: string) {
  return `?practiceId=${encodeURIComponent(practiceId)}`;
}

export const evidenceAssemblyApi = {
  read: (caseId: string, practiceId: string) => httpClient.get<EvidenceSnapshot>(
    `/api/cases/${encodeURIComponent(caseId)}/evidence${query(practiceId)}`,
  ),
  assemble: (caseId: string, practiceId: string, mutation: AssembleEvidenceMutation) =>
    httpClient.post<EvidenceCommandReceipt>(
      `/api/cases/${encodeURIComponent(caseId)}/evidence/assemble${query(practiceId)}`,
      mutation,
    ),
  lookup: (caseId: string, commandId: string, practiceId: string) =>
    httpClient.get<EvidenceCommandReceipt>(
      `/api/cases/${encodeURIComponent(caseId)}/evidence-commands/${encodeURIComponent(commandId)}${query(practiceId)}`,
    ),
};
