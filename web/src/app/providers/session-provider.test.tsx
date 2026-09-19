import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SessionHintBus } from '@/features/session/services/session-hint-bus';
import type { SessionService } from '@/features/session/services/session-service';
import type { VerifiedSession } from '@/shared/model/session';
import { publishReplicaRevalidationFailure } from '@/shared/session-revocation-events';
import {
  SessionAccessBoundary,
  SessionProvider,
  useAccessState,
  useRuntimeActions,
  useRuntimePhase,
  useSession,
  useSessionActions,
  useSessionEpoch,
} from './session-provider';

function Probe() {
  const session = useSession();
  const { accessState, notice } = useAccessState();
  return <p>{session?.sessionId ?? 'none'}|{accessState}|{notice ?? 'none'}</p>;
}

function LifecycleProbe() {
  const session = useSession();
  const { accessState } = useAccessState();
  const phase = useRuntimePhase();
  const epoch = useSessionEpoch();
  const { transitionRuntimePhase } = useRuntimeActions();
  return (
    <section>
      <p>{session?.sessionId ?? 'none'}|{accessState}|{phase}|{epoch}</p>
      <button type="button" onClick={() => {
        transitionRuntimePhase('migrating', epoch);
        transitionRuntimePhase('hydrating', epoch);
        transitionRuntimePhase('catching-up', epoch);
      }}>Reach catch-up</button>
    </section>
  );
}

function BoundaryProbe() {
  return (
    <>
      <LifecycleProbe />
      <SessionAccessBoundary fallback={<p>Protected content locked</p>}>
        {() => <p>Protected case content</p>}
      </SessionAccessBoundary>
    </>
  );
}

function LogoutProbe() {
  const { logout } = useSessionActions();
  const { accessState, logoutState } = useAccessState();
  return (
    <section>
      <p>{accessState}|{logoutState}</p>
      <button type="button" onClick={() => void logout()}>End session</button>
    </section>
  );
}

function deferred() {
  let resolve: (() => void) | undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve: () => resolve?.() };
}

function hintBus() {
  let listener: (() => void) | undefined;
  const bus: SessionHintBus & { emit(): void } = {
    publish: vi.fn(),
    subscribe(next) {
      listener = next;
      return () => {
        listener = undefined;
      };
    },
    close: vi.fn(),
    emit() {
      listener?.();
    },
  };
  return bus;
}

function service(result: VerifiedSession): SessionService {
  return {
    revalidate: vi.fn(async () => ({ status: 'authenticated' as const, session: result })),
    logout: vi.fn(async () => 'confirmed' as const),
  };
}

function session(expiresAt: string, sessionId = 'session-1'): VerifiedSession {
  return {
    identityId: 'identity-1',
    sessionId,
    userId: 'user-1',
    practiceId: 'practice-1',
    displayName: 'Dr Rivera',
    capabilities: ['affirm_gate', 'sign_letter'],
    principal: 'user',
    expiresAt,
    authorizationRevision: `membership:${sessionId}`,
  };
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.useRealTimers();
});

