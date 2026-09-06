/**
 * Session context.
 *
 * Holds the gateway's answer about who is acting and what they may do. It
 * makes no authorization decision — see `shared/model/session.ts` for why the
 * client is not a fourth ADR-002 layer.
 *
 * The session is deliberately the OUTERMOST provider: the entity graph needs
 * `practiceId` to scope its sync, and a graph configured before the practice
 * is known would sync the wrong tenant or none at all.
 */
import { createContext, useContext, type ReactNode } from "react";

import type { Capability, VerifiedSession } from "@/shared/model/session";
import { can } from "@/shared/model/session";

const SessionContext = createContext<VerifiedSession | null>(null);

export function SessionProvider({
  session,
  children,
}: {
  session: VerifiedSession | null;
  children: ReactNode;
}) {
  return <SessionContext value={session}>{children}</SessionContext>;
}

/** The current session, or null when unauthenticated. */
export function useSession(): VerifiedSession | null {
  return useContext(SessionContext);
}

/**
 * The session, or throw.
 *
 * For code inside the authenticated shell, where a null session is a routing
 * bug rather than a state to render. Throwing surfaces it at the boundary
 * instead of letting `undefined` propagate into a screen.
 */
export function useRequiredSession(): VerifiedSession {
  const session = useContext(SessionContext);
  if (!session) {
    throw new Error(
      "useRequiredSession called outside an authenticated route. " +
        "The shell should have redirected before rendering this.",
    );
  }
  return session;
}

/** Does the current session hold this capability? */
export function useCan(capability: Capability): boolean {
  return can(useContext(SessionContext), capability);
}
