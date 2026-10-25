// TJ-ARCH-MOB-001 compliant
// Composer drafts per scope, on the local lane only.
import type { LocalLaneStore } from './local-lane-store'

let lane: LocalLaneStore | null = null

export function configureDrafts(localLane: LocalLaneStore): void {
  lane = localLane
}

function current(): LocalLaneStore {
  if (!lane) throw new Error('The local lane is not configured.')
  return lane
}

export const drafts = {
  read: (scopeKey: string) => current().readDraft(scopeKey),
  write: (scopeKey: string, body: string) => current().writeDraft(scopeKey, body),
}
