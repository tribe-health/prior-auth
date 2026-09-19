import { httpClient } from '@/shared/api/http-client';
import type { DenialDetermination, ResponseModeReceipt } from '../model/denial-response';

const path = (caseId: string, practiceId: string, suffix = '') =>
  `/api/cases/${encodeURIComponent(caseId)}/determinations${suffix}?practiceId=${encodeURIComponent(practiceId)}`;

export const denialResponseApi = {
  latest: (caseId: string, practiceId: string) =>
    httpClient.get<DenialDetermination>(path(caseId, practiceId, '/latest')),
  record: (caseId: string, practiceId: string, body: unknown) =>
    httpClient.post<DenialDetermination>(path(caseId, practiceId), body),
  confirmMode: (caseId: string, practiceId: string, body: unknown) =>
    httpClient.post<ResponseModeReceipt>(path(caseId, practiceId, '/response-mode'), body),
};
