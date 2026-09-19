import { httpClient } from '@/shared/api/http-client';
import { invokeNative, isNativeRuntime, requireNativeEpoch } from '@/shared/native-command-client';
import type { AnnotationMutation, AnnotationResult } from '../model/annotation';

function resource(caseId: string, annotationId: string, practiceId: string): string {
  return `/api/cases/${encodeURIComponent(caseId)}/annotations/${encodeURIComponent(annotationId)}`
    + `?practiceId=${encodeURIComponent(practiceId)}`;
}

export const annotationApi = {
  save: (
    caseId: string,
    annotationId: string,
    practiceId: string,
    mutation: AnnotationMutation,
    epoch?: number,
  ) => isNativeRuntime()
    ? invokeNative<AnnotationResult>('save_annotation', {
        epoch: requireNativeEpoch(epoch),
        caseId,
        annotationId,
        practiceId,
        request: mutation,
      })
    : httpClient.post<AnnotationResult>(resource(caseId, annotationId, practiceId), mutation),

  lookupCommand: (
    caseId: string,
    annotationId: string,
    commandId: string,
    practiceId: string,
    epoch?: number,
  ) => isNativeRuntime()
    ? invokeNative<AnnotationResult>('lookup_annotation_command', {
        epoch: requireNativeEpoch(epoch),
        caseId,
        annotationId,
        practiceId,
        commandId,
      })
    : httpClient.get<AnnotationResult>(
        `${resource(caseId, annotationId, practiceId).split('?')[0]}`
          + `/commands/${encodeURIComponent(commandId)}`
          + `?practiceId=${encodeURIComponent(practiceId)}`,
      ),
};
