import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  phases: [] as string[],
  openDatabase: vi.fn(),
  closeChannel: vi.fn(),
  transitionRuntimePhase: vi.fn((phase: string, epoch: number) => {
    native.phases.push(`${phase}:${epoch}`);
  }),
}));

vi.mock('@/app/providers/session-provider', () => ({
  useSession: () => ({
    identityId: 'identity-1',
    sessionId: 'session-1',
    userId: 'user-1',
    practiceId: 'practice-1',
    displayName: 'Synthetic surgeon',
    capabilities: [],
    principal: 'user',
    expiresAt: '2099-01-01T00:00:00Z',
    authorizationRevision: 'membership:1',
  }),
  useSessionEpoch: () => 11,
  useRuntimeActions: () => ({
    transitionRuntimePhase: native.transitionRuntimePhase,
  }),
}));

vi.mock('@/shared/native-command-client', () => ({
  isNativeRuntime: () => true,
}));

vi.mock('@/shared/sync/native-replica-client', () => ({
  openNativeReplicaChannel: async (epoch: number) => {
    expect(epoch).toBe(11);
    return {
      role: 'follower',
      graphId: '00000000-0000-4000-8000-000000000001',
      claimGeneration: 1,
      initialRevision: 1,
      initialProjection: null,
      invalidated: new Promise<void>(() => undefined),
      publish: async () => {
        throw new Error('follower cannot publish');
      },
      subscribe: (listener: (projection: unknown, revision: number) => void) => {
        listener({ entities: {}, entityStates: {}, syncMetadata: {}, lists: {} }, 1);
        return vi.fn();
      },
      release: async () => undefined,
      close: native.closeChannel,
    };
  },
  applyNativeGraphProjection: (
    store: { setState(next: Record<string, unknown>): void },
    projection: Record<string, unknown>,
  ) => store.setState(projection),
  captureNativeGraphProjection: (state: unknown) => state,
}));

vi.mock('@/shared/sync/pglite-bootstrap', () => ({
  openPGliteReplica: native.openDatabase,
}));

vi.mock('@/shared/sync/runtime-quiescence', () => ({
  installPrivateRuntimeQuiescer: vi.fn(),
}));

import { GraphProvider } from './graph-provider';

afterEach(() => {
  cleanup();
  native.phases.length = 0;
  native.openDatabase.mockReset();
  native.closeChannel.mockReset();
  native.transitionRuntimePhase.mockClear();
});

describe('GraphProvider native follower composition', () => {
  it('hydrates the relayed graph without opening a second PGlite database', async () => {
    render(
      <GraphProvider fallback={<p>Starting</p>}>
        <p>Native protected application</p>
      </GraphProvider>,
    );

    await waitFor(() => expect(screen.getByText('Native protected application')).toBeTruthy());
    expect(native.openDatabase).not.toHaveBeenCalled();
    expect(native.phases).toEqual([
      'opening-replica:11',
      'hydrating:11',
      'ready:11',
    ]);
  });
});
