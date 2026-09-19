import { beforeEach, describe, expect, it, vi } from 'vitest';

import { httpClient } from '@/shared/api/http-client';
import { invokeNative, isNativeRuntime } from '@/shared/native-command-client';
import type { SourcePreviewTarget } from '../model/source-preview';
import { sourcePreviewApi } from './source-preview-api';

vi.mock('@/shared/api/http-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api/http-client')>();
  return {
    ...actual,
    httpClient: { ...actual.httpClient, getBlob: vi.fn() },
  };
});

vi.mock('@/shared/native-command-client', () => ({
  invokeNative: vi.fn(),
  isNativeRuntime: vi.fn(() => false),
  requireNativeEpoch: (epoch: number | undefined) => epoch,
}));

const target: SourcePreviewTarget = {
  id: 'citation-1',
  caseId: 'case-1',
  documentId: 'document-1',
  documentName: 'Synthetic MRI',
  effectiveDate: '2026-03-14',
  pageNumber: 2,
  relevance: 'primary',
};

function headers(overrides: Record<string, string> = {}) {
  return new Headers({
    'content-type': 'application/pdf',
    'x-aso-source-document-id': 'document-1',
    'x-aso-source-effective-date': '2026-03-14',
    'x-aso-source-page': '2',
    'x-aso-source-page-count': '4',
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isNativeRuntime).mockReturnValue(false);
});

describe('sourcePreviewApi', () => {
  it('returns authoritative bytes and provenance from the audited route', async () => {
    const body = new Blob(['%PDF synthetic'], { type: 'application/pdf' });
    vi.mocked(httpClient.getBlob).mockResolvedValue({ body, headers: headers(), status: 200 });

    await expect(sourcePreviewApi.open(target, 'practice-1', 3, new AbortController().signal))
      .resolves.toMatchObject({
        documentId: 'document-1',
        effectiveDate: '2026-03-14',
        pageNumber: 2,
        pageCount: 4,
        blob: body,
      });
    expect(httpClient.getBlob).toHaveBeenCalledWith(
      '/api/cases/case-1/documents/document-1/source?page=2&practiceId=practice-1',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('refuses a body whose authoritative provenance does not match the citation', async () => {
    vi.mocked(httpClient.getBlob).mockResolvedValue({
      body: new Blob(['%PDF synthetic'], { type: 'application/pdf' }),
      headers: headers({ 'x-aso-source-document-id': 'document-other' }),
      status: 200,
    });

    await expect(sourcePreviewApi.open(target, 'practice-1', 3, new AbortController().signal))
      .rejects.toEqual(expect.objectContaining({
        status: 503,
        code: 'document_source_metadata_invalid',
      }));
  });

  it('refuses a partial response even when its provenance is valid', async () => {
    vi.mocked(httpClient.getBlob).mockResolvedValue({
      body: new Blob(['%PDF partial'], { type: 'application/pdf' }),
      headers: headers(),
      status: 206,
    });

    await expect(sourcePreviewApi.open(target, 'practice-1', 3, new AbortController().signal))
      .rejects.toEqual(expect.objectContaining({
        status: 503,
        code: 'document_source_response_invalid',
      }));
  });

  it('uses the epoch-fenced native command and returns its bounded bytes', async () => {
    vi.mocked(isNativeRuntime).mockReturnValue(true);
    vi.mocked(invokeNative).mockResolvedValue({
      documentId: 'document-1',
      effectiveDate: '2026-03-14',
      pageCount: 4,
      pageNumber: 2,
      mediaType: 'application/pdf',
      bytes: [37, 80, 68, 70],
    });

    const result = await sourcePreviewApi.open(
      target,
      'practice-1',
      7,
      new AbortController().signal,
    );

    expect(invokeNative).toHaveBeenCalledWith('document_source', {
      epoch: 7,
      caseId: 'case-1',
      documentId: 'document-1',
      practiceId: 'practice-1',
      pageNumber: 2,
    });
    expect(result).toMatchObject({
      documentId: 'document-1',
      pageCount: 4,
      mediaType: 'application/pdf',
    });
    expect(new Uint8Array(await result.blob.arrayBuffer())).toEqual(
      Uint8Array.from([37, 80, 68, 70]),
    );
  });
});
