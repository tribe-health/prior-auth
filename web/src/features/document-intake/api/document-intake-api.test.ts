import { beforeEach, describe, expect, it, vi } from 'vitest';

const httpClient = vi.hoisted(() => ({ postForm: vi.fn(), get: vi.fn() }));
vi.mock('@/shared/api/http-client', () => ({ httpClient }));

import { documentIntakeApi, sha256File } from './document-intake-api';

beforeEach(() => vi.clearAllMocks());

describe('document intake API', () => {
  it('sends the exact multipart upload contract and hashes the selected bytes', async () => {
    httpClient.postForm.mockResolvedValue({ documentId: 'document-1' });
    const file = new File(['synthetic chart note'], 'note.txt', { type: 'text/plain' });
    const contentSha256 = await sha256File(file);

    await documentIntakeApi.upload('case/1', 'practice 1', {
      commandId: 'command-1', documentId: 'document-1', expectedCaseInputRevision: 3,
      expectedDocumentSetRevision: 2, documentTypeKey: 'office-visit-note',
      name: 'Synthetic chart note', effectiveDate: '2026-09-18',
      mediaType: 'text/plain', contentSha256, file,
    });

    const [path, form] = httpClient.postForm.mock.calls[0] as [string, FormData];
    expect(path).toBe('/api/cases/case%2F1/documents?practiceId=practice%201');
    expect(Object.fromEntries([...form.entries()].filter(([key]) => key !== 'file'))).toEqual({
      commandId: 'command-1', documentId: 'document-1', expectedCaseInputRevision: '3',
      expectedDocumentSetRevision: '2', documentTypeKey: 'office-visit-note',
      name: 'Synthetic chart note', effectiveDate: '2026-09-18', mediaType: 'text/plain',
      contentSha256,
    });
    const uploaded = form.get('file') as File;
    expect(uploaded).toMatchObject({ name: 'note.txt', type: 'text/plain', size: file.size });
    expect(await uploaded.text()).toBe('synthetic chart note');
    expect(contentSha256).toMatch(/^[0-9a-f]{64}$/);
  });
});
