/**
 * Narrows the `/api/session` payload to a `VerifiedSession`.
 *
 * ## Why this is a parse and not a cast
 *
 * The server serializes `SessionSummary` (aso-host/src/session.rs) with
 * `#[serde(rename_all = "camelCase")]`, so the wire field names already match
 * this client's `VerifiedSession` one for one. Two things still do not match,
 * and a cast would hide both:
 *
 *   * `capabilities: Vec<String>` server-side against a closed `Capability`
 *     union here. A capability the server grants and this client does not know
 *     would sit in the array matching nothing, so `can()` would answer `false`
 *     for a power the session actually holds — an interface that hides a door
 *     the server would open. Dropping it is the same outcome, but it says so
 *     out loud rather than pretending the string was understood.
 *
 *   * `principal` is `User | Agent | Service` server-side against
 *     `"user" | "agent"` here. `current_session` refuses a non-`User` principal
 *     with `practice_denied`, so `"service"` cannot reach a 200 today — but
 *     this parse does not assume that handler keeps its current shape.
 *
 * ## Why a malformed payload yields nothing rather than something
 *
 * A partially-built session is worse than no session. `graphStorageKey()`
 * composes principal, practice, identity and session id into the namespace a
 * replica persists under; an `undefined` in any of those still produces a
 * usable-looking string, and that string would name a namespace shared across
 * whatever else also parsed badly. Refusing the whole payload keeps the
 * fail-closed property the composition order exists to guarantee.
 */
import { CAPABILITIES, type Capability, type PrincipalKind, type VerifiedSession } from '@/shared/model/session';

const PRINCIPALS: readonly PrincipalKind[] = ['user', 'agent'];

function isCapability(value: unknown): value is Capability {
  return typeof value === 'string' && Object.hasOwn(CAPABILITIES, value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * The parsed session, or `null` when the payload cannot be trusted.
 *
 * Unknown capabilities are dropped and reported; every other malformation
 * rejects the payload entirely.
 */
export function parseVerifiedSession(payload: unknown): VerifiedSession | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const raw = payload as Record<string, unknown>;

  const required = [
    'identityId',
    'sessionId',
    'userId',
    'practiceId',
    'displayName',
    'expiresAt',
    'authorizationRevision',
  ] as const;
  for (const field of required) {
    if (!nonEmptyString(raw[field])) return null;
  }

  const principal = raw.principal;
  if (!PRINCIPALS.includes(principal as PrincipalKind)) return null;

  if (!Array.isArray(raw.capabilities)) return null;
  const capabilities = raw.capabilities.filter(isCapability);
  const dropped = raw.capabilities.length - capabilities.length;
  if (dropped > 0) {
    // Loud, because the alternative is an interface that quietly withholds a
    // power the server granted. A capability added server-side and not here is
    // a client that needs updating, not a runtime condition to absorb.
    console.warn(
      `[session] ${dropped} capability value(s) from /api/session are not known ` +
        `to this client and were ignored. Update CAPABILITIES in shared/model/session.ts.`,
    );
  }

  // An expiry that does not parse would make the provider's expiry fence
  // compare against NaN, which is never <= now — a session that never expires
  // locally. Refuse it instead.
  if (!Number.isFinite(Date.parse(raw.expiresAt as string))) return null;

  return {
    identityId: raw.identityId as string,
    sessionId: raw.sessionId as string,
    userId: raw.userId as string,
    practiceId: raw.practiceId as string,
    displayName: raw.displayName as string,
    capabilities,
    principal: principal as PrincipalKind,
    expiresAt: raw.expiresAt as string,
    authorizationRevision: raw.authorizationRevision as string,
  };
}
