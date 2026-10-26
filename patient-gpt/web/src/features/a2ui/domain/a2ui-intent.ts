// TJ-ARCH-MOB-001 compliant
// A surface action, reported to the app as an intent. The surface asked; the
// app recorded the request and its decision. Nothing else happened.
import type { A2uiActionDecision } from '@prometheus-ags/a2ui-react'

/** There is no "applied": no action in this build writes a record. */
export type A2uiDecision = 'denied'

export type A2uiIntent = {
  surfaceId: string
  name: string
  sourceComponentId: string
  context: Readonly<Record<string, unknown>>
  decision: A2uiDecision
  /** The policy's denial code, kept for the audit trail. */
  code: string
  reason: string
}

/** Same sentence as the Flutter shell. */
export const DENIED_REASON = 'Not allowlisted. Reported to the app; nothing was applied.'

/**
 * Default deny. No action is allowlisted: an agent-rendered surface can ask,
 * but it cannot affirm, sign, submit, record an outcome or write any record.
 * Allowing an action later is a clinical-authority change, not a UI one, so an
 * executed decision here means the policy changed without this model.
 */
export function intentFromDecision(decision: A2uiActionDecision): A2uiIntent {
  if (decision.status !== 'denied') {
    throw new Error('An A2UI action executed, but this build allowlists none. Update the intent model first.')
  }
  const action = decision.action
  return {
    surfaceId: action?.surfaceId ?? '',
    name: action?.name ?? 'invalid action',
    sourceComponentId: action?.sourceComponentId ?? '',
    context: Object.freeze({ ...(action?.context ?? {}) }),
    decision: 'denied',
    code: decision.code,
    reason: DENIED_REASON,
  }
}
