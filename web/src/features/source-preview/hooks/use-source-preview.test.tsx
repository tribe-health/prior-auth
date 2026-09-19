import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/shared/api/http-client';
import type { VerifiedSession } from '@/shared/model/session';
import type { SourcePreviewService } from '../api/source-preview-api';
import type { AuthorizedSource, SourcePreviewTarget } from '../model/source-preview';

const sessionState = vi.hoisted(() => ({ epoch: 1 }));

const SESSION: VerifiedSession = {
  identityId: 'identity-1',
  sessionId: 'session-1',
  userId: 'user-1',
  practiceId: 'practice-1',
  displayName: 'Synthetic reviewer',
  capabilities: [],
  principal: 'user',
  expiresAt: '2099-01-01T00:00:00Z',
  authorizationRevision: 'membership:1',
};

vi.mock('@/app/providers/session-provider', () => ({
  useRequiredSession: () => SESSION,
  useSessionEpoch: () => sessionState.epoch,
}));

const { useSourcePreview } = await import('./use-source-preview');

const target: SourcePreviewTarget = {
  id: 'citation-1',
  caseId: 'case-1',
  documentId: 'document-1',
  documentName: 'Synthetic MRI',
  effectiveDate: '2026-03-14',
  pageNumber: 2,
  relevance: 'primary',
};

const source: AuthorizedSource = {
  documentId: 'document-1',
  documentName: 'Synthetic MRI',
  effectiveDate: '2026-03-14',
  pageNumber: 2,
  pageCount: 4,
  mediaType: 'application/pdf',
  blob: new Blob(['%PDF synthetic'], { type: 'application/pdf' }),
};

let createObjectUrl: ReturnType<typeof vi.fn>;
let revokeObjectUrl: ReturnType<typeof vi.fn>;

beforeEach(() => {
  sessionState.epoch = 1;
  createObjectUrl = vi.fn(() => 'blob:source-1');
  revokeObjectUrl = vi.fn();
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectUrl });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectUrl });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('useSourcePreview', () => {
  it('shows a typed refusal without creating a byte handle', async () => {
    const service: SourcePreviewService = {
      open: vi.fn(async () => { throw new ApiError(403, 'document_source_denied'); }),
    };
    const { result } = renderHook(() => useSourcePreview('case-1', service));

    await act(async () => { await result.current.open(target); });

    expect(result.current.state).toMatchObject({
      phase: 'refused',
      message: 'You do not have access to this source document.',
    });
    expect(createObjectUrl).not.toHaveBeenCalled();
  });

  it('hides stale content synchronously and releases its object URL on an epoch change', async () => {
    const service: SourcePreviewService = { open: vi.fn(async () => source) };
    const { result, rerender } = renderHook(() => useSourcePreview('case-1', service));

    await act(async () => { await result.current.open(target); });
    expect(result.current.state).toMatchObject({ phase: 'ready' });
    expect(createObjectUrl).toHaveBeenCalledOnce();

    act(() => { sessionState.epoch = 2; rerender(); });
    expect(result.current.state).toEqual({ phase: 'closed' });
    await act(async () => Promise.resolve());
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:source-1');
  });

  it('aborts a pending request and ignores its late bytes after scope teardown', async () => {
    let finish: ((value: AuthorizedSource) => void) | undefined;
    let observedSignal: AbortSignal | undefined;
    const service: SourcePreviewService = {
      open: vi.fn((_target, _practiceId, _epoch, signal) => {
        observedSignal = signal;
        return new Promise<AuthorizedSource>((resolve) => { finish = resolve; });
      }),
    };
    const { result, rerender } = renderHook(() => useSourcePreview('case-1', service));
    let pending: Promise<void>;
    act(() => { pending = result.current.open(target); });
    expect(result.current.state).toMatchObject({ phase: 'loading' });

    act(() => { sessionState.epoch = 2; rerender(); });
    expect(observedSignal?.aborted).toBe(true);
    expect(result.current.state).toEqual({ phase: 'closed' });

    await act(async () => {
      finish?.(source);
      await pending!;
    });
    expect(createObjectUrl).not.toHaveBeenCalled();
  });
});
