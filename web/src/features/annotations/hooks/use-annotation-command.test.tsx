import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { VerifiedSession } from '@/shared/model/session';
import { ApiError } from '@/shared/api/http-client';
import { resetRuntimeCommandRegistryForTests } from '@/shared/runtime-command-registry';
import { memoryDraftRepository } from '@/features/drafts/services/memory-draft-repository';
import type { Annotation } from '../model/annotation';

const SESSION: VerifiedSession = {
  identityId: 'identity-1', sessionId: 'session-1', userId: 'user-1',
  practiceId: 'practice-1', displayName: 'Synthetic Surgeon', capabilities: ['annotate'],
  principal: 'user', expiresAt: '2099-01-01T00:00:00Z', authorizationRevision: 'test:1',
};
const api = vi.hoisted(() => ({ save: vi.fn(), lookupCommand: vi.fn() }));
const COMMAND_ID = '00000000-0000-4000-8000-000000000001';

vi.mock('@/app/providers/session-provider', () => ({
  useRequiredSession: () => SESSION,
  useSessionEpoch: () => 1,
}));
vi.mock('../api/annotation-api', () => ({ annotationApi: api }));

import { useAnnotationCommand } from './use-annotation-command';

const PROJECTED: Annotation = {
  id: 'annotation-1', caseId: 'case-1', annotationTypeId: 'type-1',
  name: 'Clinical judgment', body: 'Synthetic opinion.', authorId: 'author-1',
  authorLabel: 'Synthetic Surgeon', provenance: 'surgeon', targetEvidenceId: 'evidence-1',
  targetDocumentId: null, disposition: 'included', revision: 2, createdAt: null, updatedAt: null,
};

