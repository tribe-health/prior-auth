import { httpClient } from '@/shared/api/http-client';
import { invokeNative, isNativeRuntime } from '@/shared/native-command-client';

export interface SessionLogoutBody {
  readonly error?: string;
  readonly [key: string]: unknown;
}

export const sessionApi = {
  /**
   * The session this browser's credential resolves to, as the server sees it.
   *
   * Returns `unknown` on purpose: the response is narrowed by
   * `parseVerifiedSession`, not asserted here. `capabilities` is `Vec<String>`
   * on the wire against a closed union in the client, so a typed return would
   * be a claim this layer cannot check.
   */
  current: (practiceId?: string) => isNativeRuntime()
    ? invokeNative<unknown>('current_session', { practiceId: practiceId ?? null })
    : httpClient.get<unknown>(
        practiceId
          ? `/api/session?practiceId=${encodeURIComponent(practiceId)}`
          : '/api/session',
      ),
  /**
   * Preserve the mounted logout result even when the server returns 503.
   * `logout_incomplete` is a domain outcome consumed by SessionService, while
   * other status/body combinations remain unavailable rather than confirmed.
   */
  logout: async () => {
    if (!isNativeRuntime()) {
      return httpClient.exchange<SessionLogoutBody>('/api/session', { method: 'DELETE' });
    }
    const result = await invokeNative<'confirmed' | 'denied_pending'>('logout');
    return result === 'confirmed'
      ? { status: 204, ok: true, body: null, redirectedTo: null }
      : {
          status: 503,
          ok: false,
          body: { error: 'logout_incomplete' },
          redirectedTo: null,
        };
  },
};
