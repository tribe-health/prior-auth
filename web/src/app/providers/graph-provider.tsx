/**
 * Entity graph + local persistence.
 *
 * Composition order is load-bearing and mounts outside-in:
 *
 *   SessionProvider          knows practiceId
 *     └─ GraphProvider       scopes sync to that practice
 *          └─ routes
 *
 * A graph configured before the practice is known would sync the wrong tenant
 * or nothing at all, so this provider requires a session and renders a
 * boundary state until one exists.
 *
 * Reads arrive through Electric shapes (ADR-007). Writes do not pass through
 * here — they go to the Axum API, because that is where clinical authority is
 * checked.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PGlite } from "@electric-sql/pglite";
import {
  GraphStoreProvider,
  createGraphStore,
  createPGlitePersistenceAdapter,
} from "@prometheus-ags/entity-graph-react";
import {
  createCommittedReplicaProjector,
  startScopedLocalFirstGraph,
} from "@prometheus-ags/entity-graph-core";

import {
  PGLITE_ANNOTATION_TYPES_SQL,
  PGLITE_CASE_SUMMARY_SQL,
  PGLITE_DOCUMENT_STATUS_SQL,
  PGLITE_SCHEMA_SQL,
  PGLITE_SOURCE_HASH_SQL,
} from "@/shared/sync/pglite-schema";
import type { VerifiedSession } from "@/shared/model/session";
import { GraphSessionManager } from "@/shared/sync/graph-session-manager";
import { createWebLeaseStore } from "@/shared/sync/lease-store-web";
import {
  migrateReplicaSchema,
  migrationChecksum,
  currentGeneration,
  type ReplicaSchemaPlan,
} from "@/shared/sync/migration-ledger";
import { ReplicaLease, createMemoryLeaseStore } from "@/shared/sync/replica-owner";
import {
  ReplicaWorkerOwner,
  browserExclusiveLockManager,
  type OwnedReplicaResource,
} from "@/shared/sync/replica-worker-owner";
import { createFrfShapeTransport } from "@/shared/sync/frf-shape-transport";
import { requireShapeGatewayUrl } from "@/shared/sync/shape-gateway";
import { startReplicaContinuation } from "@/shared/sync/replica-continuation";
import {
  ReplicaAuthorityFailure,
  startReplicaRuntime,
} from "@/shared/sync/replica-runtime";
import {
  CHECKPOINT_SCHEMA_SQL,
  REPLICA_SHAPES,
  REPLICA_LIST_BINDINGS,
  REPLICA_TABLE_BINDINGS,
  REPLICA_TARGETS,
  createPGliteCheckpointStore,
  entityTypeFor,
} from "@/shared/sync/replica-wiring";
import {
  assertMaterializerStoragePolicy,
  resolveStoragePolicy,
} from "@/shared/sync/storage-policy";
import { openPGliteReplica } from "@/shared/sync/pglite-bootstrap";
import { isExperimentalMaterializerEnabled } from "@/shared/sync/materializer-adoption";
import { installPrivateRuntimeQuiescer } from "@/shared/sync/runtime-quiescence";
import { isNativeRuntime } from "@/shared/native-command-client";
import {
  applyNativeGraphProjection,
  captureNativeGraphProjection,
  openNativeReplicaChannel,
} from "@/shared/sync/native-replica-client";
import type { RuntimePhase } from "@/features/session/store/session-store";

const DEPLOYMENT_ID: string = import.meta.env.VITE_ASO_DEPLOYMENT_ID ?? "local-unconfigured";
import {
  useRuntimeActions,
  useSession,
  useSessionEpoch,
} from "./session-provider";

type GraphStore = ReturnType<typeof createGraphStore>;

interface GraphRuntime {
  key: string;
  store: GraphStore;
}

/** Bumped when the local schema changes shape; old namespaces are then dead. */
const REPLICA_GENERATION = 5;
const REPLICA_SCHEMA_VERSION = 7;

/**
 * The persisted namespace for a session's graph.
 *
 * Previously `aso:${practiceId}` — practice alone. The runtime architecture
 * (§7) forbids that outright: *"Do not key private storage only by practice
 * ID."* Two clinicians in one practice on a shared workstation would share a
 * namespace, and a scope or schema change would silently reuse stale private
 * data.
 *
 * So the key carries identity as well as practice, plus the replica generation
 * that invalidates the namespace when the local schema changes. `identityId` is
 * the Kratos identity — the authority on *who* this is — and `principal`
 * separates a user's namespace from an agent's, per ADR-002's rule that an
 * agent acting for a clinician is a different principal.
 *
 * Session ID and the authority service's revision fence reuse after logout,
 * login as another user, and role changes. A capability-list hash is not an
 * authority revision and is deliberately absent.
 */
