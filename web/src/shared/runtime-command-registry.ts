export type RuntimeCommandStatus = 'submitting' | 'uncertain' | 'awaiting-projection';

export interface RuntimeCommandProjection {
  readonly state?: string;
  readonly revision?: string;
  readonly fingerprint?: string;
  readonly detailFingerprint?: string;
}

export interface RuntimeCommandScope {
  readonly feature:
    | 'evidence-reassessment'
    | 'surgeon-gate'
    | 'letter-signing'
    | 'annotations'
    | 'case-management'
    | 'document-upload';
  readonly sessionId: string;
  readonly authorizationRevision: string;
  readonly epoch: number;
  readonly identityId: string;
  readonly practiceId?: string;
  readonly caseId: string;
}

export interface RuntimeCommandOwner {
  readonly id: string;
  readonly status: RuntimeCommandStatus;
  readonly action?: string;
  readonly targetId?: string;
  readonly expectedProjection?: RuntimeCommandProjection;
}

/** Retain ownership after the write receipt until the read projection agrees. */
export function markRuntimeCommandAwaitingProjection(
  scope: RuntimeCommandScope,
  commandId: string,
  expectedProjection: RuntimeCommandProjection,
): boolean {
  const key = keyFor(scope);
  const owner = owners.get(key);
  if (!owner || owner.id !== commandId) return false;
  owners.set(key, { ...owner, status: 'awaiting-projection', expectedProjection });
  notify(key);
  return true;
}

const owners = new Map<string, RuntimeCommandOwner>();
const listeners = new Map<string, Set<() => void>>();

function keyFor(scope: RuntimeCommandScope): string {
  return JSON.stringify([
    scope.feature,
    scope.sessionId,
    scope.authorizationRevision,
    scope.epoch,
    scope.identityId,
    scope.practiceId ?? null,
    scope.caseId,
  ]);
}

/** Drop unresolved commands before a revoked session can render again. */
export function clearRuntimeCommandsForSession(sessionId: string): void {
  const affected: string[] = [];
  for (const key of owners.keys()) {
    const parts = JSON.parse(key) as readonly unknown[];
    if (parts[1] === sessionId) {
      owners.delete(key);
      affected.push(key);
    }
  }
  for (const key of affected) notify(key);
}

function notify(key: string): void {
  for (const listener of listeners.get(key) ?? []) {
    listener();
  }
}

/** Return the command that still owns this clinical mutation slot. */
export function getRuntimeCommand(scope: RuntimeCommandScope): RuntimeCommandOwner | null {
  return owners.get(keyFor(scope)) ?? null;
}

/** Claim an empty slot without replacing an earlier unresolved command. */
export function claimRuntimeCommand(
  scope: RuntimeCommandScope,
  owner: RuntimeCommandOwner,
): boolean {
  const key = keyFor(scope);
  if (owners.has(key)) return false;
  owners.set(key, owner);
  notify(key);
  return true;
}

/** Mark only the matching owner uncertain after a potentially committed request. */
export function markRuntimeCommandUncertain(
  scope: RuntimeCommandScope,
  commandId: string,
): boolean {
  const key = keyFor(scope);
  const owner = owners.get(key);
  if (!owner || owner.id !== commandId) return false;
  owners.set(key, { ...owner, status: 'uncertain' });
  notify(key);
  return true;
}

/** Release only the command that produced the definitive result. */
export function clearRuntimeCommand(
  scope: RuntimeCommandScope,
  commandId: string,
): boolean {
  const key = keyFor(scope);
  if (owners.get(key)?.id !== commandId) return false;
  owners.delete(key);
  notify(key);
  return true;
}

export function subscribeRuntimeCommand(
  scope: RuntimeCommandScope,
  listener: () => void,
): () => void {
  const key = keyFor(scope);
  const scopedListeners = listeners.get(key) ?? new Set<() => void>();
  scopedListeners.add(listener);
  listeners.set(key, scopedListeners);
  return () => {
    scopedListeners.delete(listener);
    if (scopedListeners.size === 0) listeners.delete(key);
  };
}

/** Test isolation for the process-scoped singleton. */
export function resetRuntimeCommandRegistryForTests(): void {
  const affected = [...owners.keys()];
  owners.clear();
  for (const key of affected) notify(key);
}
