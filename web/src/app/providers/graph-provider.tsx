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
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { PGlite } from "@electric-sql/pglite";
import {
  GraphStoreProvider,
  createGraphStore,
  createPGlitePersistenceAdapter,
  startLocalFirstGraph,
} from "@prometheus-ags/entity-graph-react";

import { PGLITE_SCHEMA_SQL } from "@/shared/sync/pglite-schema";
import type { VerifiedSession } from "@/shared/model/session";
import { GraphSessionManager } from "@/shared/sync/graph-session-manager";
import { createFrfShapeTransport } from "@/shared/sync/frf-shape-transport";
import { createWebLeaseStore } from "@/shared/sync/lease-store-web";
import { ensureLedger } from "@/shared/sync/migration-ledger";
import { ReplicaLease } from "@/shared/sync/replica-owner";
import { startReplicaRuntime } from "@/shared/sync/replica-runtime";
import {
  CHECKPOINT_SCHEMA_SQL,
  REPLICA_SHAPES,
  REPLICA_TARGETS,
  createPGliteCheckpointStore,
  entityTypeFor,
} from "@/shared/sync/replica-wiring";
import { pgliteDataDir, resolveStoragePolicy } from "@/shared/sync/storage-policy";

/**
 * Gate's base URL — the only endpoint the browser talks to for shapes.
 *
 * Deliberately *not* Electric's URL. ADR-009 restricts direct Electric access
 * to an operator-loopback diagnostic and never a client path, so pointing this
 * at Electric would bypass the authorization boundary entirely.
 *
 * Unset means no sync: the replica opens and reads whatever it already holds.
 * That is the correct default for a build that has not been given a gateway,
 * and it fails visibly rather than silently reaching for an unauthorized path.
 */
const FACADE_URL: string | undefined = import.meta.env.VITE_ASO_SHAPE_GATEWAY;
import { useSession } from "./session-provider";

type GraphStore = ReturnType<typeof createGraphStore>;

interface GraphRuntime {
  store: GraphStore;
  pglite: PGlite;
}

/**
 * The local store handle.
 *
 * Feature API modules read through this; they never open their own PGlite.
 * A second instance would be a second database with the same name and
 * different contents — the drift ADR-001 exists to prevent, one layer down.
 */
const LocalStoreContext = createContext<PGlite | null>(null);

/** The local store, or null before it has opened. */
export function useLocalStore(): PGlite | null {
  return useContext(LocalStoreContext);
}

/** Bumped when the local schema changes shape; old namespaces are then dead. */
const REPLICA_GENERATION = 3;

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
export function graphStorageKey(session: VerifiedSession): string {
  return [
    "aso",
    `g${REPLICA_GENERATION}`,
    session.principal,
    session.practiceId,
    session.identityId,
    session.sessionId,
    session.authorizationRevision,
  ].join(":");
}

/**
 * The one manager for this app.
 *
 * Module-level because the ownership guarantee is process-wide: two managers
 * would each believe they held the only runtime, which is the problem this
 * solves. Its factory is what actually opens PGlite and starts the graph.
 */