export function graphStorageKey(
  session: VerifiedSession,
  deploymentId = DEPLOYMENT_ID,
): string {
  return [
    "aso",
    deploymentId,
    `g${REPLICA_GENERATION}`,
    session.principal,
    session.practiceId,
    session.identityId,
    session.sessionId,
    session.authorizationRevision,
  ].map(encodeURIComponent).join(":");
}

/**
 * The one manager for this app.
 *
 * Module-level because the ownership guarantee is process-wide: two managers
 * would each believe they held the only runtime, which is the problem this
 * solves. Its factory is what actually opens PGlite and starts the graph.
 */
interface OwnedGraphResource extends OwnedReplicaResource {
  readonly pglite: PGlite;
  readonly store: GraphStore;
}

interface GraphSessionContext {
  epoch: number;
  currentSession: () => VerifiedSession | null;
  transitionRuntimePhase: (phase: RuntimePhase) => void;
}

export function createReplicaAuthorityGuard(
  storageKey: string,
  currentSession: () => VerifiedSession | null,
  now: () => number = Date.now,
): () => void {
  return () => {
    const session = currentSession();
    if (!session || graphStorageKey(session) !== storageKey) {
      throw new ReplicaAuthorityFailure(
        "Replica authority changed before local data could be committed.",
      );
    }
    const expiresAt = Date.parse(session.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= now()) {
      throw new ReplicaAuthorityFailure(
        "Replica authority expired before local data could be committed.",
      );
    }
  };
}

function waitForOwnerRetry(signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(new DOMException("Replica follower cancelled", "AbortError"));
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Replica follower cancelled", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, 250);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function fencedPGlite(
  owner: ReplicaWorkerOwner<OwnedGraphResource>,
  pglite: PGlite,
): PGlite {
  const fencedMethods = new Set<PropertyKey>(["query", "exec", "transaction"]);
  return new Proxy(pglite, {
    get(target, property) {
      const value = Reflect.get(target, property, target) as unknown;
      if (typeof value !== "function") return value;
      if (!fencedMethods.has(property)) return value.bind(target);
      return (...args: unknown[]) =>
        owner.withOwner(() => Reflect.apply(value, target, args) as Promise<unknown>);
    },
  });
}

