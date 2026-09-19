/**
 * The scoped session store sits outside the graph because its verified tenant,
 * session and authorization revision determine which graph may open.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import {
  createSessionStore,
  sameVerifiedSessionScope,
  type AccessState,
  type LogoutState,
  type RuntimePhase,
  type SessionRevalidationAttempt,
  type SessionStore,
} from '@/features/session/store/session-store';
import type {
  StartupSession,
  StartupSessionStatus,
} from '@/features/session/model/startup-session';
import { sessionService, type SessionService } from '@/features/session/services/session-service';
import { memoryDraftRepository } from '@/features/drafts/services/memory-draft-repository';
import {
  createSessionHintBus,
  type SessionHintBus,
} from '@/features/session/services/session-hint-bus';
import type { Capability, VerifiedSession } from '@/shared/model/session';
import { can } from '@/shared/model/session';
import { subscribeSessionRevocation } from '@/shared/session-revocation-events';
import { quiescePrivateRuntime } from '@/shared/sync/runtime-quiescence';

const SessionStoreContext = createContext<SessionStore | null>(null);

export function SessionProvider({
  session,
  startupStatus = session ? 'authenticated' : 'none',
  service = sessionService,
  hintBus,
  quiesce = quiescePrivateRuntime,
  children,
}: {
  session: VerifiedSession | null;
  startupStatus?: StartupSessionStatus;
  service?: SessionService;
  hintBus?: SessionHintBus;
  quiesce?: () => Promise<void>;
  children: ReactNode;
}) {
  const storeRef = useRef<SessionStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = createSessionStore(
      session,
      service,
      startupStatus,
      undefined,
      memoryDraftRepository,
    );
  }
  const store = storeRef.current;
  const activeHintBus = useRef<SessionHintBus | null>(hintBus ?? null);
  const revalidation = useRef<Promise<void> | null>(null);

  const settleRevalidation = useCallback((
    attempt: SessionRevalidationAttempt,
    result: Promise<StartupSession>,
  ) => {
    const running = (async () => {
      let draining: Promise<void>;
      try {
        draining = Promise.resolve(quiesce());
      } catch (error) {
        draining = Promise.reject(error);
      }
      let authoritative: StartupSession;
      try {
        authoritative = await result;
      } catch {
        authoritative = { status: 'unreachable', session: null };
      }
      try {
        await draining;
      } catch {
        store.getState().failRevalidation(
          attempt,
          'The prior local runtime could not close. Protected case screens remain closed.',
        );
        return;
      }
      store.getState().completeRevalidation(attempt, authoritative);
    })().finally(() => {
      if (revalidation.current === running) revalidation.current = null;
    });
    revalidation.current = running;
    return running;
  }, [quiesce, store]);

  const revalidate = useCallback(() => {
    if (revalidation.current) return revalidation.current;
    const attempt = store.getState().beginRevalidation();
    if (!attempt) return Promise.resolve();
    return settleRevalidation(
      attempt,
      service.revalidate(attempt.practiceId),
    );
  }, [service, settleRevalidation, store]);

  useLayoutEffect(() => {
    const result = { status: startupStatus, session };
    const current = store.getState().session;
    const scopeChanged = current && (
      startupStatus !== 'authenticated'
      || !sameVerifiedSessionScope(current, session)
    );
    if (!scopeChanged) {
      store.getState().installStartupSession(result);
      return;
    }

    const attempt = store.getState().beginRevalidation('Account or practice access changed. Verifying…');
    if (!attempt) return;
    activeHintBus.current?.publish('scope-change');
    void settleRevalidation(attempt, Promise.resolve(result));
  }, [session, settleRevalidation, startupStatus, store]);

  useEffect(() => {
    const bus = hintBus ?? createSessionHintBus();
    const ownsBus = hintBus === undefined;
    activeHintBus.current = bus;
    const unsubscribe = bus.subscribe(() => void revalidate());
    const onPageShow = () => void revalidate();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void revalidate();
    };
    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      unsubscribe();
      if (ownsBus) bus.close();
      if (activeHintBus.current === bus) activeHintBus.current = null;
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [hintBus, revalidate]);

  useEffect(() => store.subscribe((state, previous) => {
    if (state.logoutState === 'submitting' && previous.logoutState !== 'submitting') {
      activeHintBus.current?.publish('access-change');
    }
  }), [store]);

  useEffect(
    () => subscribeSessionRevocation((reason) => {
      const active = store.getState().session !== null;
      store.getState().observeRevocation(reason);
      if (active) activeHintBus.current?.publish('access-change');
    }),
    [store],
  );

  useEffect(() => {
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleExpiryFence = () => {
      if (expiryTimer) clearTimeout(expiryTimer);
      expiryTimer = undefined;
      const current = store.getState().session;
      if (!current) return;
      const remainingMs = Date.parse(current.expiresAt) - Date.now();
      if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
        const active = store.getState().session !== null;
        store.getState().observeSessionExpiry();
        if (active && !store.getState().session) {
          activeHintBus.current?.publish('access-change');
        }
        return;
      }
      expiryTimer = setTimeout(() => {
        const active = store.getState().session !== null;
        store.getState().observeSessionExpiry();
        if (active && !store.getState().session) {
          activeHintBus.current?.publish('access-change');
        }
        scheduleExpiryFence();
      }, Math.min(remainingMs, 2_147_483_647));
    };
    const unsubscribe = store.subscribe(scheduleExpiryFence);
    scheduleExpiryFence();
    return () => {
      if (expiryTimer) clearTimeout(expiryTimer);
      unsubscribe();
    };
  }, [store]);

  return <SessionStoreContext value={store}>{children}</SessionStoreContext>;
}

function useSessionStore<T>(selector: (state: ReturnType<SessionStore['getState']>) => T): T {
  const store = useContext(SessionStoreContext);
  if (!store) throw new Error('Session state was read outside SessionProvider.');
  return useStore(store, selector);
}

export function useSession(): VerifiedSession | null {
  return useSessionStore((state) => state.session);
}

/**
 * Owns the synchronous React boundary between a verified session and protected
 * application content. The render function receives the epoch used to key
 * session-scoped runtimes; when the store fences access, protected children
 * leave the tree in the same Zustand publication.
 */
