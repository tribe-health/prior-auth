import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';

import { SessionProvider } from '@/app/providers/session-provider';
import type { StartupSessionStatus } from '@/features/session/model/startup-session';
import type { VerifiedSession } from '@/shared/model/session';

const privateRuntime = vi.hoisted(() => ({
  databaseOpen: vi.fn(),
  shapeSubscribe: vi.fn(),
}));

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();
  return { ...actual, createBrowserRouter: vi.fn() };
});

vi.mock('@/app/providers/graph-provider', () => ({
  GraphProvider: () => {
    privateRuntime.databaseOpen();
    privateRuntime.shapeSubscribe();
    return <p>Private runtime mounted</p>;
  },
}));

import { appRouteObjects } from './app-routes';

const SESSION: VerifiedSession = {
  identityId: 'identity-1',
  sessionId: 'session-1',
  userId: 'user-1',
  practiceId: 'practice-1',
  displayName: 'Dr Rivera',
  capabilities: [],
  principal: 'user',
  expiresAt: '2099-01-01T00:00:00Z',
  authorizationRevision: 'membership:1',
};

function renderRoute(
  path: string,
  startupStatus: StartupSessionStatus,
  session: VerifiedSession | null = null,
) {
  const routes: RouteObject[] = appRouteObjects.map((route, index) => index === 1
    ? { element: route.element, children: [{ path: '/', element: <p>Protected route</p> }] }
    : route);
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(
    <SessionProvider session={session} startupStatus={startupStatus}>
      <RouterProvider router={router} />
    </SessionProvider>,
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  privateRuntime.databaseOpen.mockClear();
  privateRuntime.shapeSubscribe.mockClear();
});

describe('public authentication route composition', () => {
  it('renders login and recovery navigation for an anonymous startup without a private graph', () => {
    renderRoute('/login', 'none');

    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Recover access' })).toBeTruthy();
    expect(screen.getByText('No active session was found.')).toBeTruthy();
    expect(privateRuntime.databaseOpen).not.toHaveBeenCalled();
    expect(privateRuntime.shapeSubscribe).not.toHaveBeenCalled();
  });

  it('distinguishes an unavailable session service and keeps recovery public', () => {
    renderRoute('/recovery', 'unreachable');

    expect(screen.getByRole('heading', { name: 'Recover access' })).toBeTruthy();
    expect(screen.getByText('Sign-in service unavailable')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeTruthy();
    expect(privateRuntime.databaseOpen).not.toHaveBeenCalled();
    expect(privateRuntime.shapeSubscribe).not.toHaveBeenCalled();
  });

  it('mounts one private database owner only after an authenticated startup', async () => {
    renderRoute('/', 'authenticated', SESSION);

    expect(await screen.findByText('Private runtime mounted')).toBeTruthy();
    expect(privateRuntime.databaseOpen).toHaveBeenCalledOnce();
    expect(privateRuntime.shapeSubscribe).toHaveBeenCalledOnce();
  });

  it('blocks a passive authenticated cookie when another tab left logout pending', () => {
    localStorage.setItem('aso:logout-pending:v1', JSON.stringify({
      schemaVersion: 1,
      generation: 'generation-1',
      createdAt: '2026-09-15T09:00:00.000Z',
    }));

    renderRoute('/login', 'authenticated', SESSION);

    expect(screen.getByText('Server sign-out pending')).toBeTruthy();
    expect(screen.getByText(
      'Server sign-out is still pending. Access remains locked while recovery continues.',
    )).toBeTruthy();
    expect(privateRuntime.databaseOpen).not.toHaveBeenCalled();
    expect(privateRuntime.shapeSubscribe).not.toHaveBeenCalled();
  });
});