const sessionManager = new GraphSessionManager<GraphSessionContext>({
  async open(key: string, sessionSignal: AbortSignal, context) {
    if (!context) throw new Error("Verified session is required to open the replica.");
    const assertAuthority = createReplicaAuthorityGuard(key, context.currentSession);
    assertAuthority();
    const nativeChannel = isNativeRuntime()
      ? await openNativeReplicaChannel(context.epoch)
      : null;
    if (nativeChannel?.role === "follower") {
      context.transitionRuntimePhase("opening-replica");
      const store = createGraphStore();
      context.transitionRuntimePhase("hydrating");
      let resolveHydrated!: () => void;
      const hydrated = new Promise<void>((resolve) => {
        resolveHydrated = resolve;
      });
      const unsubscribe = nativeChannel.subscribe((projection) => {
        applyNativeGraphProjection(store, projection);
        resolveHydrated();
      });
      const cancelled = new Promise<never>((_resolve, reject) => {
        const onAbort = () => {
          sessionSignal.removeEventListener("abort", onAbort);
          reject(new DOMException("Native replica follower cancelled", "AbortError"));
        };
        sessionSignal.addEventListener("abort", onAbort, { once: true });
      });
      const invalidated = nativeChannel.invalidated.then<never>(() => {
        throw new DOMException("Native replica owner released", "AbortError");
      });
      try {
        await Promise.race([hydrated, cancelled, invalidated]);
      } catch (error) {
        unsubscribe();
        nativeChannel.close();
        throw error;
      }
      context.transitionRuntimePhase("ready");
      return {
        store,
        invalidated: nativeChannel.invalidated,
        async dispose() {
          unsubscribe();
          nativeChannel.close();
        },
      };
    }
    const abandonNativeClaim = async () => {
      if (!nativeChannel) return;
      try {
        await nativeChannel.release();
      } catch {
        // The host may already have revoked the claim while opening failed.
      } finally {
        nativeChannel.close();
      }
    };
    const policy = resolveStoragePolicy(import.meta.env.VITE_ASO_REPLICA_PERSISTENCE);
    const materializerEnabled = isExperimentalMaterializerEnabled(
      import.meta.env.VITE_ASO_ENABLE_RA11C_MATERIALIZER,
    );
    assertMaterializerStoragePolicy(policy, materializerEnabled);
    if (policy.misconfigured) {
      console.error(
        `[replica] VITE_ASO_REPLICA_PERSISTENCE is not recognised; ` +
          `falling back to memory-only storage. Expected "persistent" or "memory".`,
      );
    }

    const lockKey = nativeChannel
      ? `aso:native-replica-owner:${nativeChannel.graphId}:${nativeChannel.claimGeneration}`
      : policy.mode === "persistent"
      ? `aso:replica-owner:${key}`
      : `aso:memory-replica:${key}:${crypto.randomUUID()}`;
    let signalOwnershipLost!: () => void;
    const ownershipLost = new Promise<void>((resolve) => {
      signalOwnershipLost = resolve;
    });
    let owner!: ReplicaWorkerOwner<OwnedGraphResource>;
    owner = new ReplicaWorkerOwner({
      locks: browserExclusiveLockManager(),
      lockName: lockKey,
      factory: {
        async open(signal) {
          context.transitionRuntimePhase("opening-replica");
          const pglite = await openPGliteReplica(policy, key);
          const lease = new ReplicaLease({
            store: policy.mode === "memory" ? createMemoryLeaseStore() : createWebLeaseStore(key),
            holder: `${key}#${crypto.randomUUID()}`,
          });
          let stopRenewal: () => void = () => undefined;
          let graphRuntime: ReturnType<typeof startScopedLocalFirstGraph> | null = null;

          try {
            await pglite.waitReady;
            if (signal.aborted) throw new DOMException("Replica opening invalidated", "AbortError");

            let acquired = await lease.acquire();
            while (!acquired.granted) {
              await waitForOwnerRetry(signal);
              acquired = await lease.acquire();
            }
            if (policy.mode === "persistent") {
              stopRenewal = lease.startRenewal(() => {
                signalOwnershipLost();
                owner.requestClose();
              });
            }

            context.transitionRuntimePhase("migrating");
            const schemaSql = `${PGLITE_SCHEMA_SQL}\n${CHECKPOINT_SCHEMA_SQL}`;
            const schemaPlan: ReplicaSchemaPlan = {
              logicalVersion: REPLICA_SCHEMA_VERSION,
              generation: REPLICA_GENERATION,
              migrations: [
                {
                  id: "001-replica-schema",
                  sql: schemaSql,
                  checksum: await migrationChecksum(schemaSql),
                  logicalVersion: 3,
                },
                {
                  id: "002-annotation-types",
                  sql: PGLITE_ANNOTATION_TYPES_SQL,
                  checksum: await migrationChecksum(PGLITE_ANNOTATION_TYPES_SQL),
                  logicalVersion: 4,
                },
                {
                  id: "003-source-hash-wire-format",
                  sql: PGLITE_SOURCE_HASH_SQL,
                  checksum: await migrationChecksum(PGLITE_SOURCE_HASH_SQL),
                  logicalVersion: 5,
                },
                {
                  id: "004-case-summary-publication",
                  sql: PGLITE_CASE_SUMMARY_SQL,
                  checksum: await migrationChecksum(PGLITE_CASE_SUMMARY_SQL),
                  logicalVersion: 6,
                },
                {
                  id: "005-document-status-projection",
                  sql: PGLITE_DOCUMENT_STATUS_SQL,
                  checksum: await migrationChecksum(PGLITE_DOCUMENT_STATUS_SQL),
                  logicalVersion: REPLICA_SCHEMA_VERSION,
                },
              ],
            };
            const migrated = await migrateReplicaSchema(pglite, schemaPlan, lease);
            if (migrated.status === "recovery-required") {
              context.transitionRuntimePhase("recovery-required");
              throw new Error(`Replica schema requires recovery: ${migrated.reason}`);
            }

            context.transitionRuntimePhase("hydrating");
            const persistence = await createPGlitePersistenceAdapter(pglite);
            const storage = { ...persistence, close: async () => undefined };
            const store = createGraphStore();
            graphRuntime = startScopedLocalFirstGraph({
              storage,
              store,
              key,
              persistence: policy.mode === "memory" ? "disabled" : "enabled",
            });
            await graphRuntime.ready;
            const runtime = graphRuntime;
            const closeBackingStore = async () => {
              stopRenewal();
              let teardownError: unknown;
              try {
                await pglite.close();
              } catch (error) {
                teardownError = error;
              }
              try {
                await lease.release();
              } catch (error) {
                teardownError ??= error;
              }
              if (teardownError) throw teardownError;
            };
            if (!materializerEnabled) {
              context.transitionRuntimePhase("offline-limited");
              return {
                pglite,
                store,
                drain: () => runtime.dispose(),
                close: closeBackingStore,
              };
            }
            const generation = await currentGeneration(pglite);
            const projector = await createCommittedReplicaProjector({
              runtime: graphRuntime,
              scopeId: key,
              generation,
              tables: REPLICA_TABLE_BINDINGS,
              lists: REPLICA_LIST_BINDINGS,
            });
            const transport = createFrfShapeTransport({
              gateUrl: requireShapeGatewayUrl({
                VITE_ASO_SHAPE_GATEWAY: import.meta.env.VITE_ASO_SHAPE_GATEWAY,
              }),
              shapes: REPLICA_SHAPES,
            });
            const checkpoints = createPGliteCheckpointStore(pglite);
            context.transitionRuntimePhase("catching-up");
            const continuationAbort = new AbortController();
            const cancelContinuation = () => continuationAbort.abort();
            signal.addEventListener("abort", cancelContinuation, { once: true });
            const continuation = startReplicaContinuation({
              signal: continuationAbort.signal,
              onFailure() {
                signalOwnershipLost();
                owner.requestClose();
              },
              async runOnce() {
                const outcome = await startReplicaRuntime({
                  client: pglite,
                  transport,
                  checkpoints,
                  projector,
                  lease,
                  ownership: "held",
                  leaseLifetime: "caller",
                  signal: continuationAbort.signal,
                  storageKey: key,
                  targets: REPLICA_TARGETS,
                  checkpointShapes: REPLICA_SHAPES.map(({ shape }) => shape),
                  entityTypeFor,
                  onCaughtUp: () => graphRuntime?.markServerCaughtUp(),
                  // The getter reads the latest verified session. A renewal with
                  // the same storage tuple therefore updates expiry without
                  // reopening PGlite, while any tuple change or expiry fences the
                  // captured owner before its next SQL commit.
                  assertAuthority,
                });
                if (outcome.status !== "syncing") {
                  throw new Error(`Replica continuation stopped: ${outcome.status}`);
                }
              },
            });
            await continuation.ready;
            context.transitionRuntimePhase("ready");

            return {
              pglite,
              store,
              async drain() {
                continuationAbort.abort();
                let drainError: unknown;
                try {
                  await continuation.closed;
                } catch (error) {
                  drainError = error;
                }
                try {
                  await runtime.dispose();
                } catch (error) {
                  drainError ??= error;
                }
                signal.removeEventListener("abort", cancelContinuation);
                if (drainError) throw drainError;
              },
              close: closeBackingStore,
            };
          } catch (error) {
            if (!signal.aborted) context.transitionRuntimePhase("recovery-required");
            stopRenewal();
            const cleanup = [pglite.close(), lease.release()];
            if (graphRuntime) cleanup.unshift(graphRuntime.dispose());
            await Promise.allSettled(cleanup);
            throw error;
          }
        },
      },
    });

    const cancelOwner = () => owner.requestClose();
    sessionSignal.addEventListener("abort", cancelOwner, { once: true });
    let claim;
    try {
      claim = await owner.tryOpen();
      while (claim.status === "follower") {
        await waitForOwnerRetry(sessionSignal);
        claim = await owner.tryOpen();
      }
    } catch (error) {
      await owner.close().catch(() => undefined);
      await abandonNativeClaim();
      throw error;
    } finally {
      sessionSignal.removeEventListener("abort", cancelOwner);
    }
    if (claim.status !== "owner" || sessionSignal.aborted) {
      await owner.close().catch(() => undefined);
      await abandonNativeClaim();
      throw new DOMException("Replica opening cancelled", "AbortError");
    }

    let resource!: OwnedGraphResource;
    await owner.withOwner(async (current) => {
      resource = current;
    });
    if (nativeChannel) {
      let hostInvalidated = false;
      let publishFailure: unknown;
      let publishQueue = Promise.resolve();
      void nativeChannel.invalidated.then(() => {
        hostInvalidated = true;
      });
      const enqueueProjection = (store: GraphStore) => {
        publishQueue = publishQueue
          .then(() => nativeChannel.publish(captureNativeGraphProjection(store.getState())))
          .then(() => undefined)
          .catch((error: unknown) => {
            publishFailure ??= error;
            signalOwnershipLost();
            owner.requestClose();
            throw error;
          });
        void publishQueue.catch(() => undefined);
      };
      const unsubscribe = resource.store.subscribe((next, previous) => {
        if (
          next.entities !== previous.entities
          || next.entityStates !== previous.entityStates
          || next.syncMetadata !== previous.syncMetadata
          || next.lists !== previous.lists
        ) {
          enqueueProjection(resource.store);
        }
      });
      enqueueProjection(resource.store);
      try {
        await publishQueue;
      } catch (error) {
        unsubscribe();
        await owner.close().catch(() => undefined);
        await abandonNativeClaim();
        throw error;
      }
      return {
        pglite: fencedPGlite(owner, resource.pglite),
        store: resource.store,
        invalidated: Promise.race([ownershipLost, nativeChannel.invalidated]),
        async dispose() {
          unsubscribe();
          let teardownError: unknown;
          try {
            await publishQueue;
          } catch (error) {
            teardownError = publishFailure ?? error;
          }
          try {
            await owner.close();
          } catch (error) {
            teardownError ??= error;
          }
          if (!hostInvalidated) {
            try {
              await nativeChannel.release();
            } catch (error) {
              teardownError ??= error;
            }
          }
          nativeChannel.close();
          if (teardownError) throw teardownError;
        },
      };
    }
    return {
      pglite: fencedPGlite(owner, resource.pglite),
      store: resource.store,
      invalidated: ownershipLost,
      dispose: () => owner.close(),
    };
  },
});

