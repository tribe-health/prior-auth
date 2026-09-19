/**
 * The ten-step case pipeline.
 *
 * Transcribed from `docs/design/prototype/assets/shell.js:377-390`, which is
 * the navigation contract — not a mockup. The step numbers are part of it:
 * coordinators refer to a case by where it sits in the pipeline, so `03` is
 * how "evidence timeline" is said out loud.
 *
 * Steps 07–10 carry `gated: true` in the prototype. The gate is the surgeon
 * gate, and ADR-005 says what that means here: the shell evaluates it against
 * the **verified session's capabilities**, never a component flag.
 */
import type { Capability } from "@/shared/model/session";

export interface PipelineStep {
  readonly id: string;
  /** Two-digit step number. Part of the contract, not decoration. */
  readonly index: string;
  readonly label: string;
  /** Route path relative to a case, or null for the queue itself. */
  readonly path: string | null;
  /**
   * The capability required to reach this step, or null if ungated.
   *
   * `affirm_gate` on steps 07–10 is not "you may affirm the gate" — it is the
   * marker that this step lies past the surgeon gate. Whether the gate has
   * been affirmed *for this case* is case state; whether this session could
   * affirm it at all is capability. Both must hold, and `isStepReachable`
   * takes both.
   */
  readonly requires: Capability | null;
}

export const CASE_PIPELINE: readonly PipelineStep[] = [
  { id: "dashboard", index: "01", label: "Case dashboard",     path: null,             requires: null },
  { id: "intake",    index: "02", label: "Intake checklist",   path: "intake",         requires: null },
  { id: "evidence",  index: "03", label: "Evidence timeline",  path: "evidence",       requires: null },
  { id: "policy",    index: "04", label: "Policy panel",       path: "policy",         requires: null },
  { id: "pathway",   index: "05", label: "Pathway comparison", path: "pathways",       requires: null },
  { id: "gate",      index: "06", label: "Surgeon gate",       path: "gate",           requires: null },
  { id: "letter",    index: "07", label: "Letter & QA",        path: "letter",         requires: "affirm_gate" },
  { id: "packet",    index: "08", label: "Submission packet",  path: "packet",         requires: "affirm_gate" },
  { id: "receipt",   index: "09", label: "Receipt & custody",  path: "receipt",        requires: "affirm_gate" },
  { id: "p2p",       index: "10", label: "Peer-to-peer",       path: "peer-to-peer",   requires: "affirm_gate" },
] as const;

/**
 * Global navigation.
 *
 * `shell.js:511-514`, including its comment: role controls what a user sees,
 * so nobody is shown *"a door they cannot open."* That is the rule this whole
 * module implements.
 */
export interface GlobalNavItem {
  readonly id: string;
  readonly label: string;
  readonly path: string;
  readonly requires: Capability | null;
}

export const GLOBAL_NAV: readonly GlobalNavItem[] = [
  { id: "cases",    label: "Cases",    path: "/",                      requires: null },
  { id: "settings", label: "Settings", path: "/settings/integrations", requires: null },
  { id: "admin",    label: "Admin",    path: "/admin",                 requires: "configure" },
] as const;

/** Why a step is unavailable. Rendered to the user, so it is prose. */
export type StepBlockReason =
  | { kind: "reachable" }
  | { kind: "awaiting-gate"; message: string }
  | { kind: "gate-pending"; message: string }
  | { kind: "case-unavailable"; message: string };

export type CaseGateStatus = 'pending' | 'unavailable' | 'not-affirmed' | 'affirmed';
// A `no-capability` variant was declared here and never constructed:
// `isStepReachable` takes no session and cannot produce it. A type permitting
// a state the function cannot return invites a caller to assume capability
// gating happens here and omit it at the call site. Capability gating for the
// admin console lives in GLOBAL_NAV and is applied in app-shell.tsx.

/**
 * Can this session reach this step, for this case?
 *
 * This function answers ONE question: is the surgeon gate affirmed for this
 * case? It takes no session and performs no capability check.
 *
 * That separation is deliberate. A coordinator with no clinical capability may
 * still *view* a letter on an affirmed case — they do the drafting — so gating
 * the letter screen on "can this user affirm" would hide it from exactly the
 * person who needs it.
 *
 * Capability gating is a separate concern applied to GLOBAL_NAV in
 * app-shell.tsx, where `configure` hides the admin console.
 */
export function isStepReachable(
  step: PipelineStep,
  opts: { gateStatus: CaseGateStatus },
): StepBlockReason {
  if (step.requires !== "affirm_gate") return { kind: "reachable" };
  if (opts.gateStatus === 'pending') {
    return {
      kind: 'gate-pending',
      message: 'Surgeon gate status is still synchronizing.',
    };
  }
  if (opts.gateStatus === 'unavailable') {
    return {
      kind: 'case-unavailable',
      message: 'This case is not available in the current authorized data.',
    };
  }
  if (opts.gateStatus === 'not-affirmed') {
    return {
      kind: "awaiting-gate",
      // Specific about consequence, per the brand voice: say what is missing,
      // do not editorialize.
      message: "Awaiting surgeon affirmation. Step 06 must be completed first.",
    };
  }
  return { kind: "reachable" };
}
