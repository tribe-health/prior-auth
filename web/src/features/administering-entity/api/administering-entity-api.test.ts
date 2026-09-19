import { beforeEach, describe, expect, it, vi } from 'vitest';

import { httpClient } from '@/shared/api/http-client';
import { administeringEntityApi } from './administering-entity-api';

vi.mock('@/shared/api/http-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api/http-client')>();
  return {
    ...actual,
    httpClient: { ...actual.httpClient, get: vi.fn(), post: vi.fn() },
  };
});

beforeEach(() => vi.clearAllMocks());

describe('administeringEntityApi', () => {
  it('uses exact verified-practice resource and command lookup routes', async () => {
    vi.mocked(httpClient.get).mockResolvedValue({});
    vi.mocked(httpClient.post).mockResolvedValue({});
    const mutation = { commandId: 'command/1', expectedCaseInputRevision: 3 };

    await administeringEntityApi.read('case/1', 'practice/1');
    await administeringEntityApi.resolve('case/1', 'practice/1', mutation);
    await administeringEntityApi.lookup('case/1', 'command/1', 'practice/1');

    expect(httpClient.get).toHaveBeenNthCalledWith(
      1,
      '/api/cases/case%2F1/administering-entity?practiceId=practice%2F1',
    );
    expect(httpClient.post).toHaveBeenCalledWith(
      '/api/cases/case%2F1/administering-entity?practiceId=practice%2F1',
      mutation,
    );
    expect(httpClient.get).toHaveBeenNthCalledWith(
      2,
      '/api/cases/case%2F1/administering-entity/commands/command%2F1?practiceId=practice%2F1',
    );
  });
});
