import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { TooltipProvider } from "@/components/ui/tooltip"
import { GraphProvider } from './app/providers/graph-provider';
import { SessionProvider } from './app/providers/session-provider';
import {
  assertNoDevSessionInProduction,
  resolveStartupSession,
} from './app/providers/dev-session';
import { ShellLoading } from './app/shell/app-shell';
import { appRoutes } from './app/routes/app-routes';
// theme.css is imported from index.css so Tailwind processes its @theme block.
import './index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

// Composition order is load-bearing, outside-in:
//
//   SessionProvider   knows practiceId and what this session may do
//     GraphProvider   scopes the local store and its sync to that practice
//       Router        screens, which assume both above them
//
// A graph mounted before the practice is known would sync the wrong tenant.
//
// In development this is a stand-in session so the application is reachable;
// in a production build it is null until @ory/kratos-client-fetch is wired.
// GraphProvider renders its fallback rather than opening an unscoped store —
// failing closed, because an unscoped local store is the failure this ordering
// exists to prevent.
//
// A null session renders "Loading…" and NOTHING else. That was the shipped
// state until 2026-09-06, when opening a browser showed a blank page: every
// route and the whole component library sat behind a provider that never
// resolved. See app/providers/dev-session.ts.
const startupSession = resolveStartupSession();
assertNoDevSessionInProduction(startupSession);
createRoot(rootElement).render(
  <StrictMode>
    <TooltipProvider>
      <SessionProvider session={startupSession}>
        <GraphProvider fallback={<ShellLoading />}>
          <RouterProvider router={appRoutes} />
        </GraphProvider>
      </SessionProvider>
    </TooltipProvider>
  </StrictMode>,
);
