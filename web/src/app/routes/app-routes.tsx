import { createBrowserRouter } from 'react-router';

import { AppShell, ShellErrorBoundary } from '@/app/shell/app-shell';

// Route files are kebab-case, matching every other filename in this app.
// Screens map one-to-one onto docs/design/prototype/screens/.
//
// Every route is a child of AppShell, so navigation, gating and the error
// boundary wrap the whole application rather than each screen re-implementing
// them. The paths themselves are unchanged — they already matched the pipeline
// in docs/design/prototype/assets/shell.js.

export const appRoutes = createBrowserRouter([
  {
    element: <AppShell />,
    ErrorBoundary: ShellErrorBoundary,
    children: [
      { path: '/', lazy: () => import('./case-queue-route') },
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
]);
