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
import { AccessStateNotice } from '@/features/session/components/access-state-notice';
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
    <SessionAccessBoundary fallback={<Navigate to="/login" replace />}>
      {(session, epoch) => (
        <GraphProvider
          key={`${session.sessionId}:${session.authorizationRevision}:${epoch}`}
          fallback={<ShellLoading />}
          onError={() => <AccessStateNotice />}
        >
          <PrivateRuntimeOutlet />
        </GraphProvider>
      )}
    </SessionAccessBoundary>
  );
}

function StartupRedirect() {
  const session = useSession();
  return <Navigate to={session ? '/' : '/login'} replace />;
}

export const appRouteObjects: RouteObject[] = [
  {
    element: <PublicRouteBoundary />,
    children: [
      { path: '/login', element: <PublicAuthRoute mode="login" /> },
      { path: '/recovery', element: <PublicAuthRoute mode="recovery" /> },
    ],
  },
  {
    element: <ProtectedRouteBoundary />,
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
