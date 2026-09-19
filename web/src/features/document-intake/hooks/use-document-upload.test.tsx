import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { VerifiedSession } from '@/shared/model/session';
import { ApiError } from '@/shared/api/http-client';
import { resetRuntimeCommandRegistryForTests } from '@/shared/runtime-command-registry';
import type { DocumentStatusRecord } from '../model/document-intake';

const SESSION: VerifiedSession = {
  identityId: 'identity-1', sessionId: 'session-1', userId: 'user-1',
  practiceId: 'practice-1', displayName: 'Synthetic Coordinator',
  capabilities: ['case:read', 'document_upload'], principal: 'user',
  expiresAt: '2099-01-01T00:00:00Z', authorizationRevision: 'test:1',
};
const api = vi.hoisted(() => ({ upload: vi.fn(), lookup: vi.fn() }));
const hash = vi.hoisted(() => vi.fn());

vi.mock('@/app/providers/session-provider', () => ({
  useRequiredSession: () => SESSION,
  useSessionEpoch: () => 4,
}));
vi.mock('../api/document-intake-api', () => ({
  documentIntakeApi: api,
  sha256File: hash,
}));

import { useDocumentUpload } from './use-document-upload';

beforeEach(() => {
  vi.clearAllMocks();
  resetRuntimeCommandRegistryForTests();
  window.sessionStorage.clear();
  hash.mockResolvedValue('a'.repeat(64));
});
afterEach(cleanup);

function readyDocument(id: string): DocumentStatusRecord {
  return {
    id, caseId: 'case-1', documentTypeId: 'type-1', name: 'Synthetic note',
    effectiveDate: '2026-09-18', contentSha256: 'a'.repeat(64), pageCount: 1,
    processingStatus: 'ready', processingErrorCode: null,
    updatedAt: '2026-09-18T12:00:00Z', revision: 2,
  };
}

describe('document upload command', () => {
  it('keeps ownership until the committed status projection contains the document', async () => {
    api.upload.mockImplementation(async (_caseId, _practiceId, request) => ({
      commandId: request.commandId, action: 'upload', caseId: 'case-1',
      documentId: request.documentId, committedAt: '2026-09-18T12:00:00Z',
    }));
    let documents: readonly DocumentStatusRecord[] = [];
    const hook = renderHook(() => useDocumentUpload('case-1', 3, 1, documents));
    act(() => {
      hook.result.current.selectFile(new File(['synthetic'], 'note.txt', { type: 'text/plain' }));
      hook.result.current.updateDraft({ effectiveDate: '2026-09-18' });
    });

    await act(async () => { await hook.result.current.submit(); });
    expect(hook.result.current.outcome).toBe('awaiting-projection');
    const request = api.upload.mock.calls[0][2];

    documents = [readyDocument(request.documentId)];
    hook.rerender();
    await waitFor(() => expect(hook.result.current.outcome).toBe('confirmed'));
    expect(hook.result.current.message).toBe('Document uploaded. Processing status is now available.');
  });

  it('preserves an uncertain command and exposes the frozen service copy', async () => {
    api.upload.mockRejectedValue(new ApiError(503, 'service_unavailable', 'service_unavailable'));
    const hook = renderHook(() => useDocumentUpload('case-1', 3, 1, []));
    act(() => {
      hook.result.current.selectFile(new File(['synthetic'], 'note.txt', { type: 'text/plain' }));
      hook.result.current.updateDraft({ effectiveDate: '2026-09-18' });
    });

    await act(async () => { await hook.result.current.submit(); });

    expect(hook.result.current.outcome).toBe('uncertain');
    expect(hook.result.current.canReconcile).toBe(true);
    expect(hook.result.current.message).toBe(
      'This service is temporarily unavailable. Your committed work is unchanged.',
    );
  });
});
