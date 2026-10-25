// TJ-ARCH-MOB-001 compliant
// Parses `all | patient:<id> | case:<patientId>:<caseId>`. Anything else is
// rejected, never defaulted to `all` (mirrors ConversationScope::from_str).
import type { ConversationScope } from '../../../app/transport/dto'

export function parseScopeKey(raw: string): ConversationScope {
  const parts = raw.split(':')
  if (raw === '' || parts.some((p) => p === '')) throw new Error(`Malformed conversation scope: ${raw}`)
  const [kind, a, b] = parts
  if (kind === 'all' && parts.length === 1) return { kind: 'all' }
  if (kind === 'patient' && parts.length === 2 && a) return { kind: 'patient', patientId: a }
  if (kind === 'case' && parts.length === 3 && a && b) return { kind: 'case', patientId: a, caseId: b }
  throw new Error(`Malformed conversation scope: ${raw}`)
}
