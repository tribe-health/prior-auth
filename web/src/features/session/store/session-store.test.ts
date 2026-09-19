import { afterEach, describe, expect, it, vi } from 'vitest';

import type { VerifiedSession } from '@/shared/model/session';
import { MemoryDraftRepository } from '@/features/drafts/services/memory-draft-repository';
import { createLogoutPendingControl } from '@/features/session/services/logout-pending-control';
import {
  claimRuntimeCommand,
  getRuntimeCommand,
  resetRuntimeCommandRegistryForTests,
  type RuntimeCommandScope,
} from '@/shared/runtime-command-registry';
import { createSessionStore } from './session-store';

const SESSION: VerifiedSession = {
  identityId: 'identity-1',
  sessionId: 'session-1',
  userId: 'user-1',
  practiceId: 'practice-1',
  displayName: 'Dr Rivera',
  capabilities: ['affirm_gate', 'sign_letter'],
  principal: 'user',
  expiresAt: '2099-01-01T00:00:00Z',
  authorizationRevision: 'test:1',
};

const COMMAND_SCOPE: RuntimeCommandScope = {
  feature: 'surgeon-gate',
  sessionId: SESSION.sessionId,
  authorizationRevision: SESSION.authorizationRevision,
  epoch: 0,
  identityId: SESSION.identityId,
  practiceId: SESSION.practiceId,
  caseId: 'case-1',
};

function durableControl() {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
  return {
    control: createLogoutPendingControl(storage, () => 'logout-generation'),
    values,
  };
}

afterEach(() => localStorage.clear());

