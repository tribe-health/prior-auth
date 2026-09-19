import { describe, expect, it } from 'vitest';

import { parseAuthFlow } from './auth-flow';

function flow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'flow-1',
    type: 'browser',
    expires_at: '2099-01-01T00:00:00Z',
    ui: {
      action: 'http://kratos:4433/self-service/login?flow=flow-1',
      method: 'POST',
      messages: [{ id: 1, type: 'info', text: 'Use your practice account.' }],
      nodes: [
        {
          type: 'input',
          group: 'default',
          attributes: {
            name: 'csrf_token',
            type: 'hidden',
            value: 'synthetic-csrf',
            required: true,
          },
          meta: { label: { text: 'CSRF' } },
          messages: [],
        },
        {
          type: 'input',
          group: 'password',
          attributes: {
            name: 'identifier',
            type: 'text',
            value: '',
            required: true,
            autocomplete: 'username',
          },
          meta: { label: { text: 'Work email' } },
          messages: [{ id: 2, type: 'error', text: 'Enter your work email.' }],
        },
        {
          type: 'input',
          group: 'password',
          attributes: { name: 'method', type: 'submit', value: 'password' },
          meta: { label: { text: 'Sign in' } },
          messages: [],
        },
      ],
    },
    ...overrides,
  };
}

describe('parseAuthFlow', () => {
  it('narrows browser nodes and rebases the trusted Kratos action to the application origin', () => {
    const parsed = parseAuthFlow(flow(), 'login', 'flow-1', 'https://app.example.test/login');

    expect(parsed).toMatchObject({
      id: 'flow-1',
      kind: 'login',
      action: '/self-service/login?flow=flow-1',
      method: 'POST',
    });
    expect(parsed?.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'csrf_token', type: 'hidden', value: 'synthetic-csrf' }),
      expect.objectContaining({
        name: 'identifier',
        label: 'Work email',
        autocomplete: 'username',
        messages: [expect.objectContaining({ kind: 'error', text: 'Enter your work email.' })],
      }),
    ]));
  });

  it('refuses native flows and actions that target another flow or endpoint', () => {
    expect(parseAuthFlow(flow({ type: 'api' }), 'login', 'flow-1', 'https://app.test')).toBeNull();
    expect(parseAuthFlow(flow({
      ui: { ...(flow().ui as object), action: '/admin/identities?flow=flow-1' },
    }), 'login', 'flow-1', 'https://app.test')).toBeNull();
    expect(parseAuthFlow(flow({
      ui: { ...(flow().ui as object), action: '/self-service/login?flow=flow-2' },
    }), 'login', 'flow-1', 'https://app.test')).toBeNull();
  });
});
