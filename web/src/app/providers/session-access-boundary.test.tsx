import { useEffect, useSyncExternalStore } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LetterSigningCard } from '@/features/letter-signing/components/letter-signing-card';
import { httpClient } from '@/shared/api/http-client';
import type { VerifiedSession } from '@/shared/model/session';
import {
  claimRuntimeCommand,
  getRuntimeCommand,
  resetRuntimeCommandRegistryForTests,
  subscribeRuntimeCommand,
  type RuntimeCommandScope,
} from '@/shared/runtime-command-registry';
import { publishReplicaRevalidationFailure } from '@/shared/session-revocation-events';
import {
  SessionAccessBoundary,
  SessionProvider,
  useSessionActions,
} from './session-provider';

const service = vi.hoisted(() => ({
  logout: vi.fn<() => Promise<void>>(),
}));

vi.mock('@/features/session/services/session-service', () => ({ sessionService: service }));

vi.mock('@/features/letter-signing/hooks/use-letter-signing', () => ({
  useLetterSigning: () => ({
    target: {
      letterId: 'letter-1',
      caseId: 'case-1',
      letterVersion: 3,
      qaRevision: 4,
      signatureVersion: 2,
      status: 'approved',
      approvedByActor: true,
      isCurrent: true,
      gateAffirmed: true,
      qaComplete: true,
      sourcesComplete: true,
    },
    result: null,
    loading: false,
    message: 'Signing was accepted. Waiting for the signed letter to appear.',
    outcome: 'awaiting-projection',
    submitting: false,
    uncertain: false,
    awaitingProjection: true,
    sign: vi.fn(),
    reconcile: vi.fn(),
  }),
}));

const SESSION: VerifiedSession = {
  identityId: 'identity-1',
  sessionId: 'session-1',
  userId: 'user-1',
  practiceId: 'practice-1',
  displayName: 'Dr Rivera',
  capabilities: ['sign_letter'],
  principal: 'user',
  expiresAt: '2099-01-01T00:00:00Z',
  authorizationRevision: 'membership:1',
};

const COMMAND_SCOPE: RuntimeCommandScope = {
  feature: 'letter-signing',
      sessionId: SESSION.sessionId,
      authorizationRevision: SESSION.authorizationRevision,
      epoch: 0,
      identityId: SESSION.identityId,
  practiceId: SESSION.practiceId,
  caseId: 'letter:letter-1',
};

let protectedMounts = 0;

function ProtectedCommandSurface() {
  const command = useSyncExternalStore(
    (listener) => subscribeRuntimeCommand(COMMAND_SCOPE, listener),
    () => getRuntimeCommand(COMMAND_SCOPE),
    () => getRuntimeCommand(COMMAND_SCOPE),
  );
  const { logout } = useSessionActions();

  useEffect(() => {
    protectedMounts += 1;
  }, []);

  return (
    <section data-testid="protected-runtime" data-command-owner={command?.id ?? 'none'}>
      <LetterSigningCard letterId="letter-1" caseId="case-1" />
      <button type="button" onClick={() => void logout()}>End session</button>
    </section>
  );
}

function RuntimeBoundary({ session = SESSION }: { session?: VerifiedSession }) {
  return (
    <SessionProvider session={session}>
      <SessionAccessBoundary fallback={<p>Access locked</p>}>
        {() => <ProtectedCommandSurface />}
      </SessionAccessBoundary>
    </SessionProvider>
  );
}

function claimCommand(): void {
  expect(claimRuntimeCommand(COMMAND_SCOPE, {
    id: 'command-1',
    status: 'awaiting-projection',
  })).toBe(true);
}

function expectSynchronousFence(): void {
  expect(screen.queryByTestId('protected-runtime')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Check signed letter' })).toBeNull();
  expect(screen.getByText('Access locked')).toBeTruthy();
  expect(getRuntimeCommand(COMMAND_SCOPE)).toBeNull();
}

beforeEach(() => {
  localStorage.clear();
  protectedMounts = 0;
  resetRuntimeCommandRegistryForTests();
  service.logout.mockReset();
  service.logout.mockImplementation(() => new Promise<void>(() => undefined));
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  resetRuntimeCommandRegistryForTests();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('shared responsive session boundary', () => {
  it('retains one command owner and one mounted control across wide and compact layouts', () => {
    claimCommand();
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1280 });
    const view = render(<RuntimeBoundary />);
    const wideControl = screen.getByRole('button', { name: 'Check signed letter' });

    expect(wideControl.className).toContain('w-full');
    expect(wideControl.className).toContain('sm:w-auto');
    expect(screen.getByTestId('protected-runtime').dataset.commandOwner).toBe('command-1');

    window.innerWidth = 390;
    act(() => window.dispatchEvent(new Event('resize')));
    view.rerender(<RuntimeBoundary />);

    const compactControls = screen.getAllByRole('button', { name: 'Check signed letter' });
    expect(compactControls).toHaveLength(1);
    expect(compactControls[0]).toBe(wideControl);
    expect(protectedMounts).toBe(1);
    expect(getRuntimeCommand(COMMAND_SCOPE)).toMatchObject({
      id: 'command-1',
      status: 'awaiting-projection',
    });
  });

  it('fences protected content synchronously when logout starts', () => {
    claimCommand();
    render(<RuntimeBoundary />);

    fireEvent.click(screen.getByRole('button', { name: 'End session' }));

    expect(service.logout).toHaveBeenCalledOnce();
    expectSynchronousFence();
  });

  it('fences protected content synchronously at verified session expiry', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-12T12:00:00Z'));
    claimCommand();
    render(<RuntimeBoundary session={{ ...SESSION, expiresAt: '2026-09-12T12:00:01Z' }} />);

    await act(async () => vi.advanceTimersByTime(1_000));

    expectSynchronousFence();
  });

  it.each(['practice_denied', 'reauthentication_required'])('fences protected content synchronously for %s', async (code) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: code }),
      { status: 403, headers: { 'content-type': 'application/json' } },
    )));
    claimCommand();
    render(<RuntimeBoundary />);

    await act(async () => {
      await expect(httpClient.get('/protected')).rejects.toMatchObject({
        status: 403,
        code,
      });
    });

    expectSynchronousFence();
  });

  it('fences protected content synchronously after replica revalidation fails', () => {
    claimCommand();
    render(<RuntimeBoundary />);

    act(() => publishReplicaRevalidationFailure('Replica authorization changed.'));

    expectSynchronousFence();
  });
});
