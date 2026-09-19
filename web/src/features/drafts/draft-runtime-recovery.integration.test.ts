import { describe, expect, it, vi } from 'vitest';

import { createLogoutPendingControl } from '@/features/session/services/logout-pending-control';
import { createSessionStore } from '@/features/session/store/session-store';
import type { VerifiedSession } from '@/shared/model/session';
import { rebuildGeneration } from '@/shared/sync/replica-rebuild';
import { MemoryDraftRepository } from './services/memory-draft-repository';

const SESSION: VerifiedSession = {
  identityId: 'identity-1',
  sessionId: 'session-1',
  userId: 'user-1',
  practiceId: 'practice-1',
  displayName: 'Synthetic user',
  capabilities: [],
  principal: 'user',
  expiresAt: '2099-01-01T00:00:00Z',
  authorizationRevision: 'membership:1',
};

function logoutControl() {
  const values = new Map<string, string>();
  return createLogoutPendingControl({
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  });
}

describe('draft and disposable replica lifecycle', () => {
  it('retains the draft through rebuild and migration recovery while fencing identity changes', async () => {
    const drafts = new MemoryDraftRepository();
    const store = createSessionStore(
      SESSION,
      { logout: vi.fn() },
      'authenticated',
      logoutControl(),
      drafts,
    );
    const oldHandle = drafts.open('case-1', 'letter:1:targeted-correction')!;
    expect(oldHandle.save({
      baseRevision: '3:4',
      content: 'Review the synthetic chart date.',
    })).toBe(true);

    let generation = 1;
    const replica = {
      async query<T>(sql: string): Promise<{ rows: T[] }> {
        if (sql.includes('UPDATE _replica_meta')) generation += 1;
        return { rows: [{ generation }] as T[] };
      },
      async exec() {},
    };
    await expect(rebuildGeneration(
      replica,
      [{ table: 'synthetic_replica_rows', columns: ['id'] }],
      'must-refetch',
    )).resolves.toMatchObject({ generation: 2, cleared: ['synthetic_replica_rows'] });
    expect(oldHandle.getSnapshot()?.content).toBe('Review the synthetic chart date.');

    const attempt = store.getState().beginRevalidation('Replica needs recovery.')!;
    expect(oldHandle.save({ baseRevision: '3:5', content: 'Delayed old work.' })).toBe(false);
    expect(store.getState()).toMatchObject({
      session: null,
      accessState: 'locally-locked',
      runtimePhase: 'quiescing',
      draftNotice: '1 unsent draft is stored only in this open application and will be lost if it closes or reloads.',
    });

    const refreshed = {
      ...SESSION,
      sessionId: 'session-2',
      authorizationRevision: 'membership:2',
    };
    expect(store.getState().completeRevalidation(
      attempt,
      { status: 'authenticated', session: refreshed },
    )).toBe(true);
    store.getState().transitionRuntimePhase('migrating', attempt.epoch);
    store.getState().transitionRuntimePhase('recovery-required', attempt.epoch);
    expect(store.getState().runtimePhase).toBe('recovery-required');
    expect(drafts.open('case-1', 'letter:1:targeted-correction')?.getSnapshot()?.content)
      .toBe('Review the synthetic chart date.');

    store.getState().observeRevocation('Session revoked.');
    store.getState().installVerifiedSession({
      ...refreshed,
      identityId: 'identity-2',
      sessionId: 'session-3',
      userId: 'user-2',
      authorizationRevision: 'membership:3',
    });
    expect(drafts.open('case-1', 'letter:1:targeted-correction')?.getSnapshot()).toBeNull();

    store.getState().observeRevocation('Session revoked.');
    store.getState().installVerifiedSession({
      ...refreshed,
      sessionId: 'session-4',
      authorizationRevision: 'membership:4',
    });
    expect(drafts.open('case-1', 'letter:1:targeted-correction')?.getSnapshot()?.content)
      .toBe('Review the synthetic chart date.');
  });
});
