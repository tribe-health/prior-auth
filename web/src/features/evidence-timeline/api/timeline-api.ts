// The read path and the write path are different paths, on purpose.
//
// READS come from the committed PEM graph projection, which Electric keeps
// current (ADR-007). No query cache sits in front of it — the synced graph
// already knows freshness, and a cache would be a second answer to the same
// question (ADR-001).
//
// WRITES go to the Axum API over HTTP. They never touch the local store
// directly, because clinical authority is checked on the server at three
// layers (ADR-002) and a local write would bypass all three. The local copy
// updates when the change syncs back — which is what makes the round trip the
// confirmation rather than an optimistic guess.

import { httpClient } from '../../../shared/api/http-client';
import {
  invokeNative,
  isNativeRuntime,
  requireNativeEpoch,
} from '../../../shared/native-command-client';
import type { EvidenceState } from '../../../shared/model/evidence-state';
import type { ReassessEvidenceResult } from '../model/timeline-entry';

function practiceSelection(practiceId: string): string {
  return `?practiceId=${encodeURIComponent(practiceId)}`;
}

/** Writes. Server-side, audited, capability-checked — never a local mutation. */
export const timelineApi = {
  reassess: (
    caseId: string,
    entryId: string,
    commandId: string,
    state: EvidenceState,
    expectedAssessedAt: string,
    practiceId: string,
    epoch?: number,
  ) => {
    const request = { commandId, state, expectedAssessedAt };
    return isNativeRuntime()
      ? invokeNative<ReassessEvidenceResult>('reassess_evidence', {
          epoch: requireNativeEpoch(epoch),
          caseId,
          evidenceId: entryId,
          practiceId,
          request,
        })
      : httpClient.post<ReassessEvidenceResult>(
          `/api/cases/${encodeURIComponent(caseId)}/evidence/${encodeURIComponent(entryId)}/state` +
            practiceSelection(practiceId),
          request,
        );
  },

  lookupCommand: (
    caseId: string,
    entryId: string,
    commandId: string,
    practiceId: string,
    epoch?: number,
  ) =>
    isNativeRuntime()
      ? invokeNative<ReassessEvidenceResult>('lookup_reassessment_command', {
          epoch: requireNativeEpoch(epoch),
          caseId,
          evidenceId: entryId,
          practiceId,
          commandId,
        })
      : httpClient.get<ReassessEvidenceResult>(
          `/api/cases/${encodeURIComponent(caseId)}/evidence/${encodeURIComponent(entryId)}` +
            `/commands/${encodeURIComponent(commandId)}` + practiceSelection(practiceId),
        ),
};
