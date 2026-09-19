import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SessionLogoutBody } from '@/features/session/api/session-api';
import { ApiError, type HttpExchange } from '@/shared/api/http-client';
import { createSessionService } from './session-service';

afterEach(() => vi.unstubAllGlobals());

const PAYLOAD = {
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

function api(current: () => Promise<unknown>) {
  return {
    current: vi.fn(current),
    logout: vi.fn<() => Promise<HttpExchange<SessionLogoutBody>>>(async () => ({
      status: 204,
      ok: true,
      body: null,
      redirectedTo: null,
    })),
  };
}

describe('session service revalidation', () => {
  it('returns only a parsed authoritative session for the selected practice', async () => {
    const port = api(async () => PAYLOAD);
    const service = createSessionService(port);

    await expect(service.revalidate('practice-1')).resolves.toEqual({
      status: 'authenticated',
      session: PAYLOAD,
    });
    expect(port.current).toHaveBeenCalledWith('practice-1');
  });

  it('distinguishes no session from an unavailable or malformed authority response', async () => {
    const noSession = createSessionService(api(async () => {
      throw new ApiError(401, 'unauthenticated');
    }));
    const unavailable = createSessionService(api(async () => {
      throw new TypeError('network unavailable');
    }));
    const malformed = createSessionService(api(async () => ({ identityId: 'partial' })));

    await expect(noSession.revalidate()).resolves.toEqual({ status: 'none', session: null });
    await expect(unavailable.revalidate()).resolves.toEqual({ status: 'unreachable', session: null });
    await expect(malformed.revalidate()).resolves.toEqual({ status: 'unreachable', session: null });
  });

  it('preserves the shell-neutral confirmed and incomplete logout results', async () => {
    const port = api(async () => PAYLOAD);
    const service = createSessionService(port);

    await expect(service.logout()).resolves.toBe('confirmed');

    port.logout.mockResolvedValueOnce({
      status: 503,
      ok: false,
      body: { error: 'logout_incomplete' },
      redirectedTo: null,
    });
    await expect(service.logout()).resolves.toBe('denied-pending');

    port.logout.mockResolvedValueOnce({
      status: 503,
      ok: false,
      body: { error: 'session_unavailable' },
      redirectedTo: null,
    });
    await expect(service.logout()).resolves.toBe('unavailable');
  });

  it('does not treat an ambiguous or lost logout response as confirmation', async () => {
    const port = api(async () => PAYLOAD);
    const service = createSessionService(port);
    port.logout.mockResolvedValueOnce({
      status: 200,
      ok: true,
      body: { status: 'confirmed' },
      redirectedTo: null,
    });
    await expect(service.logout()).resolves.toBe('unavailable');

    port.logout.mockRejectedValueOnce(new TypeError('network unavailable'));
    await expect(service.logout()).resolves.toBe('unavailable');
  });

  it('maps the mounted HTTP result while leaving the browser credential in fetch', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ error: 'logout_incomplete' }),
        { status: 503, headers: { 'content-type': 'application/json' } },
      ));
    vi.stubGlobal('fetch', fetch);
    const service = createSessionService();

    await expect(service.logout()).resolves.toBe('confirmed');
    await expect(service.logout()).resolves.toBe('denied-pending');
    expect(fetch).toHaveBeenNthCalledWith(1, '/api/session', expect.objectContaining({
      method: 'DELETE',
      credentials: 'include',
    }));
  });
});