export function SessionAccessBoundary({ children, fallback }: {
  children: (session: VerifiedSession, epoch: number) => ReactNode;
  fallback: ReactNode;
}) {
  const session = useSession();
  const epoch = useSessionEpoch();
  return session ? children(session, epoch) : fallback;
}

export function useRequiredSession(): VerifiedSession {
  const session = useSession();
  if (!session) throw new Error('useRequiredSession called outside an authenticated route.');
  return session;
}

export function useCan(capability: Capability): boolean {
  return can(useSession(), capability);
}

export function useSessionEpoch(): number {
  return useSessionStore((state) => state.epoch);
}

export function useRuntimePhase(): RuntimePhase {
  return useSessionStore((state) => state.runtimePhase);
}

export function useRuntimeActions(): {
  transitionRuntimePhase: (phase: RuntimePhase, expectedEpoch: number) => void;
} {
  return useSessionStore(useShallow((state) => ({
    transitionRuntimePhase: state.transitionRuntimePhase,
  })));
}

export function useAccessState(): {
  accessState: AccessState;
  logoutState: LogoutState;
  logoutPending: boolean;
  draftNotice: string | null;
  notice: string | null;
} {
  return useSessionStore(useShallow((state) => ({
    accessState: state.accessState,
    logoutState: state.logoutState,
    logoutPending: state.logoutPending,
    draftNotice: state.draftNotice,
    notice: state.notice,
  })));
}

export function useSessionActions(): {
  logout: () => Promise<void>;
  retryLogout: () => Promise<void>;
} {
  return useSessionStore(useShallow((state) => ({
    logout: state.logout,
    retryLogout: state.retryLogout,
  })));
}