describe('session revocation fence', () => {
  it('keeps unresolved command ownership within one session epoch', () => {
    resetRuntimeCommandRegistryForTests();
    claimRuntimeCommand(COMMAND_SCOPE, { id: 'command-epoch-0', status: 'uncertain' });

    expect(getRuntimeCommand(COMMAND_SCOPE)?.id).toBe('command-epoch-0');
    expect(getRuntimeCommand({ ...COMMAND_SCOPE, epoch: 1 })).toBeNull();
  });

  it('publishes distinct public startup states and fences stale runtime transitions', () => {
    const store = createSessionStore(null, { logout: vi.fn() }, 'loading');
    expect(store.getState().runtimePhase).toBe('checking-session');

    store.getState().installStartupSession({ status: 'none', session: null });
    expect(store.getState().runtimePhase).toBe('anonymous');

    store.getState().installStartupSession({ status: 'unreachable', session: null });
    expect(store.getState().runtimePhase).toBe('session-unavailable');

    store.getState().installStartupSession({ status: 'authenticated', session: SESSION });
    const epoch = store.getState().epoch;
    expect(store.getState()).toMatchObject({
      session: SESSION,
      runtimePhase: 'opening-replica',
    });

    store.getState().transitionRuntimePhase('ready', epoch);
    expect(store.getState().runtimePhase).toBe('opening-replica');

    store.getState().transitionRuntimePhase('migrating', epoch);
    expect(store.getState().runtimePhase).toBe('migrating');
    store.getState().transitionRuntimePhase('hydrating', epoch);
    store.getState().transitionRuntimePhase('ready', epoch);
    expect(store.getState().runtimePhase).toBe('hydrating');
    store.getState().transitionRuntimePhase('catching-up', epoch);
    store.getState().transitionRuntimePhase('ready', epoch);
    expect(store.getState().runtimePhase).toBe('ready');
    store.getState().transitionRuntimePhase('offline-limited', epoch - 1);
    expect(store.getState().runtimePhase).toBe('ready');
  });

  it('removes protected state and unresolved commands synchronously', () => {
    resetRuntimeCommandRegistryForTests();
    claimRuntimeCommand(COMMAND_SCOPE, { id: 'command-1', status: 'uncertain' });
    const store = createSessionStore(SESSION, { logout: vi.fn() });

    store.getState().observeRevocation('Session revoked.');

    expect(store.getState()).toMatchObject({
      session: null,
      epoch: 1,
      accessState: 'locally-locked',
      notice: 'Session revoked.',
    });
    expect(getRuntimeCommand(COMMAND_SCOPE)).toBeNull();
  });

  it('keeps revalidated authority locked until the captured epoch completes', () => {
    resetRuntimeCommandRegistryForTests();
    claimRuntimeCommand(COMMAND_SCOPE, { id: 'command-before-revalidation', status: 'uncertain' });
    const store = createSessionStore(SESSION, { logout: vi.fn() });
    const attempt = store.getState().beginRevalidation();

    expect(attempt).toMatchObject({
      epoch: 1,
      identityId: SESSION.identityId,
      practiceId: SESSION.practiceId,
      authorizationRevision: SESSION.authorizationRevision,
    });
    expect(store.getState()).toMatchObject({
      session: null,
      epoch: 1,
      accessState: 'locally-locked',
      runtimePhase: 'quiescing',
    });
    expect(getRuntimeCommand(COMMAND_SCOPE)).toBeNull();

    expect(store.getState().completeRevalidation(
      { ...attempt!, epoch: 0 },
      { status: 'authenticated', session: SESSION },
    )).toBe(false);
    expect(store.getState().session).toBeNull();

    const replacement = {
      ...SESSION,
      sessionId: 'session-2',
      practiceId: 'practice-2',
      authorizationRevision: 'test:2',
    };
    expect(store.getState().completeRevalidation(
      attempt!,
      { status: 'authenticated', session: replacement },
    )).toBe(true);
    expect(store.getState()).toMatchObject({
      session: replacement,
      epoch: 1,
      accessState: 'authenticated',
      runtimePhase: 'opening-replica',
    });
  });

  it('does not reopen when quiescing fails', () => {
    const store = createSessionStore(SESSION, { logout: vi.fn() });
    const attempt = store.getState().beginRevalidation();

    expect(store.getState().failRevalidation(
      attempt!,
      'The prior local runtime could not close.',
    )).toBe(true);
    expect(store.getState()).toMatchObject({
      session: null,
      accessState: 'locally-locked',
      runtimePhase: 'recovery-required',
      notice: 'The prior local runtime could not close.',
    });
  });

  it('persists before calling logout and keeps the marker after an incomplete result', async () => {
    const durable = durableControl();
    let resolveLogout: ((result: 'denied-pending') => void) | undefined;
    const logout = vi.fn(() => new Promise<'denied-pending'>((resolve) => {
      expect(durable.control.read()).toMatchObject({ status: 'pending' });
      resolveLogout = resolve;
    }));
    const store = createSessionStore(SESSION, { logout }, 'authenticated', durable.control);

    const pending = store.getState().logout();
    expect(store.getState()).toMatchObject({
      session: null,
      accessState: 'locally-locked',
      logoutState: 'submitting',
      logoutPending: true,
    });

    resolveLogout?.('denied-pending');
    await pending;
    expect(store.getState()).toMatchObject({
      session: null,
      accessState: 'locally-locked',
      logoutState: 'failed',
      logoutPending: true,
      notice: 'Access is locked on this device. Server sign-out is pending while recovery continues.',
    });
    expect(durable.control.read()).toMatchObject({ status: 'pending' });
  });

  it('blocks passive session restoration in a new store until confirmed retry clears the marker', async () => {
    const durable = durableControl();
    durable.control.ensurePending();
    const logout = vi.fn(async () => 'confirmed' as const);
    const store = createSessionStore(SESSION, { logout }, 'authenticated', durable.control);

    expect(store.getState()).toMatchObject({
      session: null,
      accessState: 'locally-locked',
      logoutState: 'failed',
      logoutPending: true,
    });
    store.getState().installStartupSession({ status: 'authenticated', session: SESSION });
    expect(store.getState().session).toBeNull();

    await store.getState().retryLogout();
    expect(logout).toHaveBeenCalledOnce();
    expect(durable.control.read()).toEqual({ status: 'clear' });
    expect(store.getState()).toMatchObject({
      session: null,
      accessState: 'signed-out',
      logoutState: 'idle',
      logoutPending: false,
      runtimePhase: 'anonymous',
    });
  });

  it('reports unavailable marker storage and requires an online confirmed result', async () => {
    const control = createLogoutPendingControl(undefined);
    const logout = vi.fn()
      .mockResolvedValueOnce('unavailable')
      .mockResolvedValueOnce('confirmed');
    const store = createSessionStore(SESSION, { logout }, 'authenticated', control);

    await store.getState().logout();
    expect(store.getState()).toMatchObject({
      session: null,
      accessState: 'locally-locked',
      logoutState: 'failed',
      logoutPending: false,
      notice: 'Access is locked in this tab. Cross-reload locking could not be saved; retry server sign-out while online.',
    });

    await store.getState().retryLogout();
    expect(store.getState()).toMatchObject({
      accessState: 'signed-out',
      logoutState: 'idle',
      notice: 'You are signed out.',
    });
  });

  it('fences an expired session and accepts a later freshly verified session', () => {
    const store = createSessionStore(SESSION, { logout: vi.fn() });

    store.getState().observeSessionExpiry(Date.parse(SESSION.expiresAt));
    expect(store.getState()).toMatchObject({
      session: null,
      epoch: 1,
      accessState: 'locally-locked',
      notice: 'Your session expired. Sign in to continue.',
    });

    const replacement = {
      ...SESSION,
      sessionId: 'session-2',
      authorizationRevision: 'test:2',
    };
    store.getState().installVerifiedSession(replacement);
    expect(store.getState()).toMatchObject({
      session: replacement,
      epoch: 2,
      accessState: 'authenticated',
      logoutState: 'idle',
      notice: null,
    });
  });

  it('quarantines drafts on revocation and permits recovery only after original-user reauthorization', () => {
    const drafts = new MemoryDraftRepository();
    const store = createSessionStore(
      SESSION,
      { logout: vi.fn() },
      'authenticated',
      durableControl().control,
      drafts,
    );
    const oldHandle = drafts.open('case-1', 'correction-1')!;
    expect(oldHandle.save({ baseRevision: 'letter:3', content: 'Synthetic correction.' })).toBe(true);

    store.getState().observeRevocation('Session revoked.');
    expect(store.getState()).toMatchObject({
      session: null,
      accessState: 'locally-locked',
      draftNotice: '1 unsent draft is stored only in this open application and will be lost if it closes or reloads.',
    });
    expect(oldHandle.save({ baseRevision: 'letter:4', content: 'Delayed old work.' })).toBe(false);

    const otherUser = {
      ...SESSION,
      identityId: 'identity-2',
      sessionId: 'session-2',
      userId: 'user-2',
      authorizationRevision: 'test:2',
    };
    store.getState().installVerifiedSession(otherUser);
    expect(drafts.open('case-1', 'correction-1')?.getSnapshot()).toBeNull();

    store.getState().observeRevocation('Session revoked.');
    const freshOriginal = {
      ...SESSION,
      sessionId: 'session-3',
      authorizationRevision: 'test:3',
    };
    store.getState().installVerifiedSession(freshOriginal);
    expect(drafts.open('case-1', 'correction-1')?.getSnapshot()?.content)
      .toBe('Synthetic correction.');
    expect(store.getState().draftNotice).toBeNull();
  });
});
