// TJ-ARCH-MOB-001 compliant
// One A2UI runtime for the app: the PatientGPT catalog and a deny-all action
// policy. Every surface action reaches the policy, is denied, and is recorded
// as an intent in the transient store. Nothing is applied to a record or the
// entity graph; no action rule exists to apply it.
import {
  createDenyAllA2uiActionPolicy,
  createPrometheusA2uiRuntime,
  PrometheusA2uiError,
  type PrometheusA2uiRuntime,
} from '@prometheus-ags/a2ui-react'
import { useA2uiStore } from '../data/a2ui-store'
import { PATIENT_GPT_COMPONENT_SET, SURFACE_REJECTED_TEXT } from '../domain/a2ui-contract'
import { intentFromDecision } from '../domain/a2ui-intent'
import { quarantineUnknownComponents } from '../domain/quarantine-components'
import { createPatientGptCatalog } from './catalog/patient-gpt-catalog'

let runtime: PrometheusA2uiRuntime | null = null

function a2uiRuntime(): PrometheusA2uiRuntime {
  runtime ??= createPrometheusA2uiRuntime({
    catalogs: [createPatientGptCatalog()],
    actionPolicy: createDenyAllA2uiActionPolicy(),
    onActionDecision: (decision) => useA2uiStore.getState().report(intentFromDecision(decision)),
  })
  return runtime
}

export function useA2uiRuntime(): PrometheusA2uiRuntime {
  return a2uiRuntime()
}

function surfaceIdsOf(messages: readonly unknown[]): string[] {
  const ids = new Set<string>()
  for (const m of messages) {
    if (typeof m !== 'object' || m === null) continue
    for (const v of Object.values(m)) {
      if (typeof v === 'object' && v !== null && typeof (v as { surfaceId?: unknown }).surfaceId === 'string') {
        ids.add((v as { surfaceId: string }).surfaceId)
      }
    }
  }
  return [...ids]
}

/**
 * Feed A2UI messages to the runtime. Unknown components are replaced in
 * place by labelled fallbacks; a batch the runtime still rejects renders no
 * surface and says so. Message content is never logged (it may carry PHI).
 */
export function processA2uiMessages(messages: readonly unknown[]): void {
  const store = useA2uiStore.getState()
  const { messages: safe, quarantined } = quarantineUnknownComponents(messages, PATIENT_GPT_COMPONENT_SET)
  try {
    a2uiRuntime().processMessages(safe)
    store.recordFallbacks(quarantined)
  } catch (error: unknown) {
    if (!(error instanceof PrometheusA2uiError)) throw error
    for (const id of surfaceIdsOf(messages)) store.setFailure(id, SURFACE_REJECTED_TEXT)
  }
}

export function removeA2uiSurface(surfaceId: string): void {
  const rt = a2uiRuntime()
  if (rt.getSurface(surfaceId)) rt.processMessages([{ version: 'v0.9.1', deleteSurface: { surfaceId } }])
  useA2uiStore.getState().forgetSurface(surfaceId)
}
