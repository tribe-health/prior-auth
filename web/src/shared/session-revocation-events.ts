type RevocationListener = (reason: string) => void;

const listeners = new Set<RevocationListener>();

/** External adapters publish an authority refusal without importing a store. */
export function publishSessionRevocation(reason: string): readonly unknown[] {
  const failures: unknown[] = [];
  for (const listener of new Set(listeners)) {
    try {
      listener(reason);
    } catch (error) {
      // One diagnostic or feature subscriber cannot prevent the access-boundary
      // subscriber from applying the synchronous security fence.
      failures.push(error);
    }
  }
  return failures;
}

/** Replica adapters use the same access fence when fresh authorization cannot be proved. */
export function publishReplicaRevalidationFailure(
  reason = 'Replica access could not be revalidated.',
): readonly unknown[] {
  return publishSessionRevocation(reason);
}

export function subscribeSessionRevocation(listener: RevocationListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
