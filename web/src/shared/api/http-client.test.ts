import { afterEach, describe, expect, it, vi } from 'vitest';

import { subscribeSessionRevocation } from '@/shared/session-revocation-events';
import { httpClient } from './http-client';

afterEach(() => {
  vi.unstubAllGlobals();
});

function rejectWith(status: number, error: string): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
    JSON.stringify({ error }),
    { status, headers: { 'content-type': 'application/json' } },
  )));
}

describe('authenticated response handling', () => {
  it('lets the browser set the multipart boundary for form uploads', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);
    const form = new FormData();
    form.append('name', 'Synthetic note');

    await httpClient.postForm('/protected/upload', form);

    expect(fetchMock).toHaveBeenCalledWith('/protected/upload', {
      method: 'POST',
      body: form,
      credentials: 'include',
      headers: { accept: 'application/json' },
    });
  });

  it('requests private binary content without browser cache reuse', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      new Blob(['%PDF synthetic'], { type: 'application/pdf' }),
      { status: 200 },
    ));
    vi.stubGlobal('fetch', fetchMock);

    const response = await httpClient.getBlob('/protected/source', {
      signal: new AbortController().signal,
    });

    expect(response.body.size).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledWith('/protected/source', expect.objectContaining({
      cache: 'no-store',
      credentials: 'include',
      headers: expect.objectContaining({ accept: 'application/octet-stream' }),
      signal: expect.any(AbortSignal),
    }));
  });

  it('returns public flow errors without publishing an authenticated-session fence', async () => {
    rejectWith(400, 'invalid_credentials');
    const observed: string[] = [];
    const unsubscribe = subscribeSessionRevocation((reason) => observed.push(reason));

    const response = await httpClient.exchange<{ error: string }>('/self-service/login', {
      method: 'POST',
      body: JSON.stringify({ method: 'password' }),
    });

    unsubscribe();
    expect(response).toMatchObject({
      status: 400,
      ok: false,
      body: { error: 'invalid_credentials' },
    });
    expect(observed).toEqual([]);
  });

  it('fences the session when fresh practice membership is denied', async () => {
    rejectWith(403, 'practice_denied');
    const observed: string[] = [];
    const unsubscribe = subscribeSessionRevocation((reason) => observed.push(reason));

    await expect(httpClient.get('/protected')).rejects.toMatchObject({
      status: 403,
      code: 'practice_denied',
    });

    unsubscribe();
    expect(observed).toEqual(['Your access to this practice has ended. Sign in again.']);
  });

  it.each(['get', 'deleteEmpty'] as const)('fences %s when reauthentication is required', async (method) => {
    rejectWith(403, 'reauthentication_required');
    const observed: string[] = [];
    const unsubscribe = subscribeSessionRevocation((reason) => observed.push(reason));

    try {
      await expect(httpClient[method]('/protected')).rejects.toMatchObject({
        status: 403,
        code: 'reauthentication_required',
      });
      expect(observed).toEqual(['Sign in again to verify your session.']);
    } finally {
      unsubscribe();
    }
  });

  it('keeps a domain capability refusal scoped to its command', async () => {
    rejectWith(403, 'signing_denied');
    const observed: string[] = [];
    const unsubscribe = subscribeSessionRevocation((reason) => observed.push(reason));

    await expect(httpClient.get('/protected')).rejects.toMatchObject({
      status: 403,
      code: 'signing_denied',
    });

    unsubscribe();
    expect(observed).toEqual([]);
  });
});
