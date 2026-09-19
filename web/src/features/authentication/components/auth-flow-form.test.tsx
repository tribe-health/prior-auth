import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AuthFlowModel } from '@/features/authentication/hooks/use-auth-flow-model';
import type { AuthFlowKind } from '@/features/authentication/model/auth-flow';
import { AuthFlowForm } from './auth-flow-form';

const model = vi.hoisted(() => ({ current: null as AuthFlowModel | null }));

vi.mock('@/features/authentication/hooks/use-auth-flow-model', () => ({
  useAuthFlowModel: () => model.current,
}));

afterEach(() => {
  cleanup();
  model.current = null;
});

describe('AuthFlowForm', () => {
  it('renders provider messages and submits hidden CSRF plus the clicked method', () => {
    const submit = vi.fn<(data: FormData) => Promise<void>>().mockResolvedValue(undefined);
    model.current = {
      phase: 'ready',
      startUrl: '/self-service/login/browser',
      message: null,
      submit,
      flow: {
        id: 'flow-1',
        kind: 'login',
        expiresAt: '2099-01-01T00:00:00Z',
        action: '/self-service/login?flow=flow-1',
        method: 'POST',
        messages: [{ id: 1, kind: 'info', text: 'Use your practice account.' }],
        nodes: [
          {
            key: 'default:csrf_token:0',
            group: 'default',
            name: 'csrf_token',
            type: 'hidden',
            value: 'synthetic-csrf',
            required: true,
            disabled: false,
            label: 'CSRF',
            messages: [],
          },
          {
            key: 'password:identifier:1',
            group: 'password',
            name: 'identifier',
            type: 'email',
            value: '',
            required: true,
            disabled: false,
            autocomplete: 'username',
            label: 'Work email',
            messages: [{ id: 2, kind: 'error', text: 'Enter your work email.' }],
          },
          {
            key: 'password:method:2',
            group: 'password',
            name: 'method',
            type: 'submit',
            value: 'password',
            required: false,
            disabled: false,
            label: 'Sign in',
            messages: [],
          },
        ],
      },
    };

    render(<AuthFlowForm kind="login" flowId="flow-1" />);

    expect(screen.getByText('Use your practice account.')).toBeTruthy();
    expect(screen.getByText('Enter your work email.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Work email'), {
      target: { value: 'clinician@example.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(submit).toHaveBeenCalledOnce();
    const submitted = submit.mock.calls[0]?.[0] as FormData;
    expect(Object.fromEntries(submitted.entries())).toEqual({
      csrf_token: 'synthetic-csrf',
      identifier: 'clinician@example.test',
      method: 'password',
    });
  });

  it.each<[AuthFlowKind, string]>([
    ['login', 'sign-in'],
    ['recovery', 'recovery'],
  ])('offers a new %s browser flow when the current flow expired', (kind, label) => {
    model.current = {
      phase: 'expired',
      flow: null,
      startUrl: `/self-service/${kind}/browser`,
      message: 'This account access form expired. Start a new form to continue.',
      submit: vi.fn(),
    };

    render(<AuthFlowForm kind={kind} flowId="expired-flow" />);

    expect(screen.getByText('Account access form expired')).toBeTruthy();
    expect(screen.getByRole('link', { name: `Start a new ${label} form` }).getAttribute('href'))
      .toBe(`/self-service/${kind}/browser`);
  });
});
