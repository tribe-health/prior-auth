import { httpClient } from '@/shared/api/http-client';
import type {
  CriteriaCatalogSnapshot,
  CriteriaSelectionReceipt,
  CriteriaSelectionSnapshot,
  SelectCriteriaMutation,
} from '../model/criteria-selection';

function query(practiceId: string, extra = ''): string {
  return `?practiceId=${encodeURIComponent(practiceId)}${extra}`;
}

export const criteriaSelectionApi = {
  catalog: (payerId: string, practiceId: string) => httpClient.get<CriteriaCatalogSnapshot>(
    `/api/criteria/catalog${query(practiceId, `&payerId=${encodeURIComponent(payerId)}`)}`,
  ),
  read: (caseId: string, practiceId: string) => httpClient.get<CriteriaSelectionSnapshot>(
    `/api/cases/${encodeURIComponent(caseId)}/criteria-selection${query(practiceId)}`,
  ),
  select: (caseId: string, practiceId: string, mutation: SelectCriteriaMutation) =>
    httpClient.post<CriteriaSelectionReceipt>(
      `/api/cases/${encodeURIComponent(caseId)}/criteria-selection${query(practiceId)}`,
      mutation,
    ),
  lookup: (caseId: string, commandId: string, practiceId: string) =>
    httpClient.get<CriteriaSelectionReceipt>(
      `/api/cases/${encodeURIComponent(caseId)}/criteria-selection/commands/`
      + `${encodeURIComponent(commandId)}${query(practiceId)}`,
    ),
};
