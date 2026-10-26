// TJ-ARCH-MOB-001 compliant
// The PatientGPT basic catalog, `urn:patientgpt:a2ui:catalog:basic:v1`:
// fifteen official basic components, each keeping its official name and
// schema and rendered by a PatientGPT implementation. Functions are the
// package's default pure set, which already excludes `openUrl`.
import { DEFAULT_PROMETHEUS_A2UI_FUNCTIONS, createPrometheusA2uiCatalog } from '@prometheus-ags/a2ui-react'
import { PATIENT_GPT_CATALOG_ID, PATIENT_GPT_COMPONENTS } from '../../domain/a2ui-contract'
import { pgButton, pgIcon, pgModal, pgTabs } from './pg-controls'
import { pgCheckBox, pgChoicePicker, pgDateTimeInput, pgSlider, pgTextField } from './pg-fields'
import { pgCard, pgColumn, pgDivider, pgList, pgRow, pgText } from './pg-text-layout'
import './a2ui.css'

export function createPatientGptCatalog() {
  return createPrometheusA2uiCatalog({
    id: PATIENT_GPT_CATALOG_ID,
    components: PATIENT_GPT_COMPONENTS,
    functions: DEFAULT_PROMETHEUS_A2UI_FUNCTIONS,
    implementations: [
      pgText,
      pgRow,
      pgColumn,
      pgList,
      pgCard,
      pgDivider,
      pgButton,
      pgTextField,
      pgCheckBox,
      pgChoicePicker,
      pgDateTimeInput,
      pgIcon,
      pgTabs,
      pgModal,
      pgSlider,
    ],
  })
}
