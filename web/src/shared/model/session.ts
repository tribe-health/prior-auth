/**
 * The verified session, as the client sees it.
 *
 * This is a **projection** of what the gateway already decided, never a
 * decision made here. ADR-002 checks clinical authority at three independent
 * layers — gateway policy, `AppServices` capability check, Postgres trigger —
 * and none may assume another ran. The client is not a fourth layer; it is a
 * consumer of the first one's answer.
 *
 * The practical consequence: nothing in this file grants anything. It reports.
 */

/**
 * Capability keys, exactly as seeded in `docs/design/schema/schema.sql`.
 *
 * The three marked clinical are medical acts. An administrator holds every
 * configuration power in the system and must still be unable to perform them —
 * that asymmetry is the whole point of the role model.
 */
export const CAPABILITIES = {
  /** EMR connections, users, role assignment, retention policy. */
  configure: { clinical: false },
  /** Confirm controlling policy, criterion section, pathway, operative plan. */
  affirm_gate: { clinical: true },
  /** Bind the surgeon's signature to a letter of medical necessity. */
  sign_letter: { clinical: true },
  /** Enter a clinical judgment that may be argued under attribution. */
  annotate: { clinical: true },
  /** Transmit the packet and record the receipt. */
  submit: { clinical: false },
  /** Read the immutable record of who did what. */
  view_audit: { clinical: false },
} as const;

export type Capability = keyof typeof CAPABILITIES;

/** The capabilities that are medical acts. */
export const CLINICAL_CAPABILITIES = (
  Object.keys(CAPABILITIES) as Capability[]
).filter((k) => CAPABILITIES[k].clinical);

/**
 * Who is acting.
 *
 * ADR-002: *"An AI assistant acting for a surgeon is a different principal —
 * `Agent`, not `User`. A policy granting the surgeon the ability to sign grants
 * a delegated agent nothing."*
 *
 * flint-gate implements exactly this: a Kratos session maps to `User`, never
 * `Agent`, and `act` promotes only token-derived identities. The shell inherits
 * the distinction rather than re-deriving it.
 */
export type PrincipalKind = "user" | "agent";

export interface VerifiedSession {
  /** Kratos identity id. The authority on who this is. */
  readonly identityId: string;
  /** `aso.users.id` — practice membership, NPI, job title live here. */
  readonly userId: string;
  /** The practice boundary this session operates inside. */
  readonly practiceId: string;
  readonly displayName: string;
  /** What the gateway says this session may do. Never widened client-side. */
  readonly capabilities: readonly Capability[];
  readonly principal: PrincipalKind;
}

/**
 * Does this session hold a capability?
 *
 * An **agent principal holds no clinical capability**, regardless of what the
 * capability list says. That is belt-and-braces: the gateway should never issue
 * a clinical capability to an agent in the first place, and if it somehow did,
 * the three server-side layers would still refuse the action. Refusing here too
 * means the interface does not offer a door the system will not open.
 */
export function can(session: VerifiedSession | null, capability: Capability): boolean {
  if (!session) return false;
  if (session.principal === "agent" && CAPABILITIES[capability].clinical) return false;
  return session.capabilities.includes(capability);
}
