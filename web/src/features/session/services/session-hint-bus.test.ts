import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { listen } from '@tauri-apps/api/event';
import type { VerifiedSession } from '@/shared/model/session';
import { createLogoutPendingControl } from '@/features/session/services/logout-pending-control';
import { createSessionStore } from '@/features/session/store/session-store';
import {
  createBrowserSessionHintBus,
  createNativeSessionHintBus,
  NATIVE_SESSION_INVALIDATED_EVENT,
} from './session-hint-bus';

vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));

const mockedListen = vi.mocked(listen);
const nativeHandlers: Array<(event: { payload: unknown }) => void> = [];

const SESSION: VerifiedSession = {
  identityId: 'identity-1',
  sessionId: 'session-1',
  userId: 'user-1',
  practiceId: 'practice-1',
  displayName: 'Synthetic surgeon',
  capabilities: ['affirm_gate'],
  principal: 'user',
  expiresAt: '2099-01-01T00:00:00Z',
  authorizationRevision: 'native:1',
};

function logoutControl() {
  const values = new Map<string, string>();
  return createLogoutPendingControl({
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  });
}

class FakeBroadcastChannel extends EventTarget {
  static readonly channels = new Map<string, Set<FakeBroadcastChannel>>();
  readonly name: string;

  constructor(name: string) {
    super();
    this.name = name;
    const members = FakeBroadcastChannel.channels.get(name) ?? new Set();
    members.add(this);
    FakeBroadcastChannel.channels.set(name, members);
  }

  postMessage(message: unknown) {
    for (const member of FakeBroadcastChannel.channels.get(this.name) ?? []) {
      if (member === this) continue;
      member.dispatchEvent(new MessageEvent('message', { data: message }));
    }
  }

  close() {
    FakeBroadcastChannel.channels.get(this.name)?.delete(this);
  }
}

beforeEach(() => {
  nativeHandlers.length = 0;
  mockedListen.mockImplementation(async (_event, handler) => {
    nativeHandlers.push(handler as (event: { payload: unknown }) => void);
    return vi.fn();
  });
});

afterEach(() => {
  FakeBroadcastChannel.channels.clear();
  mockedListen.mockReset();
  vi.unstubAllGlobals();
});

describe('browser session hint bus', () => {
  it('notifies another tab without notifying the sender', () => {
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
    const first = createBrowserSessionHintBus('tab-1');
    const second = createBrowserSessionHintBus('tab-2');
    const firstListener = vi.fn();
    const secondListener = vi.fn();
    first.subscribe(firstListener);
    second.subscribe(secondListener);

    first.publish('scope-change');

    expect(firstListener).not.toHaveBeenCalled();
    expect(secondListener).toHaveBeenCalledOnce();
    first.close();
    second.close();
  });

  it('treats malformed and identity-bearing messages as inert untrusted data', () => {
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
    const sender = new FakeBroadcastChannel('aso-session-lifecycle-v1');
    const receiver = createBrowserSessionHintBus('tab-2');
    const listener = vi.fn();
    receiver.subscribe(listener);

    sender.postMessage({ type: 'install-session', identityId: 'forged' });
    sender.postMessage('{not-json');

    expect(listener).not.toHaveBeenCalled();
    sender.close();
    receiver.close();
  });
});

describe('native session hint bus', () => {
  it('locks two renderer stores from one sanitized host event', () => {
    const firstBus = createNativeSessionHintBus();
    const secondBus = createNativeSessionHintBus();
    const first = createSessionStore(
      SESSION,
      { logout: vi.fn() },
      'authenticated',
      logoutControl(),
    );
    const second = createSessionStore(
      SESSION,
      { logout: vi.fn() },
      'authenticated',
      logoutControl(),
    );
    firstBus.subscribe(() => void first.getState().beginRevalidation('Native session changed. Verifying…'));
    secondBus.subscribe(() => void second.getState().beginRevalidation('Native session changed. Verifying…'));

    expect(mockedListen.mock.calls.map(([event]) => event)).toEqual([
      NATIVE_SESSION_INVALIDATED_EVENT,
      NATIVE_SESSION_INVALIDATED_EVENT,
    ]);
    const payload = { schema: 1, reason: 'authentication-failed', epoch: 8 };
    for (const handler of nativeHandlers) handler({ payload });

    for (const store of [first, second]) {
      expect(store.getState()).toMatchObject({
        session: null,
        epoch: 1,
        accessState: 'locally-locked',
        runtimePhase: 'quiescing',
        notice: 'Native session changed. Verifying…',
      });
    }
    expect(JSON.stringify(payload)).not.toMatch(/token|identity|principal|capabilit/i);
    firstBus.close();
    secondBus.close();
  });

  it('rejects malformed or credential-bearing native events', () => {
    const bus = createNativeSessionHintBus();
    const listener = vi.fn();
    bus.subscribe(listener);

    nativeHandlers[0]?.({
      payload: {
        schema: 1,
        reason: 'logout',
        epoch: 1,
        token: 'renderer-must-never-receive-this',
      },
    });
    nativeHandlers[0]?.({ payload: { schema: 1, reason: 'unknown', epoch: 1 } });

    expect(listener).not.toHaveBeenCalled();
    bus.close();
  });
});
