// TJ-ARCH-MOB-001 compliant
// The PatientGPT basic A2UI catalog contract (docs/plan/pem-adoption-plan.md),
// shared with the Flutter shell: same id, same fifteen official components.
import type { PrometheusA2uiComponentName } from '@prometheus-ags/a2ui-react'

export const PATIENT_GPT_CATALOG_ID = 'urn:patientgpt:a2ui:catalog:basic:v1'

/**
 * Official basic components this build renders, each with a PatientGPT
 * implementation. Image, Video and AudioPlayer are excluded (no media in this
 * build); `openUrl` is excluded from the functions (navigation is app-owned).
 * Clinical components belong to the UAR-registered catalog, not this one.
 */
export const PATIENT_GPT_COMPONENTS = [
  'Text',
  'Row',
  'Column',
  'List',
  'Card',
  'Divider',
  'Button',
  'TextField',
  'CheckBox',
  'ChoicePicker',
  'DateTimeInput',
  'Icon',
  'Tabs',
  'Modal',
  'Slider',
] as const satisfies readonly PrometheusA2uiComponentName[]

export const PATIENT_GPT_COMPONENT_SET: ReadonlySet<string> = new Set(PATIENT_GPT_COMPONENTS)

/** The words every fail-closed stand-in uses, on both shells. */
export function notRenderedLabel(name: string): string {
  return `Not rendered in this build: ${name}`
}

export const SURFACE_REJECTED_TEXT =
  'This surface was not rendered. Its messages did not match the A2UI contract.'
