import { httpClient } from '../../../shared/api/http-client';
import {
  invokeNative,
  isNativeRuntime,
  requireNativeEpoch,
} from '../../../shared/native-command-client';
import type { GateCommandResult, GateMutation, GateSnapshot } from '../model/gate-state';

// Feature API modules are the only callers of the http client. They translate
// transport shapes into feature model types and nothing else — no React, no
// component state.

function gatePath(caseId: string, suffix: string, practiceId?: string): string {
  const selection = practiceId ? `?practiceId=${encodeURIComponent(practiceId)}` : '';
  return `/api/cases/${encodeURIComponent(caseId)}/gate${suffix}${selection}`;
}

export const gateApi = {
  read: (caseId: string, practiceId?: string, epoch?: number) =>
    isNativeRuntime()
      ? invokeNative<GateSnapshot>('gate_state', {
          epoch: requireNativeEpoch(epoch),
          caseId,
          practiceId: practiceId ?? null,
        })
      : httpClient.get<GateSnapshot>(gatePath(caseId, '', practiceId)),

  affirm: (caseId: string, request: GateMutation, practiceId?: string, epoch?: number) =>
    isNativeRuntime()
      ? invokeNative<GateCommandResult>('affirm_gate', {
          epoch: requireNativeEpoch(epoch),
          caseId,
          practiceId: practiceId ?? null,
          request,
        })
      : httpClient.post<GateCommandResult>(gatePath(caseId, '/affirm', practiceId), request),

  remove: (caseId: string, request: GateMutation, practiceId?: string, epoch?: number) =>
    isNativeRuntime()
      ? invokeNative<GateCommandResult>('remove_gate', {
          epoch: requireNativeEpoch(epoch),
          caseId,
          practiceId: practiceId ?? null,
          request,
        })
      : httpClient.post<GateCommandResult>(gatePath(caseId, '/remove', practiceId), request),

  lookupCommand: (caseId: string, commandId: string, practiceId?: string, epoch?: number) =>
    isNativeRuntime()
      ? invokeNative<GateCommandResult>('lookup_gate_command', {
          epoch: requireNativeEpoch(epoch),
          caseId,
          practiceId: practiceId ?? null,
          commandId,
        })
      : httpClient.get<GateCommandResult>(
          gatePath(caseId, `/commands/${encodeURIComponent(commandId)}`, practiceId),
        ),
};
