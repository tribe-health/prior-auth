import { httpClient } from '@/shared/api/http-client';
import { parsePacket, parseReceiptView, type AcknowledgePacketCommand, type SubmitPacketCommand } from '../model/submission-workflow';

const endpoint = (caseId: string, resource: string, practiceId: string) => `/api/cases/${encodeURIComponent(caseId)}/${resource}?practiceId=${encodeURIComponent(practiceId)}`;
export const submissionWorkflowApi = {
  packet: async (caseId: string, practiceId: string) => parsePacket(await httpClient.get<unknown>(endpoint(caseId, 'submission-packet', practiceId)), caseId),
  receipt: async (caseId: string, practiceId: string) => parseReceiptView(await httpClient.get<unknown>(endpoint(caseId, 'submission-receipt', practiceId)), caseId),
  submit: async (caseId: string, practiceId: string, command: SubmitPacketCommand) => parsePacket(await httpClient.post<unknown>(endpoint(caseId, 'submissions', practiceId), command), caseId),
  acknowledge: async (caseId: string, practiceId: string, command: AcknowledgePacketCommand) => parseReceiptView(await httpClient.post<unknown>(endpoint(caseId, 'submission-acknowledgements', practiceId), command), caseId),
};
export type SubmissionWorkflowApi = typeof submissionWorkflowApi;
