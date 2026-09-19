import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AuthFlow, AuthFlowKind } from '@/features/authentication/model/auth-flow';
import type {
  AuthFlowLoadResult,
  AuthFlowService,
} from '@/features/authentication/services/auth-flow-service';
import { useAuthFlowModel } from './use-auth-flow-model';

function flow(id: string, message = '', kind: AuthFlowKind = 'login'): AuthFlow {
  return {
    id,
    kind,
    expiresAt: '2099-01-01T00:00:00Z',
    action: `/self-service/${kind}?flow=${id}`,
    method: 'POST',
    messages: message ? [{ id: 1, kind: 'error', text: message }] : [],
    nodes: [],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function service(overrides: Partial<AuthFlowService> = {}): AuthFlowService {
  return {
    startUrl: (kind) => `/self-service/${kind}/browser`,
    load: vi.fn().mockResolvedValue({ status: 'ready', flow: flow('flow-1') }),
    submit: vi.fn().mockResolvedValue({ status: 'completed' }),
    ...overrides,
  };
}

afterEach(cleanup);

describe('useAuthFlowModel', () => {
  it('loads the requested browser flow and keeps provider updates in the hook', async () => {
    const auth = service({
      submit: vi.fn().mockResolvedValue({
        status: 'updated',
        flow: flow('flow-1', 'The credentials are incorrect.'),
      }),
    });
    const { result } = renderHook(() => useAuthFlowModel('login', 'flow-1', auth));

    await waitFor(() => expect(result.current.phase).toBe('ready'));
    await act(async () => result.current.submit(new FormData()));

    expect(result.current.phase).toBe('ready');
    expect(result.current.flow?.messages[0]?.text).toBe('The credentials are incorrect.');
  });

  it('ignores a previous flow response after the route selects a new flow', async () => {
    const first = deferred<AuthFlowLoadResult>();
    const auth = service({
      load: vi.fn((_, id): Promise<AuthFlowLoadResult> => id === 'flow-1'
        ? first.promise
        : Promise.resolve({ status: 'ready', flow: flow(id) })),
    });
    const { result, rerender } = renderHook(
      ({ id }) => useAuthFlowModel('login', id, auth),
      { initialProps: { id: 'flow-1' } },
    );

    rerender({ id: 'flow-2' });
    await waitFor(() => expect(result.current.flow?.id).toBe('flow-2'));
    await act(async () => first.resolve({ status: 'ready', flow: flow('flow-1') }));

    expect(result.current.flow?.id).toBe('flow-2');
  });

  it.each<AuthFlowKind>(['login', 'recovery'])(
    'reloads authoritative session bootstrap after a completed %s flow',
    async (kind) => {
      const auth = service({
        load: vi.fn().mockResolvedValue({ status: 'ready', flow: flow('flow-1', '', kind) }),
      });
      const completeFlow = vi.fn();
      const resolveExplicitLogin = vi.fn(() => 'cleared' as const);
      const { result } = renderHook(() => (
        useAuthFlowModel(kind, 'flow-1', auth, completeFlow, resolveExplicitLogin)
      ));

      await waitFor(() => expect(result.current.phase).toBe('ready'));
      await act(async () => result.current.submit(new FormData()));

      expect(completeFlow).toHaveBeenCalledOnce();
      expect(resolveExplicitLogin).toHaveBeenCalledTimes(kind === 'login' ? 1 : 0);
    },
  );

  it('does not navigate after login when the durable logout control cannot be cleared', async () => {
    const auth = service();
    const completeFlow = vi.fn();
    const { result } = renderHook(() => useAuthFlowModel(
      'login',
      'flow-1',
      auth,
      completeFlow,
      () => 'unavailable',
    ));

    await waitFor(() => expect(result.current.phase).toBe('ready'));
    await act(async () => result.current.submit(new FormData()));

    expect(result.current.phase).toBe('unavailable');
    expect(result.current.message).toBe(
      'Sign-in completed, but the local sign-out control could not be cleared.',
    );
    expect(completeFlow).not.toHaveBeenCalled();
  });

  it('keeps the matching browser-flow restart available when Kratos is unreachable', async () => {
    const auth = service({ load: vi.fn().mockRejectedValue(new Error('upstream unavailable')) });
    const { result } = renderHook(() => useAuthFlowModel('recovery', 'flow-1', auth));

    await waitFor(() => expect(result.current.phase).toBe('unavailable'));

    expect(result.current.flow).toBeNull();
    expect(result.current.startUrl).toBe('/self-service/recovery/browser');
    expect(result.current.message).toBe('The account access form could not be loaded.');
  });
});