const sessionManager = new GraphSessionManager({
  async open(key: string) {
    // Storage is a deployment decision, not a default. ADR-009: "Persistent
    // IndexedDB only where device policy permits; unmanaged/shared use is
    // memory-only. No silent runtime fallback changes storage." An unset or
    // unrecognised value therefore resolves to memory — a shared clinic
    // workstation is the assumption until a deployment states otherwise.
    //
    // The data directory is namespaced by `key`, which already composes
    // generation, principal, practice and identity, so two clinicians on one
    // browser never share a replica.
    const policy = resolveStoragePolicy(import.meta.env.VITE_ASO_REPLICA_PERSISTENCE);
    if (policy.misconfigured) {
      // Loud, because a deployment that meant to persist and mistyped the value
      // would otherwise run ephemeral and appear to work.
      console.error(
        `[replica] VITE_ASO_REPLICA_PERSISTENCE is not recognised; ` +
          `falling back to memory-only storage. Expected "persistent" or "memory".`,
      );
    }

    const dataDir = pgliteDataDir(policy, key);
    const pglite = dataDir ? new PGlite(dataDir) : new PGlite();

    // Exactly one context may migrate a persisted replica. Two tabs both hold
    // handles to the same IndexedDB database and both would apply DDL, so the
    // lease is taken before the schema is touched.
    //
    // Losing is not an error. A passenger tab reads the replica the owner
    // maintains — blocking its reads would make a background tab appear broken
    // for no safety gain (ADR-009).
    const lease = new ReplicaLease({
      store: createWebLeaseStore(key),
      holder: `${key}#${crypto.randomUUID()}`,
    });
    const owns = policy.mode === "memory" ? true : (await lease.acquire()).granted;

    // An in-memory replica is private to this tab, so there is nothing to
    // contend over and the schema always applies. A persisted one applies it
    // only when this tab owns the lease; the owner has already created it, or
    // is about to.
    if (owns) {
      await pglite.exec(PGLITE_SCHEMA_SQL);
      await pglite.exec(CHECKPOINT_SCHEMA_SQL);
      await ensureLedger(pglite);
    }

    const storage = await createPGlitePersistenceAdapter(pglite);
    const store = createGraphStore();
    const runtime = startLocalFirstGraph({ storage, store, key });

    // Sync reads through the FRF authorized shape facade (ADR-009). The client
    // names a shape id and echoes an opaque cursor; rows, columns and practice
    // scope are derived server-side from verified identity, so a modified
    // client cannot widen its own grant.
    //
    // Only the lease owner syncs. A passenger tab reads what the owner writes.
    // Failures are surfaced, not thrown: a replica that cannot reach the
    // facade is stale, not broken, and the UI still renders what it has.
    if (owns && FACADE_URL) {
      void startReplicaRuntime({
        client: pglite,
        transport: createFrfShapeTransport({
          gateUrl: FACADE_URL,
          shapes: REPLICA_SHAPES,
        }),
        checkpoints: createPGliteCheckpointStore(pglite),
        graph: store as never,
        lease,
        storageKey: key,
        targets: REPLICA_TARGETS,
        entityTypeFor,
      }).catch((cause: unknown) => {
        console.error("[replica] sync stopped", cause);
      });
    }

    return {
      pglite,
      store,
      // Drain the graph's in-flight persistence BEFORE closing the database
      // underneath it. Closing first would fail those writes rather than
      // letting them settle.
      async dispose() {
        await runtime.dispose();
        await pglite.close();
        // Release last. Holding the lease past teardown would make the next tab
        // wait out the TTL for a replica nobody is using — and a release before
        // the database is closed could let a successor migrate underneath a
        // still-open handle.
        if (owns) await lease.release().catch(() => undefined);
      },
    };
  },
});

export interface GraphProviderProps {
  children: ReactNode;
  /** Rendered while the local store is opening. */
  fallback?: ReactNode;
  /** Rendered if the local store cannot be created. */
  onError?: (error: Error) => ReactNode;
}

export function GraphProvider({ children, fallback, onError }: GraphProviderProps) {
  const session = useSession();
  const [runtime, setRuntime] = useState<GraphRuntime | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!session) return;

    let cancelled = false;

    void (async () => {
      try {
        const opened = await sessionManager.open(graphStorageKey(session));
        if (cancelled) return;
        setRuntime({ store: opened.store as GraphStore, pglite: opened.pglite });
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
      void sessionManager.close();
    };
  }, [session]);

  if (!session) return <>{fallback ?? null}</>;
  if (error) return <>{onError?.(error) ?? null}</>;
  if (!runtime) return <>{fallback ?? null}</>;

  return (
    <LocalStoreContext value={runtime.pglite}>
      <GraphStoreProvider store={runtime.store}>{children}</GraphStoreProvider>
    </LocalStoreContext>
  );
}
