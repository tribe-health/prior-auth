import { beforeEach, describe, expect, it, vi } from 'vitest';

import { httpClient } from '@/shared/api/http-client';
import type { CaseInput } from '../model/case-command';
import { caseApi } from './case-api';

vi.mock('@/shared/api/http-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api/http-client')>();
  return {
    ...actual,
    httpClient: {
      ...actual.httpClient,
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
    },
  };
});

const input: CaseInput = {
  caseNumber: 'SYNTHETIC-001',
  patientId: 'patient-1',
  surgeonId: 'surgeon-1',
  coordinatorId: null,
  facilityId: null,
  payerId: 'payer-1',
  memberId: null,
  dateOfService: '2026-09-17',
  procedureCode: '22840',
  planKey: null,
  data: {},
};

beforeEach(() => vi.clearAllMocks());

describe('caseApi', () => {
  it('uses the verified-practice case routes and exact command bodies', async () => {
    vi.mocked(httpClient.get).mockResolvedValue({});
    vi.mocked(httpClient.post).mockResolvedValue({});
    vi.mocked(httpClient.patch).mockResolvedValue({});

    const create = { commandId: 'command-create', caseId: 'case-1', input };
    const update = { commandId: 'command-update', expectedRevision: 3, input };
    const transition = {
      commandId: 'command-transition',
      expectedStatusRevision: 2,
      targetStatus: 'evidence' as const,
    };

    await caseApi.read('case/1', 'practice/1');
    await caseApi.create('practice/1', create);
    await caseApi.update('case/1', 'practice/1', update);
    await caseApi.transition('case/1', 'practice/1', transition);
    await caseApi.lookupCreate('command/create', 'practice/1');
    await caseApi.lookup('case/1', 'command/update', 'practice/1');

    expect(httpClient.get).toHaveBeenNthCalledWith(
      1,
      '/api/cases/case%2F1?practiceId=practice%2F1',
    );
    expect(httpClient.post).toHaveBeenNthCalledWith(
      1,
      '/api/cases?practiceId=practice%2F1',
      create,
    );
    expect(httpClient.patch).toHaveBeenCalledWith(
      '/api/cases/case%2F1?practiceId=practice%2F1',
      update,
    );
    expect(httpClient.post).toHaveBeenNthCalledWith(
      2,
      '/api/cases/case%2F1/status?practiceId=practice%2F1',
      transition,
    );
    expect(httpClient.get).toHaveBeenNthCalledWith(
      2,
      '/api/case-commands/command%2Fcreate?practiceId=practice%2F1',
    );
    expect(httpClient.get).toHaveBeenNthCalledWith(
      3,
      '/api/cases/case%2F1/commands/command%2Fupdate?practiceId=practice%2F1',
    );
  });
});
