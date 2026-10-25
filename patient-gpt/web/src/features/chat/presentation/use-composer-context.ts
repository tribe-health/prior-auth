// TJ-ARCH-MOB-001 compliant
// Placeholder, prompts and draft key follow the conversation in context,
// as composer.js `refresh` does.
import { useAuiState } from '@assistant-ui/react'
import { scopeKey } from '../../conversations/domain/scope'
import { usePatient } from '../../patients/presentation/use-patient-directory'
import { promptsFor } from '../domain/prompts'
import { useActiveThread } from './active-thread'

export function useComposerContext() {
  const active = useActiveThread()
  const patient = usePatient(active.scope.kind === 'all' ? null : active.scope.patientId)
  const isRunning = useAuiState((s) => s.thread.isRunning)
  const first = patient?.displayName.split(/\s+/)[0] ?? 'the patient'
  const placeholder =
    active.scope.kind === 'case'
      ? `Message about ${active.scope.caseId}`
      : active.scope.kind === 'patient'
        ? `Ask about ${first}’s chart, or open a new case`
        : 'Ask about any patient or case'
  const draftKey =
    active.view === 'chat' && active.conversationId ? `conversation:${active.conversationId}` : scopeKey(active.scope)
  return {
    placeholder,
    prompts: promptsFor(active.scope),
    canAttach: active.scope.kind === 'case',
    draftKey,
    isRunning,
  }
}