installPrivateRuntimeQuiescer(() => sessionManager.close());

export interface GraphProviderProps {
  children: ReactNode;
  /** Rendered while the local store is opening. */
  fallback?: ReactNode;
  /** Rendered if the local store cannot be created. */
  onError?: (error: Error) => ReactNode;
}

export function GraphProvider({ children, fallback, onError }: GraphProviderProps) {
  const session = useSession();
  const epoch = useSessionEpoch();
  const { transitionRuntimePhase } = useRuntimeActions();
  const currentSession = useRef<VerifiedSession | null>(session);
  currentSession.current = session;
  const sessionKey = session ? graphStorageKey(session) : null;
  const [runtime, setRuntime] = useState<GraphRuntime | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [ownershipRetry, setOwnershipRetry] = useState(0);

  useEffect(() => {
    if (!sessionKey || !session) return;

    let cancelled = false;
    setRuntime(null);
    setError(null);

    void (async () => {
      try {
        const opened = await sessionManager.open(sessionKey, {
          epoch,
          currentSession: () => currentSession.current,
          transitionRuntimePhase: (phase) => transitionRuntimePhase(phase, epoch),
        });
        if (cancelled) return;
        void opened.closed.then(
          () => {
            if (!cancelled) {
              setRuntime((current) => current?.key === sessionKey ? null : current);
              setOwnershipRetry((attempt) => attempt + 1);
            }
          },
          (cause: unknown) => {
            if (!cancelled) {
              setError(cause instanceof Error ? cause : new Error(String(cause)));
            }
          },
        );
        setRuntime({ key: sessionKey, store: opened.store as GraphStore });
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause : new Error(String(cause)));
        }
      }
    })();

    // A React cleanup is synchronous and cannot await the drain, so it only
    // *starts* the close. The manager retains that promise and the next open()
    // waits on it — which is what stops a disposed session's write from landing
    // in its successor, and what makes StrictMode's mount/unmount/mount yield
    // one runtime rather than two.
    return () => {
      cancelled = true;
      void sessionManager.close().catch(() => undefined);
    };
  }, [epoch, ownershipRetry, sessionKey, transitionRuntimePhase]);

  if (!session) return <>{fallback ?? null}</>;
  if (error) return <>{onError?.(error) ?? null}</>;
  if (!runtime || runtime.key !== sessionKey) return <>{fallback ?? null}</>;

  return <GraphStoreProvider store={runtime.store}>{children}</GraphStoreProvider>;
}
