import { describe, expect, it } from 'vitest';

import type { VerifiedSession } from '@/shared/model/session';
import { MemoryDraftRepository } from './memory-draft-repository';

const session = (identityId: string, practiceId = 'practice-1'): VerifiedSession => ({
  identityId,
  sessionId: `session-${identityId}`,
  userId: `user-${identityId}`,
  practiceId,
  displayName: 'Synthetic user',
  capabilities: [],
  principal: 'user',
  expiresAt: '2099-01-01T00:00:00Z',
  authorizationRevision: 'membership:1',
});

describe('memory draft repository', () => {
  it('retains a draft across replica rebuild and requires explicit same-user recovery', () => {
    const repository = new MemoryDraftRepository();
    repository.authorize(session('identity-a'), 1);
    const first = repository.open('case-1', 'correction-1')!;
    expect(first.save({ baseRevision: 'letter:3', content: 'Review the synthetic finding.' }))
      .toBe(true);

    // Replica rebuild does not touch this separate repository. A remounted view
    // opens the same identity/practice draft and decides whether to recover it.
    const afterRebuild = repository.open('case-1', 'correction-1')!;
    expect(afterRebuild.getSnapshot()?.content).toBe('Review the synthetic finding.');
  });

  it('quarantines delayed old work and hides it from another identity or practice', async () => {
    const repository = new MemoryDraftRepository();
    repository.authorize(session('identity-a'), 1);
    const old = repository.open('case-1', 'correction-1')!;
    const delayed = Promise.resolve().then(() => old.save({
      baseRevision: 'letter:3',
      content: 'Late synthetic write.',
    }));

    expect(repository.quarantine()).toBe(0);
    repository.authorize(session('identity-b'), 2);
    expect(repository.open('case-1', 'correction-1')?.getSnapshot()).toBeNull();
    expect(await delayed).toBe(false);

    repository.quarantine();
    repository.authorize(session('identity-a', 'practice-2'), 3);
    expect(repository.open('case-1', 'correction-1')?.getSnapshot()).toBeNull();
  });

  it('lets only the freshly authorized original scope recover a quarantined draft', () => {
    const repository = new MemoryDraftRepository();
    repository.authorize(session('identity-a'), 1);
    repository.open('case-1', 'correction-1')?.save({
      baseRevision: 'letter:3',
      content: 'Synthetic correction.',
    });
    expect(repository.quarantine()).toBe(1);
    expect(repository.open('case-1', 'correction-1')).toBeNull();

    repository.authorize(session('identity-b'), 2);
    expect(repository.open('case-1', 'correction-1')?.getSnapshot()).toBeNull();
    repository.quarantine();
    repository.authorize({
      ...session('identity-a'),
      sessionId: 'fresh-session-a',
      authorizationRevision: 'membership:2',
    }, 3);
    expect(repository.open('case-1', 'correction-1')?.getSnapshot()?.content)
      .toBe('Synthetic correction.');
  });

  it('declares memory-only loss rather than writing clinical content to browser storage', () => {
    const repository = new MemoryDraftRepository();
    expect(repository.retention).toEqual({
      mode: 'memory-only',
      notice: 'Saved only in this open application. Closing or reloading it will discard this draft.',
    });
  });

  it('fences an old annotation handle and hides its draft from another identity', async () => {
    const repository = new MemoryDraftRepository();
    repository.authorize(session('identity-a'), 1);
    const old = repository.openAnnotation('case-1', 'annotation-1')!;
    expect(old.save({
      annotationTypeId: 'type-1',
      name: 'Clinical judgment',
      body: 'Synthetic first draft.',
      targetEvidenceId: 'evidence-1',
      targetDocumentId: null,
      disposition: 'held',
      expectedRevision: 1,
    })).toBe(true);

    repository.authorize(session('identity-b'), 2);
    const delayed = Promise.resolve().then(() => old.save({
      annotationTypeId: 'type-1',
      name: 'Clinical judgment',
      body: 'Synthetic stale callback.',
      targetEvidenceId: 'evidence-1',
      targetDocumentId: null,
      disposition: 'included',
      expectedRevision: 1,
    }));

    expect(repository.openAnnotation('case-1', 'annotation-1')?.getSnapshot()).toBeNull();
    expect(await delayed).toBe(false);
  });
});
