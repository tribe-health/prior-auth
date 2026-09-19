import { ApiError } from '@/shared/api/http-client';

export const MAX_DOCUMENT_UPLOAD_BYTES = 16 * 1024 * 1024;

export const DOCUMENT_TYPES = [
  ['office-visit-note', 'Office visit note'],
  ['mri-report', 'MRI report'],
  ['ct-myelogram-report', 'CT myelogram report'],
  ['physical-therapy-note', 'Physical therapy note'],
  ['injection-procedure-note', 'Injection procedure note'],
  ['operative-report', 'Operative report'],
  ['laboratory-result', 'Laboratory result'],
  ['insurance-card', 'Insurance card'],
  ['policy-document', 'Policy document'],
  ['payer-determination', 'Payer determination'],
] as const;

export type DocumentMediaType = 'application/pdf' | 'text/plain';
export type DocumentProcessingStatus = 'queued' | 'processing' | 'ready' | 'failed';

export interface DocumentStatusRecord {
  readonly id: string;
  readonly caseId: string;
  readonly documentTypeId: string;
  readonly name: string;
  readonly effectiveDate: string;
  readonly contentSha256: string;
  readonly pageCount: number | null;
  readonly processingStatus: DocumentProcessingStatus;
  readonly processingErrorCode: string | null;
  readonly updatedAt: string;
  readonly revision: number;
}

export interface DocumentUploadReceipt {
  readonly commandId: string;
  readonly action: 'upload';
  readonly caseId: string;
  readonly documentId: string;
  readonly committedAt: string;
}

export interface DocumentUploadRequest {
  readonly commandId: string;
  readonly documentId: string;
  readonly expectedCaseInputRevision: number;
  readonly expectedDocumentSetRevision: number;
  readonly documentTypeKey: string;
  readonly name: string;
  readonly effectiveDate: string;
  readonly mediaType: DocumentMediaType;
  readonly contentSha256: string;
  readonly file: File;
}

export interface DocumentUploadDraft {
  readonly file: File | null;
  readonly documentTypeKey: string;
  readonly name: string;
  readonly effectiveDate: string;
}

export const EMPTY_DOCUMENT_UPLOAD_DRAFT: DocumentUploadDraft = Object.freeze({
  file: null,
  documentTypeKey: 'office-visit-note',
  name: '',
  effectiveDate: '',
});

export const DOCUMENT_PROCESSING_FAILED_MESSAGE =
  'This document could not be processed. Review the file and try again.';

const ERROR_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  session_required: 'Sign in to continue.',
  action_forbidden: 'You do not have permission to perform this action.',
  resource_not_found: 'This record is unavailable in the selected practice.',
  command_conflict: 'This request ID was already used for different data. Start the action again.',
  stale_revision: 'This record changed. Review the current version before trying again.',
  document_too_large: 'This file exceeds the permitted size.',
  document_type_unsupported: 'Upload a supported PDF or text document.',
  document_integrity_failed: 'The uploaded file did not pass its integrity check.',
  document_processing_failed: DOCUMENT_PROCESSING_FAILED_MESSAGE,
  service_unavailable: 'This service is temporarily unavailable. Your committed work is unchanged.',
});

export function documentErrorMessage(cause: unknown): string {
  if (cause instanceof ApiError) {
    return ERROR_MESSAGES[cause.code]
      ?? (cause.code === 'invalid_request'
        ? 'Review the document details and try again.'
        : 'The document could not be uploaded. Try again.');
  }
  return 'The document could not be uploaded. Try again.';
}

export function mediaTypeFor(file: File): DocumentMediaType | null {
  return file.type === 'application/pdf' || file.type === 'text/plain' ? file.type : null;
}

export function documentStatusLabel(status: DocumentProcessingStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}
