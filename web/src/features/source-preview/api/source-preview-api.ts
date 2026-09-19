import { ApiError, httpClient } from '@/shared/api/http-client';
import {
  invokeNative,
  isNativeRuntime,
  requireNativeEpoch,
} from '@/shared/native-command-client';
import {
  MAX_SOURCE_BYTES,
  type AuthorizedSource,
  type SourcePreviewTarget,
} from '../model/source-preview';

function requiredHeader(headers: Headers, name: string): string {
  const value = headers.get(name);
  if (!value) throw new ApiError(503, 'document_source_metadata_invalid');
  return value;
}

function positiveInteger(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new ApiError(503, 'document_source_metadata_invalid');
  }
  return parsed;
}

export interface SourcePreviewService {
  open(
    target: SourcePreviewTarget,
    practiceId: string,
    epoch: number,
    signal: AbortSignal,
  ): Promise<AuthorizedSource>;
}

interface NativeDocumentSource {
  readonly documentId: string;
  readonly effectiveDate: string;
  readonly pageCount: number;
  readonly pageNumber: number;
  readonly mediaType: string;
  readonly bytes: readonly number[];
}

function abortIfRequested(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('The source request was aborted.', 'AbortError');
}

function validateNativeBytes(bytes: readonly number[]): ArrayBuffer {
  if (
    !Array.isArray(bytes)
    || bytes.length === 0
    || bytes.length > MAX_SOURCE_BYTES
    || bytes.some((value) => !Number.isInteger(value) || value < 0 || value > 255)
  ) {
    throw new ApiError(503, 'document_source_size_invalid');
  }
  return Uint8Array.from(bytes).buffer as ArrayBuffer;
}

export const sourcePreviewApi: SourcePreviewService = {
  async open(target, practiceId, epoch, signal) {
    abortIfRequested(signal);
    if (isNativeRuntime()) {
      const source = await invokeNative<NativeDocumentSource>('document_source', {
        epoch: requireNativeEpoch(epoch),
        caseId: target.caseId,
        documentId: target.documentId,
        practiceId,
        pageNumber: target.pageNumber,
      });
      abortIfRequested(signal);
      if (
        source.documentId !== target.documentId
        || source.effectiveDate !== target.effectiveDate
        || source.pageNumber !== target.pageNumber
        || !Number.isInteger(source.pageCount)
        || source.pageCount < source.pageNumber
        || !source.mediaType
      ) {
        throw new ApiError(503, 'document_source_metadata_invalid');
      }
      const bytes = validateNativeBytes(source.bytes);
      return {
        documentId: source.documentId,
        documentName: target.documentName,
        effectiveDate: source.effectiveDate,
        pageNumber: source.pageNumber,
        pageCount: source.pageCount,
        mediaType: source.mediaType,
        blob: new Blob([bytes], { type: source.mediaType }),
      };
    }
    const query = new URLSearchParams({
      page: String(target.pageNumber),
      practiceId,
    });
    const response = await httpClient.getBlob(
      `/api/cases/${encodeURIComponent(target.caseId)}/documents/${encodeURIComponent(target.documentId)}/source?${query}`,
      { signal },
    );
    if (response.status !== 200) {
      throw new ApiError(503, 'document_source_response_invalid');
    }
    const documentId = requiredHeader(response.headers, 'x-aso-source-document-id');
    const effectiveDate = requiredHeader(response.headers, 'x-aso-source-effective-date');
    const pageNumber = positiveInteger(requiredHeader(response.headers, 'x-aso-source-page'));
    const pageCount = positiveInteger(requiredHeader(response.headers, 'x-aso-source-page-count'));

    if (
      documentId !== target.documentId
      || effectiveDate !== target.effectiveDate
      || pageNumber !== target.pageNumber
      || pageNumber > pageCount
    ) {
      throw new ApiError(503, 'document_source_metadata_invalid');
    }
    if (response.body.size === 0 || response.body.size > MAX_SOURCE_BYTES) {
      throw new ApiError(503, 'document_source_size_invalid');
    }

    return {
      documentId,
      documentName: target.documentName,
      effectiveDate,
      pageNumber,
      pageCount,
      mediaType: response.body.type || requiredHeader(response.headers, 'content-type'),
      blob: response.body,
    };
  },
};
