import { createStore } from 'zustand/vanilla';

import type { SessionService } from '@/features/session/services/session-service';
import { sessionService } from '@/features/session/services/session-service';
import {
  browserLogoutPendingControl,
  type LogoutControlRead,
  type LogoutPendingControl,
} from '@/features/session/services/logout-pending-control';
import { clearRuntimeCommandsForSession } from '@/shared/runtime-command-registry';
import type { VerifiedSession } from '@/shared/model/session';
import type {
  StartupSession,
  StartupSessionStatus,
} from '@/features/session/model/startup-session';

export type AccessState = 'authenticated' | 'signed-out' | 'locally-locked';
export type LogoutState = 'idle' | 'submitting' | 'failed';
export interface PrivateWorkLifecycle {
  authorize(session: VerifiedSession, epoch: number): void;
  quarantine(): number;
}
export interface SessionRevalidationAttempt {
  readonly epoch: number;
  readonly identityId: string;
  readonly sessionId: string;
  readonly practiceId: string;
  readonly authorizationRevision: string;
}
export type RuntimePhase =
  | 'detecting-environment'
  | 'checking-session'
  | 'anonymous'
  | 'session-unavailable'
  | 'opening-replica'
  | 'migrating'
  | 'hydrating'
  | 'catching-up'
  | 'ready'
  | 'offline-limited'
  | 'quiescing'
  | 'recovery-required';

const RUNTIME_TRANSITIONS: Readonly<Record<RuntimePhase, readonly RuntimePhase[]>> = {
  'detecting-environment': ['checking-session'],
  'checking-session': ['anonymous', 'session-unavailable', 'opening-replica'],
  'anonymous': ['checking-session', 'opening-replica'],
  'session-unavailable': ['checking-session', 'opening-replica'],
  'opening-replica': ['migrating', 'quiescing', 'recovery-required'],
  'migrating': ['hydrating', 'quiescing', 'recovery-required'],
  'hydrating': ['catching-up', 'offline-limited', 'quiescing', 'recovery-required'],
  'catching-up': ['ready', 'offline-limited', 'quiescing', 'recovery-required'],
  'ready': ['offline-limited', 'quiescing'],
  'offline-limited': ['catching-up', 'ready', 'quiescing'],
  'quiescing': ['anonymous', 'checking-session', 'opening-replica'],
  'recovery-required': ['opening-replica', 'quiescing'],
};

export interface SessionState {
  readonly session: VerifiedSession | null;
  readonly epoch: number;
  readonly accessState: AccessState;
  readonly logoutState: LogoutState;
  readonly logoutPending: boolean;
  readonly draftNotice: string | null;
  readonly notice: string | null;
  readonly runtimePhase: RuntimePhase;
  beginRevalidation(notice?: string): SessionRevalidationAttempt | null;
  completeRevalidation(
    attempt: SessionRevalidationAttempt,
    result: StartupSession,
  ): boolean;
  failRevalidation(attempt: SessionRevalidationAttempt, notice: string): boolean;
  installStartupSession(result: StartupSession): void;
  installVerifiedSession(session: VerifiedSession | null): void;
  transitionRuntimePhase(phase: RuntimePhase, expectedEpoch: number): void;
  observeSessionExpiry(nowMs?: number): void;
  observeRevocation(reason: string): void;
  logout(): Promise<void>;
  retryLogout(): Promise<void>;
}

export type SessionStore = ReturnType<typeof createSessionStore>;

export function sameVerifiedSessionScope(
  left: VerifiedSession | null,
  right: VerifiedSession | null,
): boolean {
  return left?.identityId === right?.identityId
    && left?.sessionId === right?.sessionId
    && left?.practiceId === right?.practiceId
    && left?.authorizationRevision === right?.authorizationRevision
    && left?.principal === right?.principal;
}

