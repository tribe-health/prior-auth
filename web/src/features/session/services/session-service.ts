import { sessionApi, type SessionLogoutBody } from '@/features/session/api/session-api';
import { parseVerifiedSession } from '@/features/session/model/session-parse';
import type { StartupSession } from '@/features/session/model/startup-session';
import { ApiError, type HttpExchange } from '@/shared/api/http-client';

interface SessionApiPort {
  current(practiceId?: string): Promise<unknown>;
  logout(): Promise<HttpExchange<SessionLogoutBody>>;
}

export type SessionLogoutResult = 'confirmed' | 'denied-pending' | 'unavailable';

export interface SessionService {
  revalidate(practiceId?: string): Promise<StartupSession>;
  logout(): Promise<SessionLogoutResult>;
}

function logoutError(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const error = (value as Record<string, unknown>).error;
  return typeof error === 'string' ? error : null;
}

export function createSessionService(api: SessionApiPort = sessionApi): SessionService {
  return {
    async revalidate(practiceId) {
      try {
        const session = parseVerifiedSession(await api.current(practiceId));
        return session
          ? { status: 'authenticated', session }
          : { status: 'unreachable', session: null };
      } catch (cause) {
        if (cause instanceof ApiError && (cause.status === 401 || cause.status === 403)) {
          return { status: 'none', session: null };
        }
        return { status: 'unreachable', session: null };
      }
    },
    async logout() {
      try {
        const response = await api.logout();
        if (response.status === 204 && response.ok && response.body === null) return 'confirmed';
        if (response.status === 503 && logoutError(response.body) === 'logout_incomplete') {
          return 'denied-pending';
        }
        return 'unavailable';
      } catch {
        return 'unavailable';
      }
    },
  };
}

export const sessionService = createSessionService();