describe('SessionProvider access fence', () => {
  it('leaves an injected hint bus open for its owner', () => {
    const hints = hintBus();
    const view = render(
      <SessionProvider session={session('2099-01-01T00:00:00Z')} hintBus={hints}>
        <Probe />
      </SessionProvider>,
    );

    view.unmount();

    expect(hints.close).not.toHaveBeenCalled();
  });

  it('fences at the verified expiry and accepts a later verified session prop', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-09T12:00:00Z'));
    const first = session('2026-09-09T12:00:01Z');
    const view = render(<SessionProvider session={first}><Probe /></SessionProvider>);
    expect(screen.getByText('session-1|authenticated|none')).toBeTruthy();

    await act(async () => vi.advanceTimersByTime(1_000));
    expect(screen.getByText('none|locally-locked|Your session expired. Sign in to continue.')).toBeTruthy();

    const replacement = session('2026-09-09T13:00:00Z', 'session-2');
    view.rerender(<SessionProvider session={replacement}><Probe /></SessionProvider>);
    expect(screen.getByText('session-2|authenticated|none')).toBeTruthy();
  });

  it('routes replica revalidation failure through the same synchronous fence', () => {
    render(
      <SessionProvider session={session('2099-01-01T00:00:00Z')}>
        <Probe />
      </SessionProvider>,
    );

    act(() => publishReplicaRevalidationFailure('Replica authorization changed.'));
    expect(screen.getByText('none|locally-locked|Replica authorization changed.')).toBeTruthy();
  });

  it('keeps a foreground resume locked until authority and graph drain complete', async () => {
    const first = session('2099-01-01T00:00:00Z');
    const replacement = session('2099-01-01T01:00:00Z', 'session-2');
    const authority = service(replacement);
    const drain = deferred();
    const hints = hintBus();
    render(
      <SessionProvider
        session={first}
        service={authority}
        hintBus={hints}
        quiesce={() => drain.promise}
      >
        <BoundaryProbe />
      </SessionProvider>,
    );

    act(() => window.dispatchEvent(new PageTransitionEvent('pageshow')));
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText('none|locally-locked|quiescing|1')).toBeTruthy();
    expect(screen.getByText('Protected content locked')).toBeTruthy();
    expect(screen.queryByText('Protected case content')).toBeNull();
    expect(authority.revalidate).toHaveBeenCalledWith('practice-1');
    expect(screen.queryByText('session-2|authenticated|opening-replica|1')).toBeNull();

    await act(async () => {
      drain.resolve();
      await drain.promise;
    });
    expect(await screen.findByText('session-2|authenticated|opening-replica|1')).toBeTruthy();
    expect(screen.getByText('Protected case content')).toBeTruthy();
  });

  it('treats a cross-tab message as a revalidation hint rather than authority', async () => {
    const first = session('2099-01-01T00:00:00Z');
    const replacement = session('2099-01-01T01:00:00Z', 'session-2');
    const authority = service(replacement);
    const hints = hintBus();
    render(
      <SessionProvider session={first} service={authority} hintBus={hints}>
        <BoundaryProbe />
      </SessionProvider>,
    );

    act(() => hints.emit());

    expect(screen.getByText('none|locally-locked|quiescing|1')).toBeTruthy();
    expect(screen.queryByText('Protected case content')).toBeNull();
    expect(authority.revalidate).toHaveBeenCalledOnce();
    expect(await screen.findByText('session-2|authenticated|opening-replica|1')).toBeTruthy();
  });

  it('drains a catch-up runtime before installing a changed account scope', async () => {
    const first = session('2099-01-01T00:00:00Z');
    const replacement = {
      ...session('2099-01-01T01:00:00Z', 'session-2'),
      identityId: 'identity-2',
      userId: 'user-2',
      practiceId: 'practice-2',
      authorizationRevision: 'membership:2',
    };
    const drain = deferred();
    const hints = hintBus();
    const view = render(
      <SessionProvider session={first} service={service(replacement)} hintBus={hints} quiesce={() => drain.promise}>
        <BoundaryProbe />
      </SessionProvider>,
    );
    act(() => screen.getByRole('button', { name: 'Reach catch-up' }).click());
    expect(screen.getByText('session-1|authenticated|catching-up|0')).toBeTruthy();

    view.rerender(
      <SessionProvider session={replacement} service={service(replacement)} hintBus={hints} quiesce={() => drain.promise}>
        <BoundaryProbe />
      </SessionProvider>,
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText('none|locally-locked|quiescing|1')).toBeTruthy();
    expect(screen.queryByText('Protected case content')).toBeNull();
    expect(hints.publish).toHaveBeenCalledWith('scope-change');
    expect(screen.queryByText('session-2|authenticated|opening-replica|1')).toBeNull();
    await act(async () => {
      drain.resolve();
      await drain.promise;
    });
    expect(await screen.findByText('session-2|authenticated|opening-replica|1')).toBeTruthy();
  });

  it('keeps protected content locked when graph quiescence fails synchronously', async () => {
    const first = session('2099-01-01T00:00:00Z');
    render(
      <SessionProvider
        session={first}
        service={service(first)}
        hintBus={hintBus()}
        quiesce={() => {
          throw new Error('synthetic drain failure');
        }}
      >
        <BoundaryProbe />
      </SessionProvider>,
    );

    act(() => window.dispatchEvent(new PageTransitionEvent('pageshow')));

    expect(await screen.findByText('none|locally-locked|recovery-required|1')).toBeTruthy();
    expect(screen.getByText('Protected content locked')).toBeTruthy();
    expect(screen.queryByText('Protected case content')).toBeNull();
  });

  it('notifies other tabs after the durable logout fence starts', async () => {
    const hints = hintBus();
    const authority: SessionService = {
      revalidate: vi.fn(async () => ({
        status: 'authenticated' as const,
        session: session('2099-01-01T00:00:00Z'),
      })),
      logout: vi.fn(() => new Promise<'denied-pending'>(() => undefined)),
    };
    render(
      <SessionProvider
        session={session('2099-01-01T00:00:00Z')}
        service={authority}
        hintBus={hints}
      >
        <LogoutProbe />
      </SessionProvider>,
    );

    act(() => screen.getByRole('button', { name: 'End session' }).click());

    expect(hints.publish).toHaveBeenCalledWith('access-change');
    expect(screen.getByText('locally-locked|submitting')).toBeTruthy();
    expect(localStorage.getItem('aso:logout-pending:v1')).not.toBeNull();
  });
});
