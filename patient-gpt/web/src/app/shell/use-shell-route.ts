// TJ-ARCH-MOB-001 compliant
// Reads the route and resolves the scope in effect: from the route on pages,
// from the conversation's own scope on a chat (shell.js `scope`).
import { useParams } from '@tanstack/react-router'
import type { ConversationScope } from '../transport/dto'
import { useConversation } from '../../features/conversations/presentation/use-conversations'
import { useLocalThreadScope } from '../../features/chat/presentation/use-chat-runtime'
import { useCase } from '../../features/patients/presentation/use-patient-directory'

export type ShellRoute =
  | { name: 'home'; scope: ConversationScope }
  | { name: 'patient'; scope: ConversationScope; patientId: string }
  | { name: 'case'; scope: ConversationScope | null; caseId: string }
  | { name: 'chat'; scope: ConversationScope | null; conversationId: string; title: string | null }

export function useShellRoute(): ShellRoute {
  const params = useParams({ strict: false }) as { patientId?: string; caseId?: string; conversationId?: string }
  const caseRecord = useCase(params.caseId ?? null)
  const conversation = useConversation(params.conversationId ?? null)
  const localScope = useLocalThreadScope(params.conversationId ?? null)

  if (params.conversationId) {
    return {
      name: 'chat',
      conversationId: params.conversationId,
      scope: conversation?.scope ?? localScope,
      title: conversation?.title ?? null,
    }
  }
  if (params.caseId) {
    return {
      name: 'case',
      caseId: params.caseId,
      scope: caseRecord ? { kind: 'case', patientId: caseRecord.patientId, caseId: caseRecord.id } : null,
    }
  }
  if (params.patientId) {
    return { name: 'patient', patientId: params.patientId, scope: { kind: 'patient', patientId: params.patientId } }
  }
  return { name: 'home', scope: { kind: 'all' } }
}
