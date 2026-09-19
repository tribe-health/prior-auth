import { httpClient } from '@/shared/api/http-client';
import type { DocumentUploadReceipt, DocumentUploadRequest } from '../model/document-intake';

function practiceSelection(practiceId: string): string {
  return `?practiceId=${encodeURIComponent(practiceId)}`;
}

function caseDocuments(caseId: string, practiceId: string): string {
  return `/api/cases/${encodeURIComponent(caseId)}/documents${practiceSelection(practiceId)}`;
}

export async function sha256File(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function uploadForm(request: DocumentUploadRequest): FormData {
  const form = new FormData();
  form.append('commandId', request.commandId);
  form.append('documentId', request.documentId);
  form.append('expectedCaseInputRevision', String(request.expectedCaseInputRevision));
  form.append('expectedDocumentSetRevision', String(request.expectedDocumentSetRevision));
  form.append('documentTypeKey', request.documentTypeKey);
  form.append('name', request.name);
  form.append('effectiveDate', request.effectiveDate);
  form.append('mediaType', request.mediaType);
  form.append('contentSha256', request.contentSha256);
  form.append('file', request.file, request.file.name);
  return form;
}

export const documentIntakeApi = {
  upload: (caseId: string, practiceId: string, request: DocumentUploadRequest) =>
    httpClient.postForm<DocumentUploadReceipt>(
      caseDocuments(caseId, practiceId),
      uploadForm(request),
    ),

  lookup: (caseId: string, commandId: string, practiceId: string) =>
    httpClient.get<DocumentUploadReceipt>(
      `/api/cases/${encodeURIComponent(caseId)}/document-commands/${encodeURIComponent(commandId)}`
        + practiceSelection(practiceId),
    ),
};
