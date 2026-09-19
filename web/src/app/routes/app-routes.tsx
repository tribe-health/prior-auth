import {
  Navigate,
  Outlet,
  createBrowserRouter,
  type RouteObject,
} from 'react-router';

import { GraphProvider } from '@/app/providers/graph-provider';
import {
  SessionAccessBoundary,
  useRuntimePhase,
  useSession,
} from '@/app/providers/session-provider';
import { AppShell, ShellErrorBoundary, ShellLoading } from '@/app/shell/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PrivateRuntimeOutlet } from './private-runtime-outlet';
import { PublicAuthRoute } from './public-auth-route';

// Route files are kebab-case, matching every other filename in this app.
// Screens map one-to-one onto docs/design/prototype/screens/.
//
// Public account routes are siblings of the protected graph boundary. A first
// visit or an unavailable session service can therefore render account access
// without opening PGlite or starting an Electric shape subscription.

function PublicRouteBoundary() {
  const session = useSession();
  const runtimePhase = useRuntimePhase();
  if (runtimePhase === 'checking-session' || runtimePhase === 'detecting-environment') {
    return <ShellLoading />;
  }
  if (session) return <Navigate to="/" replace />;
  return <Outlet />;
}

function ProtectedRouteBoundary() {
  const runtimePhase = useRuntimePhase();
  if (runtimePhase === 'checking-session' || runtimePhase === 'detecting-environment') {
    return <ShellLoading />;
  }

  return (
    <SessionAccessBoundary fallback={<Navigate to="/welcome" replace />}>
      {(session, epoch) => (
        <GraphProvider
          key={`${session.sessionId}:${session.authorizationRevision}:${epoch}`}
          fallback={<ShellLoading />}
          onError={() => <GraphUnavailableNotice />}
        >
          <PrivateRuntimeOutlet />
        </GraphProvider>
      )}
    </SessionAccessBoundary>
  );
}

function GraphUnavailableNotice() {
  return (
    <main className="grid min-h-dvh place-items-center bg-raised p-4 sm:p-8">
      <Card className="w-full max-w-lg">
        <CardHeader><CardTitle className="font-display text-2xl">Case data paused</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <p className="text-sm leading-6 text-muted">The real-time case view lost its connection. No clinical action was applied while the view was unavailable.</p>
          <Button className="min-h-11 w-full sm:w-auto sm:justify-self-start" onClick={() => window.location.reload()}>Reconnect case data</Button>
        </CardContent>
      </Card>
    </main>
  );
}

function StartupRedirect() {
  const session = useSession();
  return <Navigate to={session ? '/' : '/welcome'} replace />;
}

export const appRouteObjects: RouteObject[] = [
  {
    element: <PublicRouteBoundary />,
    hydrateFallbackElement: <ShellLoading />,
    children: [
      { path: '/welcome', lazy: () => import('./landing-route') },
      { path: '/login', element: <PublicAuthRoute mode="login" /> },
      { path: '/recovery', element: <PublicAuthRoute mode="recovery" /> },
    ],
  },
  {
    element: <ProtectedRouteBoundary />,
    hydrateFallbackElement: <ShellLoading />,
    children: [
      {
        element: <AppShell />,
        ErrorBoundary: ShellErrorBoundary,
        children: [
          { path: '/', lazy: () => import('./case-queue-route') },
          { path: '/cases/:caseId', lazy: () => import('./case-detail-route') },
          { path: '/cases/:caseId/intake', lazy: () => import('./intake-checklist-route') },
          { path: '/cases/:caseId/evidence', lazy: () => import('./evidence-timeline-route') },
          { path: '/cases/:caseId/policy', lazy: () => import('./policy-panel-route') },
          { path: '/cases/:caseId/pathways', lazy: () => import('./pathway-comparison-route') },
          { path: '/cases/:caseId/gate', lazy: () => import('./surgeon-gate-route') },
          { path: '/cases/:caseId/letter', lazy: () => import('./letter-composer-route') },
          { path: '/cases/:caseId/packet', lazy: () => import('./submission-packet-route') },
          { path: '/cases/:caseId/receipt', lazy: () => import('./receipt-verification-route') },
          { path: '/cases/:caseId/peer-to-peer', lazy: () => import('./peer-to-peer-route') },
          { path: '/cases/:caseId/denial-response', lazy: () => import('./denial-response-route') },
          { path: '/settings/integrations', lazy: () => import('./settings-integrations-route') },
          { path: '/settings/profile', lazy: () => import('./settings-profile-route') },
          { path: '/admin', lazy: () => import('./admin-console-route') },
        ],
      },
    ],
  },
  { path: '*', element: <StartupRedirect /> },
];

export const appRoutes = createBrowserRouter(appRouteObjects);
