import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { TooltipProvider } from "@/components/ui/tooltip"
import { SessionProvider } from './app/providers/session-provider';
import { useStartupSession } from './features/session/hooks/use-startup-session';
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
//     Router          public routes or the protected runtime boundary
//       GraphProvider scopes private storage only after authentication
//
// A graph mounted before the practice is known would sync the wrong tenant.
// Public account routes remain outside that boundary and never wait for SQL.
function Bootstrap() {
  const { status, session } = useStartupSession();
  return (
    <SessionProvider session={session} startupStatus={status}>
      <RouterProvider router={appRoutes} />
    </SessionProvider>
  );
}

createRoot(rootElement).render(
  <StrictMode>
    <TooltipProvider>
      <Bootstrap />
    </TooltipProvider>
  </StrictMode>,
);