beforeEach(() => {
  resetRuntimeCommandRegistryForTests();
  memoryDraftRepository.resetForTests();
  memoryDraftRepository.authorize(SESSION, 1);
  api.save.mockReset();
  api.lookupCommand.mockReset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('annotation command hook', () => {
  it('submits clinical content without caller attribution and waits for the committed graph row', async () => {
    api.save.mockResolvedValue({
      commandId: COMMAND_ID, annotationId: 'annotation-1', caseId: 'case-1',
      annotationTypeId: 'type-1', name: 'Clinical judgment',
      data: { assertion: 'Synthetic opinion.' },
      body: 'Synthetic opinion.', targetEvidenceId: 'evidence-1', targetDocumentId: null,
      disposition: 'included', expectedRevision: 1, authorId: 'author-1',
      authorLabel: 'Synthetic Surgeon', provenance: 'surgeon', revision: 2,
      committedAt: '2026-09-15T12:00:00Z',
    });
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(COMMAND_ID);
    const { result, rerender } = renderHook(
      ({ annotations }) => useAnnotationCommand('case-1', annotations),
      { initialProps: { annotations: [] as Annotation[] } },
    );
    const draft = memoryDraftRepository.openAnnotation('case-1', 'annotation-1')!;
    expect(draft.save({
      annotationTypeId: 'type-1', name: 'Clinical judgment', body: 'Synthetic opinion.',
      targetEvidenceId: 'evidence-1', targetDocumentId: null,
      disposition: 'included', expectedRevision: 1,
    })).toBe(true);

    await act(() => result.current.save('annotation-1', {
      annotationTypeId: 'type-1', name: 'Clinical judgment', body: 'Synthetic opinion.',
      targetEvidenceId: 'evidence-1', targetDocumentId: null,
      disposition: 'included', expectedRevision: 1,
    }));

    expect(api.save).toHaveBeenCalledWith('case-1', 'annotation-1', 'practice-1', {
      commandId: COMMAND_ID, annotationId: 'annotation-1', annotationTypeId: 'type-1',
      name: 'Clinical judgment', data: { assertion: 'Synthetic opinion.' },
      body: 'Synthetic opinion.',
      targetEvidenceId: 'evidence-1', targetDocumentId: null,
      disposition: 'included', expectedRevision: 1,
    }, 1);
    expect(result.current.outcome).toBe('awaiting-projection');

    rerender({ annotations: [PROJECTED] });
    await waitFor(() => expect(result.current.outcome).toBe('confirmed'));
    expect(result.current.pending).toBe(false);
    expect(draft.getSnapshot()).toBeNull();
  });

  it('refuses to confirm a same-revision projection whose committed fields differ', async () => {
    api.save.mockResolvedValue({
      commandId: COMMAND_ID, annotationId: 'annotation-1', caseId: 'case-1',
      annotationTypeId: 'type-1', name: 'Clinical judgment', data: { assertion: 'Synthetic opinion.' },
      body: 'Synthetic opinion.', targetEvidenceId: 'evidence-1', targetDocumentId: null,
      disposition: 'included', expectedRevision: 1, authorId: 'author-1',
      authorLabel: 'Synthetic Surgeon', provenance: 'surgeon', revision: 2,
      committedAt: '2026-09-15T12:00:00Z',
    });
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(COMMAND_ID);
    const { result, rerender } = renderHook(
      ({ annotations }) => useAnnotationCommand('case-1', annotations),
      { initialProps: { annotations: [] as Annotation[] } },
    );

    await act(() => result.current.save('annotation-1', {
      annotationTypeId: 'type-1', name: 'Clinical judgment', body: 'Synthetic opinion.',
      targetEvidenceId: 'evidence-1', targetDocumentId: null,
      disposition: 'included', expectedRevision: 1,
    }));
    rerender({ annotations: [{ ...PROJECTED, body: 'Different committed text.' }] });

    await waitFor(() => expect(result.current.outcome).toBe('conflict'));
    expect(result.current.message).toContain('does not match');
    expect(result.current.pending).toBe(false);
  });

  it('releases the command slot and exposes a capability refusal', async () => {
    api.save.mockRejectedValue(new ApiError(403, 'annotation_denied', 'annotation_denied'));
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(COMMAND_ID);
    const { result } = renderHook(() => useAnnotationCommand('case-1', [PROJECTED]));

    await act(() => result.current.save('annotation-1', {
      annotationTypeId: 'type-1', name: 'Clinical judgment', body: 'Synthetic opinion.',
      targetEvidenceId: 'evidence-1', targetDocumentId: null,
      disposition: 'held', expectedRevision: 2,
    }));

    expect(result.current.outcome).toBe('refused');
    expect(result.current.message).toBe('annotation_denied');
    expect(result.current.pending).toBe(false);
  });

  it('releases the command slot and exposes a stale revision conflict', async () => {
    api.save.mockRejectedValue(new ApiError(409, 'revision_conflict', 'revision_conflict'));
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(COMMAND_ID);
    const { result } = renderHook(() => useAnnotationCommand('case-1', [PROJECTED]));

    await act(() => result.current.save('annotation-1', {
      annotationTypeId: 'type-1', name: 'Clinical judgment', body: 'Synthetic stale opinion.',
      targetEvidenceId: 'evidence-1', targetDocumentId: null,
      disposition: 'held', expectedRevision: 1,
    }));

    expect(result.current.outcome).toBe('conflict');
    expect(result.current.message).toBe('revision_conflict');
    expect(result.current.pending).toBe(false);
  });

  it.each([
    [403, 'annotation_denied', 'refused'],
    [409, 'revision_conflict', 'conflict'],
  ] as const)('releases an uncertain command when reconciliation returns %s', async (status, code, outcome) => {
    api.save.mockRejectedValue(new ApiError(503, 'annotation_unavailable', 'annotation_unavailable'));
    api.lookupCommand.mockRejectedValue(new ApiError(status, code, code));
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(COMMAND_ID);
    const { result } = renderHook(() => useAnnotationCommand('case-1', [PROJECTED]));

    let failure: unknown;
    await act(async () => {
      try {
        await result.current.save('annotation-1', {
          annotationTypeId: 'type-1', name: 'Clinical judgment', body: 'Synthetic opinion.',
          targetEvidenceId: 'evidence-1', targetDocumentId: null,
          disposition: 'included', expectedRevision: 1,
        });
      } catch (cause) {
        failure = cause;
      }
    });
    expect(failure).toMatchObject({ message: 'annotation_unavailable' });
    expect(result.current.pending).toBe(true);

    await act(() => result.current.lookupCommand());
    expect(result.current.outcome).toBe(outcome);
    expect(result.current.message).toBe(code);
    expect(result.current.pending).toBe(false);
  });
});
