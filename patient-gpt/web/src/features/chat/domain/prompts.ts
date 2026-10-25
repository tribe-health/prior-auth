// TJ-ARCH-MOB-001 compliant
// Suggested prompts by scope, ported from docs/design/patient-chat/flows.js.
// Case prompts follow the case's state there; the scaffold contract carries no
// case state yet, so a case shows no chips rather than guessed ones.
import type { ConversationScope } from '../../../app/transport/dto'

export function promptsFor(scope: ConversationScope): string[] {
  switch (scope.kind) {
    case 'all':
      return ['What’s due this week?', 'What’s waiting on me?', 'Who is missing a lab result?']
    case 'patient':
      return ['Summarize the chart', 'List the cases', 'Open a new case']
    case 'case':
      return []
  }
}
