import { httpClient } from '../../../shared/api/http-client';
import type { GateAffirmationKind, GateState } from '../model/gate-state';

// Feature API modules are the only callers of the http client. They translate
// transport shapes into feature model types and nothing else — no React, no
// component state.

export const gateApi = {
  read: (caseId: string) => httpClient.get<GateState>(`/api/cases/${caseId}/gate`),

  affirm: (caseId: string, kind: GateAffirmationKind, actor: string) =>
    httpClient.post<GateState>(`/api/cases/${caseId}/gate/affirm`, { kind, actor }),
};
