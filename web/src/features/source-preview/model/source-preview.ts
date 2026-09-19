import type { TimelineCitation } from '@/features/evidence-timeline/model/timeline-entry';

export const MAX_SOURCE_BYTES = 16 * 1024 * 1024;

export interface SourcePreviewTarget extends TimelineCitation {
  readonly caseId: string;
  readonly pageNumber: number;
}

export interface AuthorizedSource {
  readonly documentId: string;
  readonly documentName: string;
  readonly effectiveDate: string;
  readonly pageNumber: number;
  readonly pageCount: number;
  readonly mediaType: string;
  readonly blob: Blob;
}

export interface RenderedSource extends Omit<AuthorizedSource, 'blob'> {
  readonly citationId: string;
  readonly objectUrl: string;
}

export type SourcePreviewState =
  | { readonly phase: 'closed' }
  | { readonly phase: 'loading'; readonly target: SourcePreviewTarget }
  | { readonly phase: 'ready'; readonly source: RenderedSource }
  | {
      readonly phase: 'refused' | 'unavailable';
      readonly target: SourcePreviewTarget;
      readonly message: string;
    };

export function sourceTarget(
  caseId: string,
  citation: TimelineCitation,
  pageNumber = citation.pageNumber,
): SourcePreviewTarget | null {
  if (pageNumber === null || !Number.isInteger(pageNumber) || pageNumber < 1) return null;
  return { ...citation, caseId, pageNumber };
}
