import { afterEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { createGraphStore } from '@prometheus-ags/entity-graph-react';

import {
  NATIVE_REPLICA_EVENT,
  applyNativeGraphProjection,
  captureNativeGraphProjection,
  openNativeReplicaChannel,
  type NativeGraphProjection,
} from './native-replica-client';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));

const mockedInvoke = vi.mocked(invoke);
const mockedListen = vi.mocked(listen);

afterEach(() => {
  mockedInvoke.mockReset();
  mockedListen.mockReset();
});

function projection(caseName = 'Synthetic case'): NativeGraphProjection {
  return {
    entities: { Case: { 'case-1': { id: 'case-1', name: caseName } } },
    entityStates: {},
    syncMetadata: {},
    lists: {
      cases: {
        ids: ['case-1'],
        total: 1,
        nextCursor: null,
        prevCursor: null,
        hasNextPage: false,
        hasPrevPage: false,
        isFetching: false,
        isFetchingMore: false,
        error: null,
        lastError: null,
        lastFetched: 1,
        stale: false,
        currentPage: 1,
        pageSize: 25,
      },
    },
  };
}

describe('native replica channel', () => {
  it('elects one owner, relays canonical graph state, and retains window-local patches', async () => {
    const eventListeners: Array<(event: { payload: unknown }) => void> = [];
    mockedListen.mockImplementation(async (event, listener) => {
      expect(event).toBe(NATIVE_REPLICA_EVENT);
      eventListeners.push(listener as (event: { payload: unknown }) => void);
      return () => undefined;
    });
    let claims = 0;
    mockedInvoke.mockImplementation(async (command, args) => {
      const input = (args as { input: Record<string, unknown> }).input;
      if (command === 'claim_replica_owner') {
        claims += 1;
        return {
          role: claims === 1 ? 'owner' : 'follower',
          graphId: '00000000-0000-4000-8000-000000000001',
          claimGeneration: 1,
          revision: 0,
          projection: null,
        };
      }
      if (command === 'publish_replica_projection') {
        for (const listener of eventListeners) {
          listener({
            payload: {
              schema: 1,
              kind: 'projection',
              graphId: input.graphId,
              claimGeneration: input.claimGeneration,
              revision: input.revision,
              projection: input.projection,
            },
          });
        }
        return undefined;
      }
      if (command === 'release_replica_owner') return undefined;
      throw new Error(`Unexpected native command: ${command}`);
    });

    const owner = await openNativeReplicaChannel(7);
    const follower = await openNativeReplicaChannel(7);
    const ownerStore = createGraphStore();
    const followerStore = createGraphStore();
    ownerStore.getState().patchEntity('Case', 'case-1', { selected: 'owner' });
    followerStore.getState().patchEntity('Case', 'case-1', { selected: 'follower' });
    const unsubscribe = follower.subscribe((next) => {
      applyNativeGraphProjection(followerStore, next);
    });

    applyNativeGraphProjection(ownerStore, projection());
    await owner.publish(captureNativeGraphProjection(ownerStore.getState()));

    expect(owner.role).toBe('owner');
    expect(follower.role).toBe('follower');
    expect(followerStore.getState().entities).toEqual(ownerStore.getState().entities);
    expect(followerStore.getState().lists).toEqual(ownerStore.getState().lists);
    expect(ownerStore.getState().patches.Case?.['case-1']).toEqual({ selected: 'owner' });
    expect(followerStore.getState().patches.Case?.['case-1']).toEqual({ selected: 'follower' });
    await expect(follower.publish(projection())).rejects.toThrow(
      'Native replica projection requires the active owner.',
    );
    expect(mockedInvoke).toHaveBeenCalledWith('claim_replica_owner', {
      input: { epoch: 7 },
    });

    unsubscribe();
    await owner.release();
    owner.close();
    follower.close();
  });

  it('buffers a projection delivered while the claim is in flight and ignores malformed frames', async () => {
    let receive: ((event: { payload: unknown }) => void) | undefined;
    mockedListen.mockImplementation(async (_event, listener) => {
      receive = listener as (event: { payload: unknown }) => void;
      return () => undefined;
    });
    mockedInvoke.mockImplementation(async (command) => {
      if (command !== 'claim_replica_owner') return undefined;
      receive?.({ payload: { schema: 1, kind: 'projection', graphId: 'wrong' } });
      receive?.({
        payload: {
          schema: 1,
          kind: 'projection',
          graphId: '00000000-0000-4000-8000-000000000001',
          claimGeneration: 3,
          revision: 1,
          projection: projection('Buffered case'),
        },
      });
      return {
        role: 'follower',
        graphId: '00000000-0000-4000-8000-000000000001',
        claimGeneration: 3,
        revision: 0,
        projection: null,
      };
    });

    const channel = await openNativeReplicaChannel(2);
    const observed = vi.fn();
    channel.subscribe(observed);

    expect(observed).toHaveBeenCalledOnce();
    expect(observed).toHaveBeenCalledWith(projection('Buffered case'), 1);
    channel.close();
  });
});
