import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { subscribeSessionRevocation } from '@/shared/session-revocation-events';
import { createLogoutPendingControl, type LogoutPendingControl } from '@/features/session/services/logout-pending-control';
import type { SessionService } from '@/features/session/services/session-service';
import { useStartupSession } from './use-startup-session';

function Probe({
  control,
  service,
}: {
  control?: LogoutPendingControl;
  service?: Pick<SessionService, 'logout'>;
}) {
  const { status, session } = useStartupSession(control, service);
  return <p>{status}|{session?.sessionId ?? 'none'}</p>;
}

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

function respondWith(status: number, body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
}

const SUMMARY = {
  identityId: '11111111-1111-1111-1111-111111111111',
  sessionId: 'session-1',
  userId: '33333333-3333-3333-3333-333333333333',
  practiceId: '44444444-4444-4444-4444-444444444444',
  displayName: 'Dr Rivera',
  principal: 'user',
  capabilities: ['affirm_gate'],
  expiresAt: '2099-01-01T00:00:00Z',
  authorizationRevision: 'membership:7',
};

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useStartupSession', () => {
  it('installs the verified session the server returns', async () => {
    respondWith(200, SUMMARY);
    render(<Probe />);

    // The first paint is `loading`, not `none` — rendering "signed out" before
    // the answer arrives would flash a sign-in notice at an authenticated user.
    expect(screen.getByText('loading|none')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('authenticated|session-1')).toBeTruthy());
  });

  it('sends credentials, because the Kratos cookie is the credential', async () => {
    respondWith(200, SUMMARY);
    render(<Probe />);

    await waitFor(() => expect(screen.getByText('authenticated|session-1')).toBeTruthy());
    const [, init] = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init).toMatchObject({ credentials: 'include' });
  });

  it('treats 401 as "not signed in" without announcing a revoked session', async () => {
    respondWith(401, { error: 'unauthenticated' });
    const observed: string[] = [];
    const unsubscribe = subscribeSessionRevocation((reason) => observed.push(reason));

    render(<Probe />);
    await waitFor(() => expect(screen.getByText('none|none')).toBeTruthy());
    unsubscribe();

    // httpClient publishes a revocation on any 401. At startup there is no
    // session to revoke, so nothing must reach the store as an expiry notice —
    // a first visit is not an ended session. The provider is only ever handed
    // `null` here, so the notice it renders is "Sign in to continue."
    expect(observed).toEqual(['Your session has ended. Sign in again.']);
    expect(screen.queryByText(/authenticated/)).toBeNull();
  });

  it('reports unreachable when the server cannot be contacted', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<Probe />);

    // Not `none`: nothing was learned, so claiming "signed out" would be a
    // statement the client is not entitled to make.
    await waitFor(() => expect(screen.getByText('unreachable|none')).toBeTruthy());
  });

  it('refuses a 200 it cannot parse rather than reporting signed-out', async () => {
    respondWith(200, { ...SUMMARY, principal: 'service' });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<Probe />);

    await waitFor(() => expect(screen.getByText('unreachable|none')).toBeTruthy());
    expect(error).toHaveBeenCalled();
  });

  it('retries server logout before passive session restoration when a durable marker exists', async () => {
    const durable = storage();
    const control = createLogoutPendingControl(durable, () => 'generation-1');
    control.ensurePending();
    const logout = vi.fn(async () => 'denied-pending' as const);
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    render(<Probe control={control} service={{ logout }} />);

    expect(screen.getByText('logout-pending|none')).toBeTruthy();
    await waitFor(() => expect(logout).toHaveBeenCalledOnce());
    expect(fetch).not.toHaveBeenCalled();
    expect(control.read()).toMatchObject({ status: 'pending' });
    expect(screen.getByText('logout-pending|none')).toBeTruthy();
  });

  it('clears the matching marker only after the server confirms logout', async () => {
    const durable = storage();
    const control = createLogoutPendingControl(durable, () => 'generation-1');
    control.ensurePending();
    const logout = vi.fn(async () => 'confirmed' as const);
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    render(<Probe control={control} service={{ logout }} />);

    await waitFor(() => expect(screen.getByText('none|none')).toBeTruthy());
    expect(control.read()).toEqual({ status: 'clear' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reports unavailable control storage without attempting passive restoration', () => {
    const control = createLogoutPendingControl(undefined);
    const logout = vi.fn(async () => 'unavailable' as const);
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    render(<Probe control={control} service={{ logout }} />);

    expect(screen.getByText('logout-storage-unavailable|none')).toBeTruthy();
    expect(logout).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