export function createSessionStore(
  initialSession: VerifiedSession | null,
  service: Pick<SessionService, 'logout'> = sessionService,
  initialStartupStatus: StartupSessionStatus = initialSession ? 'authenticated' : 'none',
  logoutControl: LogoutPendingControl = browserLogoutPendingControl,
  privateWork: PrivateWorkLifecycle = {
    authorize: () => undefined,
    quarantine: () => 0,
  },
) {
  return createStore<SessionState>((set, get) => {
    // The visible session is null during verification. Keep its verified scope
    // until the attempt resolves so terminal outcomes can purge command recovery.
    let revalidationSession: VerifiedSession | null = null;
    const purgeCommands = () => {
      const sessions = new Set([get().session?.sessionId, revalidationSession?.sessionId]);
      revalidationSession = null;
      for (const sessionId of sessions) if (sessionId) clearRuntimeCommandsForSession(sessionId, 'purge');
    };
    const draftNotice = (count: number): string | null => count > 0
      ? `${count} unsent ${count === 1 ? 'draft is' : 'drafts are'} stored only in this open application and will be lost if it closes or reloads.`
      : null;
    const logoutLock = (control: LogoutControlRead, forcePending = false) => ({
      session: null,
      accessState: 'locally-locked' as const,
      logoutState: 'failed' as const,
      logoutPending: forcePending || control.status === 'pending',
      notice: forcePending || control.status === 'pending'
        ? 'Server sign-out is still pending. Access remains locked while recovery continues.'
        : 'Logout control storage is unavailable. Cross-reload locking cannot be verified; complete server sign-out while online.',
      runtimePhase: 'session-unavailable' as const,
    });
    const initialControl = logoutControl.read();
    const startsLocked = initialControl.status !== 'clear'
      || initialStartupStatus === 'logout-pending'
      || initialStartupStatus === 'logout-storage-unavailable';
    const initialDraftNotice = startsLocked ? draftNotice(privateWork.quarantine()) : null;
    if (!startsLocked && initialSession) privateWork.authorize(initialSession, 0);

    const fence = (accessState: AccessState, notice: string | null) => {
      purgeCommands();
      const retainedDrafts = privateWork.quarantine();
      set((state) => ({
        session: null,
        epoch: state.epoch + 1,
        accessState,
        notice,
        draftNotice: draftNotice(retainedDrafts),
        runtimePhase: 'quiescing',
      }));
    };

    const installSession = (session: VerifiedSession) => {
      const control = logoutControl.read();
      if (control.status !== 'clear') {
        purgeCommands();
        set(logoutLock(control));
        return;
      }
      const current = get().session;
      if (sameVerifiedSessionScope(current, session)) {
        privateWork.authorize(session, get().epoch);
        set({
          session,
          accessState: 'authenticated',
          logoutState: 'idle',
          logoutPending: false,
          notice: null,
        });
        return;
      }
      if (current || (revalidationSession && !sameVerifiedSessionScope(revalidationSession, session))) purgeCommands();
      revalidationSession = null;
      const nextEpoch = get().epoch + 1;
      privateWork.authorize(session, nextEpoch);
      set({
        session,
        epoch: nextEpoch,
        accessState: 'authenticated',
        logoutState: 'idle',
        logoutPending: false,
        draftNotice: null,
        notice: null,
        runtimePhase: 'opening-replica',
      });
    };

    const completeLogout = async () => {
      purgeCommands();
      const control = logoutControl.ensurePending();
      set({
        logoutState: 'submitting',
        logoutPending: control.status === 'pending',
      });
      let result: Awaited<ReturnType<SessionService['logout']>>;
      try {
        result = await service.logout();
      } catch {
        result = 'unavailable';
      }
      if (result === 'confirmed') {
        const cleared = control.status === 'pending'
          ? logoutControl.clear(control.marker.generation)
          : 'cleared';
        if (cleared === 'cleared') {
          set({
            accessState: 'signed-out',
            logoutState: 'idle',
            logoutPending: false,
            notice: 'You are signed out.',
            runtimePhase: 'anonymous',
          });
          return;
        }
        set({
          accessState: 'locally-locked',
          logoutState: 'failed',
          logoutPending: true,
          notice: cleared === 'superseded'
            ? 'A newer server sign-out is pending. Access remains locked.'
            : 'Server sign-out was confirmed, but the local logout marker could not be cleared.',
        });
        return;
      }
      set({
        accessState: 'locally-locked',
        logoutState: 'failed',
        logoutPending: control.status === 'pending',
        notice: control.status === 'unavailable'
          ? 'Access is locked in this tab. Cross-reload locking could not be saved; retry server sign-out while online.'
          : result === 'denied-pending'
            ? 'Access is locked on this device. Server sign-out is pending while recovery continues.'
            : 'Access is locked on this device. Server sign-out could not be confirmed.',
      });
    };

    return {
      session: startsLocked ? null : initialSession,
      epoch: 0,
      accessState: startsLocked ? 'locally-locked' : initialSession ? 'authenticated' : 'signed-out',
      logoutState: startsLocked ? 'failed' : 'idle',
      logoutPending: initialControl.status === 'pending' || initialStartupStatus === 'logout-pending',
      draftNotice: initialDraftNotice,
      notice: startsLocked
        ? logoutLock(initialControl, initialStartupStatus === 'logout-pending').notice
        : initialSession ? null : 'Sign in to continue.',
      runtimePhase: startsLocked
        ? 'session-unavailable'
        : initialSession
        ? 'opening-replica'
        : initialStartupStatus === 'loading'
          ? 'checking-session'
          : initialStartupStatus === 'unreachable'
            ? 'session-unavailable'
            : 'anonymous',
      beginRevalidation(notice = 'Verifying access…') {
        const state = get();
        const current = state.session;
        if (!current) return null;
        revalidationSession = current;
        clearRuntimeCommandsForSession(current.sessionId, 'revalidation');
        const retainedDrafts = privateWork.quarantine();
        const attempt: SessionRevalidationAttempt = {
          epoch: state.epoch + 1,
          identityId: current.identityId,
          sessionId: current.sessionId,
          practiceId: current.practiceId,
          authorizationRevision: current.authorizationRevision,
        };
        set({
          session: null,
          epoch: attempt.epoch,
          accessState: 'locally-locked',
          notice,
          draftNotice: draftNotice(retainedDrafts),
          runtimePhase: 'quiescing',
        });
        return attempt;
      },
      completeRevalidation(attempt, result) {
        const state = get();
        if (state.epoch !== attempt.epoch || state.session || !revalidationSession) return false;
        const control = logoutControl.read();
        if (control.status !== 'clear') {
          purgeCommands();
          set(logoutLock(control));
          return true;
        }
        if (result.status !== 'authenticated' || !sameVerifiedSessionScope(revalidationSession, result.session)) purgeCommands();
        revalidationSession = null;
        if (result.status === 'authenticated' && result.session) {
          privateWork.authorize(result.session, attempt.epoch);
          set({
            session: result.session,
            accessState: 'authenticated',
            logoutState: 'idle',
            logoutPending: false,
            draftNotice: null,
            notice: null,
            runtimePhase: 'opening-replica',
          });
        } else if (result.status === 'none') {
          set({
            accessState: 'signed-out',
            logoutState: 'idle',
            logoutPending: false,
            notice: 'Sign in to continue.',
            runtimePhase: 'anonymous',
          });
        } else {
          set({
            accessState: 'locally-locked',
            notice: 'Access could not be revalidated. Sign in or recovery remains available.',
            runtimePhase: 'session-unavailable',
          });
        }
        return true;
      },
      failRevalidation(attempt, notice) {
        const state = get();
        if (state.epoch !== attempt.epoch || state.session || !revalidationSession) return false;
        purgeCommands();
        set({
          accessState: 'locally-locked',
          notice,
          runtimePhase: 'recovery-required',
        });
        return true;
      },
      installStartupSession(result) {
        if (result.status === 'logout-pending' || result.status === 'logout-storage-unavailable') {
          purgeCommands();
          set(logoutLock(
            result.status === 'logout-pending' ? logoutControl.read() : { status: 'unavailable' },
            result.status === 'logout-pending',
          ));
          return;
        }
        if (result.status === 'loading') {
          if (!get().session) set({ runtimePhase: 'checking-session' });
          return;
        }
        if (result.status === 'authenticated' && result.session) {
          installSession(result.session);
          return;
        }
        const current = get().session;
        purgeCommands();
        const retainedDrafts = current ? privateWork.quarantine() : 0;
        set((state) => ({
          session: null,
          epoch: current ? state.epoch + 1 : state.epoch,
          accessState: 'signed-out',
          logoutState: 'idle',
          logoutPending: false,
          draftNotice: draftNotice(retainedDrafts),
          notice: result.status === 'unreachable'
            ? 'The sign-in service is unavailable. You can still open sign-in or recovery.'
            : 'Sign in to continue.',
          runtimePhase: result.status === 'unreachable'
            ? 'session-unavailable'
            : 'anonymous',
        }));
      },
      installVerifiedSession(session) {
        const current = get().session;
        if (!session) {
          if (current || revalidationSession) fence('signed-out', 'Sign in to continue.');
          return;
        }
        installSession(session);
      },
      transitionRuntimePhase(runtimePhase, expectedEpoch) {
        const state = get();
        if (!state.session || state.epoch !== expectedEpoch) return;
        if (!RUNTIME_TRANSITIONS[state.runtimePhase].includes(runtimePhase)) return;
        set({ runtimePhase });
      },
      observeSessionExpiry(nowMs = Date.now()) {
        const current = get().session;
        if (!current) return;
        const expiryMs = Date.parse(current.expiresAt);
        if (Number.isFinite(expiryMs) && expiryMs <= nowMs) {
          fence('locally-locked', 'Your session expired. Sign in to continue.');
        }
      },
      observeRevocation(reason) {
        if (get().accessState === 'authenticated' || revalidationSession) fence('locally-locked', reason);
      },
      async logout() {
        if (get().accessState === 'authenticated' || revalidationSession) {
          fence('locally-locked', 'Signing out…');
        }
        await completeLogout();
      },
      retryLogout: completeLogout,
    };
  });
}
