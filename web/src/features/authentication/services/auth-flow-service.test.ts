import { afterEach, describe, expect, it, vi } from 'vitest';

import { authFlowApi } from '@/features/authentication/api/auth-flow-api';
import type { AuthFlow } from '@/features/authentication/model/auth-flow';
import { authFlowService } from './auth-flow-service';

function wireFlow(message = '') {
  return {
    id: 'flow-1',
    type: 'browser',
    expires_at: '2099-01-01T00:00:00Z',
    ui: {
      action: 'http://kratos:4433/self-service/login?flow=flow-1',
      method: 'POST',
      messages: message ? [{ id: 1, type: 'error', text: message }] : [],
      nodes: [
        {
          type: 'input',
          group: 'default',
          attributes: { name: 'csrf_token', type: 'hidden', value: 'synthetic-csrf' },
          meta: { label: { text: 'CSRF' } },
          messages: [],
        },
      ],
    },
  };
}

const FLOW: AuthFlow = {
  id: 'flow-1',
  kind: 'login',
  expiresAt: '2099-01-01T00:00:00Z',
  action: '/self-service/login?flow=flow-1',
  method: 'POST',
  messages: [],
  nodes: [],
};

afterEach(() => vi.restoreAllMocks());

describe('authFlowService', () => {
  it('loads a browser flow through the same-origin endpoint', async () => {
    const get = vi.spyOn(authFlowApi, 'get').mockResolvedValue({
      status: 200,
      ok: true,
      body: wireFlow(),
      redirectedTo: null,
    });

    const result = await authFlowService.load(
      'login',
      'flow-1',
      'https://app.example.test/login?flow=flow-1',
    );

    expect(get).toHaveBeenCalledWith('login', 'flow-1');
    expect(result).toMatchObject({
      status: 'ready',
      flow: { action: '/self-service/login?flow=flow-1' },
    });
  });

  it('returns the provider-updated flow and preserves submitted CSRF fields', async () => {
    const submit = vi.spyOn(authFlowApi, 'submit').mockResolvedValue({
      status: 400,
      ok: false,
      body: wireFlow('The credentials are incorrect.'),
      redirectedTo: null,
    });
    const formData = new FormData();
    formData.set('csrf_token', 'synthetic-csrf');
    formData.set('identifier', 'clinician@example.test');
    formData.set('method', 'password');

    const result = await authFlowService.submit(
      FLOW,
      formData,
      'https://app.example.test/login?flow=flow-1',
    );

    expect(submit).toHaveBeenCalledWith('/self-service/login?flow=flow-1', {
      csrf_token: 'synthetic-csrf',
      identifier: 'clinician@example.test',
      method: 'password',
    });
    expect(result).toMatchObject({
      status: 'updated',
      flow: { messages: [{ kind: 'error', text: 'The credentials are incorrect.' }] },
    });
  });

  it('does not submit an expired flow', async () => {
    const submit = vi.spyOn(authFlowApi, 'submit');
    const result = await authFlowService.submit(
      { ...FLOW, expiresAt: '2000-01-01T00:00:00Z' },
      new FormData(),
      'https://app.example.test/login',
    );

    expect(result).toEqual({ status: 'expired' });
    expect(submit).not.toHaveBeenCalled();
  });

  it('expires a flow Kratos reports as gone and rejects a mismatched flow body', async () => {
    const get = vi.spyOn(authFlowApi, 'get');
    get.mockResolvedValueOnce({
      status: 410,
      ok: false,
      body: null,
      redirectedTo: null,
    });

    await expect(authFlowService.load(
      'recovery',
      'expired-flow',
      'https://app.example.test/recovery?flow=expired-flow',
    )).resolves.toEqual({ status: 'expired' });

    get.mockResolvedValueOnce({
      status: 200,
      ok: true,
      body: { ...wireFlow(), id: 'other-flow' },
      redirectedTo: null,
    });
    await expect(authFlowService.load(
      'login',
      'flow-1',
      'https://app.example.test/login?flow=flow-1',
    )).resolves.toEqual({ status: 'unavailable' });
  });

  it('expires a submitted flow when Kratos reports it is gone', async () => {
    vi.spyOn(authFlowApi, 'submit').mockResolvedValue({
      status: 410,
      ok: false,
      body: null,
      redirectedTo: null,
    });

    await expect(authFlowService.submit(
      FLOW,
      new FormData(),
      'https://app.example.test/login?flow=flow-1',
    )).resolves.toEqual({ status: 'expired' });
  });
});
