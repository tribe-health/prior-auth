import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { GraphState } from '@prometheus-ags/entity-graph-core';

import { invokeNative, requireNativeEpoch } from '@/shared/native-command-client';

export const NATIVE_REPLICA_EVENT = 'aso://replica-coordination';

export interface NativeGraphProjection {
  readonly entities: GraphState['entities'];
  readonly entityStates: GraphState['entityStates'];
  readonly syncMetadata: GraphState['syncMetadata'];
  readonly lists: GraphState['lists'];
}

export interface NativeProjectionStore {
  getState(): GraphState;
  setState(next: Partial<GraphState>): void;
}

interface NativeReplicaClaim {
  readonly role: 'owner' | 'follower';
  readonly graphId: string;
  readonly claimGeneration: number;
  readonly revision: number;
  readonly projection: NativeGraphProjection | null;
}

type NativeReplicaEvent =
  | {
      readonly schema: 1;
      readonly kind: 'projection';
      readonly graphId: string;
      readonly claimGeneration: number;
      readonly revision: number;
      readonly projection: NativeGraphProjection;
    }
  | {
      readonly schema: 1;
      readonly kind: 'owner-released';
      readonly graphId: string;
      readonly claimGeneration: number;
    };

export interface NativeReplicaChannel {
  readonly role: 'owner' | 'follower';
  readonly graphId: string;
  readonly claimGeneration: number;
  readonly initialRevision: number;
  readonly initialProjection: NativeGraphProjection | null;
  readonly invalidated: Promise<void>;
  publish(projection: NativeGraphProjection): Promise<number>;
  subscribe(listener: (projection: NativeGraphProjection, revision: number) => void): () => void;
  release(): Promise<void>;
  close(): void;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function parseProjection(value: unknown): NativeGraphProjection | null {
  const candidate = record(value);
  if (!candidate || !exactKeys(candidate, ['entities', 'entityStates', 'syncMetadata', 'lists'])) {
    return null;
  }
  if (
    !record(candidate.entities)
    || !record(candidate.entityStates)
    || !record(candidate.syncMetadata)
    || !record(candidate.lists)
  ) {
    return null;
  }
  return candidate as unknown as NativeGraphProjection;
}

function parseClaim(value: unknown): NativeReplicaClaim {
  const candidate = record(value);
  if (!candidate || !exactKeys(candidate, [
    'role',
    'graphId',
    'claimGeneration',
    'revision',
    'projection',
  ])) {
    throw new Error('Native replica claim is invalid.');
  }
  const projection = candidate.projection === null ? null : parseProjection(candidate.projection);
  if (
    (candidate.role !== 'owner' && candidate.role !== 'follower')
    || typeof candidate.graphId !== 'string'
    || candidate.graphId.length === 0
    || !nonNegativeInteger(candidate.claimGeneration)
    || candidate.claimGeneration === 0
    || !nonNegativeInteger(candidate.revision)
    || (candidate.projection !== null && !projection)
  ) {
    throw new Error('Native replica claim is invalid.');
  }
  return { ...candidate, projection } as NativeReplicaClaim;
}

function parseEvent(value: unknown): NativeReplicaEvent | null {
  const candidate = record(value);
  if (!candidate || candidate.schema !== 1) return null;
  if (candidate.kind === 'owner-released') {
    if (!exactKeys(candidate, ['schema', 'kind', 'graphId', 'claimGeneration'])) return null;
    if (
      typeof candidate.graphId !== 'string'
      || !nonNegativeInteger(candidate.claimGeneration)
      || candidate.claimGeneration === 0
    ) return null;
    return candidate as unknown as NativeReplicaEvent;
  }
  if (candidate.kind !== 'projection') return null;
  if (!exactKeys(candidate, [
    'schema',
    'kind',
    'graphId',
    'claimGeneration',
    'revision',
    'projection',
  ])) return null;
  const projection = parseProjection(candidate.projection);
  if (
    typeof candidate.graphId !== 'string'
    || !nonNegativeInteger(candidate.claimGeneration)
    || candidate.claimGeneration === 0
    || !nonNegativeInteger(candidate.revision)
    || candidate.revision === 0
    || !projection
  ) return null;
  return { ...candidate, projection } as NativeReplicaEvent;
}

export function captureNativeGraphProjection(state: GraphState): NativeGraphProjection {
  return structuredClone({
    entities: state.entities,
    entityStates: state.entityStates,
    syncMetadata: state.syncMetadata,
    lists: state.lists,
  });
}

export function applyNativeGraphProjection(
  store: NativeProjectionStore,
  projection: NativeGraphProjection,
): void {
  store.setState(structuredClone(projection));
}

export async function openNativeReplicaChannel(epoch: number): Promise<NativeReplicaChannel> {
  const authorizedEpoch = requireNativeEpoch(epoch);
  const listeners = new Set<(projection: NativeGraphProjection, revision: number) => void>();
  const buffered: NativeReplicaEvent[] = [];
  let claim: NativeReplicaClaim | null = null;
  let closed = false;
  let released = false;
  let revision = 0;
  let latestProjection: NativeGraphProjection | null = null;
  let resolveInvalidated!: () => void;
  const invalidated = new Promise<void>((resolve) => {
    resolveInvalidated = resolve;
  });

  const receive = (value: unknown) => {
    const event = parseEvent(value);
    if (!event) return;
    if (!claim) {
      buffered.push(event);
      return;
    }
    if (event.graphId !== claim.graphId || event.claimGeneration !== claim.claimGeneration) return;
    if (event.kind === 'owner-released') {
      resolveInvalidated();
      return;
    }
    if (event.revision <= revision) return;
    revision = event.revision;
    latestProjection = event.projection;
    for (const listener of new Set(listeners)) listener(event.projection, event.revision);
  };

  let unlisten: UnlistenFn | null = await listen<unknown>(NATIVE_REPLICA_EVENT, (event) => {
    receive(event.payload);
  });
  try {
    claim = parseClaim(await invokeNative<unknown>('claim_replica_owner', { epoch: authorizedEpoch }));
    revision = claim.revision;
    latestProjection = claim.projection;
    for (const event of buffered.splice(0)) receive(event);
  } catch (error) {
    unlisten();
    unlisten = null;
    throw error;
  }

  const activeClaim = claim;
  return {
    role: activeClaim.role,
    graphId: activeClaim.graphId,
    claimGeneration: activeClaim.claimGeneration,
    initialRevision: activeClaim.revision,
    initialProjection: activeClaim.projection,
    invalidated,
    async publish(projection) {
      if (closed || activeClaim.role !== 'owner') {
        throw new Error('Native replica projection requires the active owner.');
      }
      const nextRevision = revision + 1;
      await invokeNative<void>('publish_replica_projection', {
        epoch: authorizedEpoch,
        graphId: activeClaim.graphId,
        claimGeneration: activeClaim.claimGeneration,
        revision: nextRevision,
        projection,
      });
      revision = nextRevision;
      return revision;
    },
    subscribe(listener) {
      listeners.add(listener);
      if (latestProjection) listener(latestProjection, revision);
      return () => listeners.delete(listener);
    },
    async release() {
      if (released || activeClaim.role !== 'owner') return;
      released = true;
      await invokeNative<void>('release_replica_owner', {
        epoch: authorizedEpoch,
        graphId: activeClaim.graphId,
        claimGeneration: activeClaim.claimGeneration,
      });
    },
    close() {
      if (closed) return;
      closed = true;
      listeners.clear();
      unlisten?.();
      unlisten = null;
    },
  };
}
