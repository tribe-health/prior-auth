import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const startup = vi.hoisted(() => {
  const events: string[] = [];
  return {
    events,
    storageMode: 'memory' as 'memory' | 'persistent',
    materializerEnabled: true,
    transitionRuntimePhase: (phase: string, epoch: number) => {
      events.push(`phase:${phase}:${epoch}`);
    },
  };
});

vi.mock('@/app/providers/session-provider', () => ({
  useSession: () => ({
    identityId: 'identity-1',
    sessionId: 'session-1',
    userId: 'user-1',
    practiceId: 'practice-1',
    displayName: 'Dr Rivera',
    capabilities: [],
    principal: 'user',
    expiresAt: '2099-01-01T00:00:00Z',
    authorizationRevision: 'membership:1',
  }),
  useSessionEpoch: () => 7,
  useRuntimeActions: () => ({
    transitionRuntimePhase: startup.transitionRuntimePhase,
  }),
}));

vi.mock('@prometheus-ags/entity-graph-react', () => ({
  GraphStoreProvider: ({ children }: { children: unknown }) => children,
  createGraphStore: () => ({ store: 'synthetic' }),
  createPGlitePersistenceAdapter: async () => {
    startup.events.push('graph:hydrate');
    return {};
  },
}));

vi.mock('@prometheus-ags/entity-graph-core', () => ({
  createCommittedReplicaProjector: async () => ({ projector: 'synthetic' }),
  startScopedLocalFirstGraph: () => ({
    ready: Promise.resolve(),
    dispose: async () => undefined,
    markServerCaughtUp: () => startup.events.push('graph:caught-up'),
  }),
}));

vi.mock('@/shared/sync/pglite-bootstrap', () => ({
  openPGliteReplica: async () => {
    startup.events.push('database:open');
    return {
      waitReady: Promise.resolve(),
      query: async () => ({ rows: [] }),
      exec: async () => undefined,
      transaction: async (run: (database: unknown) => unknown) => run({}),
      close: async () => undefined,
    };
  },
}));

vi.mock('@/shared/sync/migration-ledger', () => ({
  migrationChecksum: async () => 'synthetic-checksum',
  migrateReplicaSchema: async () => {
    startup.events.push('database:migrate');
    return { status: 'ready' };
  },
  currentGeneration: async () => 3,
}));

vi.mock('@/shared/sync/replica-owner', () => ({
  createMemoryLeaseStore: () => ({}),
  ReplicaLease: class {
    async acquire() {
      return { granted: true };
    }

    startRenewal() {
      return () => undefined;
    }

    async release() {
      return undefined;
    }
  },
}));

vi.mock('@/shared/sync/replica-worker-owner', () => ({
  browserExclusiveLockManager: () => ({}),
  ReplicaWorkerOwner: class {
    private resource: unknown;

    constructor(private readonly options: {
      factory: { open(signal: AbortSignal): Promise<unknown> };
    }) {}

    async tryOpen() {
      this.resource = await this.options.factory.open(new AbortController().signal);
      return { status: 'owner' };
    }

    async withOwner<T>(run: (resource: unknown) => T | Promise<T>): Promise<T> {
      return run(this.resource);
    }

    requestClose() {}

    async close() {
      const resource = this.resource as {
        drain?(): Promise<void>;
        close?(): Promise<void>;
      } | undefined;
      await resource?.drain?.();
      await resource?.close?.();
    }
  },
}));

vi.mock('@/shared/sync/storage-policy', () => ({
  resolveStoragePolicy: () => ({ mode: startup.storageMode, misconfigured: false }),
  assertMaterializerStoragePolicy: (
    policy: { mode: 'memory' | 'persistent' },
    materializerEnabled: boolean,
  ) => {
    startup.events.push(`policy:${policy.mode}:${materializerEnabled}`);
    if (policy.mode === 'persistent' && materializerEnabled) {
      throw new Error(
        'The experimental clinical materializer is approved only for memory-only qualification.',
      );
    }
  },
}));

vi.mock('@/shared/sync/materializer-adoption', () => ({
  isExperimentalMaterializerEnabled: () => startup.materializerEnabled,
}));

vi.mock('@/shared/sync/shape-gateway', () => ({
  requireShapeGatewayUrl: () => 'https://shapes.example.test',
}));

vi.mock('@/shared/sync/frf-shape-transport', () => ({
  createFrfShapeTransport: () => ({ transport: 'synthetic' }),
}));

vi.mock('@/shared/sync/replica-wiring', () => ({
  CHECKPOINT_SCHEMA_SQL: 'CREATE TABLE synthetic_checkpoint (id TEXT)',
  REPLICA_SHAPES: [{ shape: 'cases' }],
  REPLICA_LIST_BINDINGS: [],
  REPLICA_TABLE_BINDINGS: [],
  REPLICA_TARGETS: [],
  createPGliteCheckpointStore: () => ({ checkpoints: 'synthetic' }),
  entityTypeFor: () => 'Case',
}));

vi.mock('@/shared/sync/replica-runtime', () => ({
  ReplicaAuthorityFailure: class extends Error {},
  startReplicaRuntime: async (options: { onCaughtUp(): void }) => {
    startup.events.push('shape:catch-up');
    options.onCaughtUp();
    return { status: 'syncing' };
  },
}));

vi.mock('@/shared/sync/replica-continuation', () => ({
  startReplicaContinuation: (options: { runOnce(): Promise<void> }) => {
    const ready = Promise.resolve().then(() => options.runOnce());
    return { ready, closed: Promise.resolve() };
  },
}));

import { GraphProvider } from './graph-provider';

afterEach(() => {
  cleanup();
  startup.events.length = 0;
  startup.storageMode = 'memory';
  startup.materializerEnabled = true;
});

describe('GraphProvider startup composition', () => {
  it('opens, migrates, hydrates and catches up before publishing Ready', async () => {
    render(
      <GraphProvider fallback={<p>Starting</p>}>
        <p>Protected application</p>
      </GraphProvider>,
    );

    await waitFor(() => expect(screen.getByText('Protected application')).toBeTruthy());
    expect(startup.events).toEqual([
      'policy:memory:true',
      'phase:opening-replica:7',
      'database:open',
      'phase:migrating:7',
      'database:migrate',
      'phase:hydrating:7',
      'graph:hydrate',
      'phase:catching-up:7',
      'shape:catch-up',
      'graph:caught-up',
      'phase:ready:7',
    ]);
  });

  it('refuses persistent storage before the experimental materializer opens PGlite', async () => {
    startup.storageMode = 'persistent';

    render(
      <GraphProvider
        fallback={<p>Starting</p>}
        onError={(error) => <p>{error.message}</p>}
      >
        <p>Protected application</p>
      </GraphProvider>,
    );

    await waitFor(() => expect(screen.getByText(
      'The experimental clinical materializer is approved only for memory-only qualification.',
    )).toBeTruthy());
    expect(startup.events).toEqual(['policy:persistent:true']);
    expect(screen.queryByText('Protected application')).toBeNull();
  });
});
