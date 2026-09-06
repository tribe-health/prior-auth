/**
 * A development session, until Kratos is wired.
 *
 * ## Why this file exists
 *
 * `main.tsx` previously passed `session={null}`, which was correct as a
 * fail-closed default and wrong as a shipped state: `GraphProvider` renders its
 * fallback when there is no session, so the entire application rendered a
 * permanent "Loading…" and nothing else. Every screen, every route and the
 * whole component library were unreachable. Observed in a browser 2026-09-06.
 *
 * ## Why this is not a security hole
 *
 * This grants nothing. ADR-002 checks clinical authority at three independent
 * layers — gateway policy, the `AppServices` capability check, and a Postgres
 * trigger — and none of them consults the browser. A client-side capability
 * list decides what the interface OFFERS, never what the server PERMITS. A
 * forged session here reaches a server that refuses it; the schema checks
 * prove that refusal (`schema-checks.sql` T1, T4, T9).
 *
 * ## Why it cannot reach production
 *
 * `import.meta.env.DEV` is statically replaced by Vite at build time, so the
 * production bundle evaluates `false` and tree-shakes this away. It is not a
 * runtime flag someone can flip. `assertNoDevSessionInProduction()` is the
 * belt to that braces — call it once at startup so a build that somehow keeps
 * this path fails loudly rather than silently authenticating everyone.
 */
import type { VerifiedSession } from "@/shared/model/session";

/**
 * The practice a dev session belongs to.
 *
 * Any UUID works because the value only scopes the local store and the Electric
 * shape `where`. A real practice row is not required for the interface to
 * render; if the tenant does not exist the sync returns zero rows, which is the
 * correct fail-closed behaviour and is visible as an empty queue rather than
 * someone else's data.
 */
export const DEV_PRACTICE_ID = "aaaa0000-0000-0000-0000-00000000000a";

/**
 * A surgeon, because that is the role that exercises the most of the interface.
 *
 * Deliberately NOT holding `configure`: the admin console must stay hidden, so
 * the capability-gated navigation is exercised rather than bypassed. Swap the
 * capability list to check a coordinator's view.
 */
export const DEV_SESSION: VerifiedSession = {
  identityId: "11111111-1111-1111-1111-111111111111",
  userId: "aaaa1111-0000-0000-0000-000000000001",
  practiceId: DEV_PRACTICE_ID,
  displayName: "Dr. Rivera (dev)",
  capabilities: ["affirm_gate", "sign_letter", "annotate", "submit", "view_audit"],
  principal: "user",
};

/** The dev session in development, `null` in a production build. */
export function resolveStartupSession(): VerifiedSession | null {
  return import.meta.env.DEV ? DEV_SESSION : null;
}

/**
 * Fail loudly if a production build ever carries a dev session.
 *
 * A silent fallback here would mean shipping an application that authenticates
 * everyone as a surgeon. Throwing at startup is the correct failure.
 */
export function assertNoDevSessionInProduction(
  session: VerifiedSession | null,
): void {
  if (!import.meta.env.DEV && session === DEV_SESSION) {
    throw new Error(
      "DEV_SESSION reached a production build. Refusing to start: this would " +
        "present every visitor as a clinician. Wire @ory/kratos-client-fetch.",
    );
  }
}
