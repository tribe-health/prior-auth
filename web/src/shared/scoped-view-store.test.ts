import { describe, expect, it, vi } from 'vitest';

import type { VerifiedSession } from '@/shared/model/session';
import { createScopedViewStore, viewScope } from './scoped-view-store';

const SESSION: VerifiedSession = {
  identityId: 'identity-a',
  sessionId: 'session-a',
  userId: 'user-a',
  practiceId: 'practice-a',
  displayName: 'Synthetic user',
  capabilities: [],
  principal: 'user',
  expiresAt: '2099-01-01T00:00:00Z',
  authorizationRevision: 'membership:1',
};

describe('scoped view store', () => {
  it('includes identity, practice, epoch, case and view instance in its scope', () => {
    const first = viewScope(SESSION, 7, 'case-1', 'view-1');
    const second = viewScope(SESSION, 7, 'case-1', 'view-2');

    expect(first).toMatchObject({
      identityId: 'identity-a',
      practiceId: 'practice-a',
      epoch: 7,
      caseId: 'case-1',
      viewInstanceId: 'view-1',
    });
    expect(second).not.toEqual(first);
  });

  it('aborts delayed old-scope work and refuses its later publication', async () => {
    const runtime = createScopedViewStore(
      viewScope(SESSION, 7, 'case-1', 'view-1'),
      { selectedCitationId: null as string | null },
    );
    const old = runtime.capture();
    let finish: ((value: string) => void) | undefined;
    const attachmentRequest = vi.fn((_scope, signal: AbortSignal) => {
      expect(signal.aborted).toBe(false);
      return new Promise<string>((resolve) => {
        finish = resolve;
      });
    });
    const pending = old.execute(attachmentRequest);

    runtime.replaceScope(
      viewScope({
        ...SESSION,
        identityId: 'identity-b',
        sessionId: 'session-b',
        userId: 'user-b',
        practiceId: 'practice-b',
        authorizationRevision: 'membership:2',
      }, 8, 'case-2', 'view-2'),
      { selectedCitationId: null },
    );

    expect(old.signal.aborted).toBe(true);
    expect(old.publish(() => ({ selectedCitationId: 'citation-old' }))).toBe(false);
    finish?.('synthetic attachment bytes');
    await expect(pending).resolves.toEqual({ status: 'stale' });
    expect(runtime.store.getState().value.selectedCitationId).toBeNull();

    const current = runtime.capture();
    expect(current.publish(() => ({ selectedCitationId: 'citation-new' }))).toBe(true);
    expect(runtime.store.getState().value.selectedCitationId).toBe('citation-new');
  });

  it('refuses execution after the view closes', async () => {
    const runtime = createScopedViewStore(viewScope(SESSION, 1, 'case-1', 'view-1'), null);
    const captured = runtime.capture();
    const effect = vi.fn(async () => 'result');

    runtime.close();

    await expect(captured.execute(effect)).resolves.toEqual({ status: 'stale' });
    expect(effect).not.toHaveBeenCalled();
  });
});
