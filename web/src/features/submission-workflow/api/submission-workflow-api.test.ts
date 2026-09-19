import { afterEach, expect, it, vi } from 'vitest';
import { httpClient } from '@/shared/api/http-client';
import { acknowledgedView, sentPacket, sentView, signedPacket } from '../model/submission-workflow.test-fixtures';
import { submissionWorkflowApi } from './submission-workflow-api';

afterEach(() => vi.restoreAllMocks());
it('uses the scoped host packet and receipt routes', async () => {
  const get = vi.spyOn(httpClient, 'get').mockResolvedValueOnce(signedPacket).mockResolvedValueOnce(sentView);
  await submissionWorkflowApi.packet('case-1', 'practice-1');
  await submissionWorkflowApi.receipt('case-1', 'practice-1');
  expect(get.mock.calls).toEqual([['/api/cases/case-1/submission-packet?practiceId=practice-1'], ['/api/cases/case-1/submission-receipt?practiceId=practice-1']]);
});
it('keeps submission and acknowledgement mutations on separate routes', async () => {
  const submit = { commandId: 'submit-command-1', expectedLetterRevision: 12 };
  const acknowledge = { commandId: 'ack-command-1', submissionId: 'submission-1', payerReference: 'SYNTHETIC', acknowledgedAt: '2026-09-19T14:00:00Z', pageCount: 6 };
  const post = vi.spyOn(httpClient, 'post').mockResolvedValueOnce(sentPacket).mockResolvedValueOnce(acknowledgedView);
  await submissionWorkflowApi.submit('case-1', 'practice-1', submit);
  await submissionWorkflowApi.acknowledge('case-1', 'practice-1', acknowledge);
  expect(post.mock.calls).toEqual([['/api/cases/case-1/submissions?practiceId=practice-1', submit], ['/api/cases/case-1/submission-acknowledgements?practiceId=practice-1', acknowledge]]);
});
