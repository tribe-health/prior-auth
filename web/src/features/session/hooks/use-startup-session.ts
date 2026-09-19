/**
 * Resolves the session the application starts with, by asking the server.
 *
 * ## What this replaces
 *
 * `main.tsx` previously called `resolveStartupSession()`, which returned a
 * hardcoded surgeon in development and `null` in production. That made every
 * production build render a permanent "Signed out" notice: `GraphProvider`
 * never opened, so the replica runtime, the shape transport and every screen
 * behind them were unreachable. The dev session made the failure invisible to
 * anyone running `vite dev`.
 *
 * ## 401 is an answer, not a failure
 *
 * An unauthenticated startup is the normal first visit. `httpClient` throws on
 * a 401 and publishes a session-revocation notice, which is right for a request
 * made *during* a session and wrong here — it would greet a first-time visitor
 * with "Your session has ended". So 401 and 403 resolve to `none` and the
 * notice is suppressed by never entering an authenticated state to begin with.
 *
 * A transport failure is different: the server was not reached, so nothing is
 * known. That is `unreachable`. It never installs a development identity,
 * because doing so would open a private replica while authentication is
 * unavailable.
 */
import { useEffect, useState } from 'react';

import { ApiError } from '@/shared/api/http-client';
import { sessionApi } from '@/features/session/api/session-api';
import { parseVerifiedSession } from '@/features/session/model/session-parse';
import type { StartupSession } from '@/features/session/model/startup-session';
import {
  browserLogoutPendingControl,
  type LogoutPendingControl,
} from '@/features/session/services/logout-pending-control';
import {
  sessionService,
  type SessionService,
} from '@/features/session/services/session-service';

const LOADING: StartupSession = { status: 'loading', session: null };
const NONE: StartupSession = { status: 'none', session: null };

/**
 * Ask the server who this is, once, at startup.
 *
 * Deliberately not a retry loop. A failed startup fetch leaves the shell
 * showing why, and a reload is the retry — a background retry would flip the
 * interface from "signed out" to "signed in" under a reader who had already
 * been told they were not.
 */
export function useStartupSession(
  logoutControl: LogoutPendingControl = browserLogoutPendingControl,
  logoutService: Pick<SessionService, 'logout'> = sessionService,
): StartupSession {
  const [controlAtStart] = useState(() => logoutControl.read());
  const [state, setState] = useState<StartupSession>(() => {
    if (controlAtStart.status === 'pending') {
      return { status: 'logout-pending', session: null };
    }
    if (controlAtStart.status === 'unavailable') {
      return { status: 'logout-storage-unavailable', session: null };
    }
    return LOADING;
  });

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (controlAtStart.status === 'pending') {
        const result = await logoutService.logout();
        if (cancelled) return;
        if (
          result === 'confirmed'
          && logoutControl.clear(controlAtStart.marker.generation) === 'cleared'
        ) {
          setState(NONE);
        }
        return;
      }
      if (controlAtStart.status === 'unavailable') return;
      try {
        const payload = await sessionApi.current();
        if (cancelled) return;
        const session = parseVerifiedSession(payload);
        if (!session) {
          // A 200 this client cannot parse is a contract mismatch, not an
          // anonymous visitor. Say so rather than reporting "signed out",
          // which would send someone to re-authenticate for no reason.
          console.error('[session] /api/session returned a payload this client cannot use.');
          setState({ status: 'unreachable', session: null });
          return;
        }
        setState({ status: 'authenticated', session });
      } catch (cause) {
        if (cancelled) return;
        if (cause instanceof ApiError && (cause.status === 401 || cause.status === 403)) {
          setState(NONE);
          return;
        }
        console.error('[session] could not reach the session endpoint', cause);
        setState({ status: 'unreachable', session: null });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [controlAtStart, logoutControl, logoutService]);

  return state;
}
