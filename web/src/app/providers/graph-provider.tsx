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
const REPLICA_GENERATION = 1;

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
 * Authorization-scope revision is **not** yet a component: `VerifiedSession`
 * carries `capabilities` but no revision counter to key on. Recorded in
 * `docs/architecture/frf-shape-facade-integration.md` as an open item rather
 * than approximated by hashing the capability list, which would churn the
 * namespace on unrelated changes.
 */
export function graphStorageKey(session: VerifiedSession): string {
  return [
    "aso",
    `g${REPLICA_GENERATION}`,
    session.principal,
    session.practiceId,
    session.identityId,
  ].join(":");
}

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
    let opened: PGlite | null = null;

    void (async () => {
      try {
        // In-memory for now. A persisted store (idb://) survives reloads and
        // is the point of local-first — but it also means PHI at rest in the
        // browser, which is a decision this phase has not taken. Deliberately
        // ephemeral until it is.
        const pglite = new PGlite();
        opened = pglite;
        await pglite.exec(PGLITE_SCHEMA_SQL);

        const storage = await createPGlitePersistenceAdapter(pglite);
        const store = createGraphStore();
        startLocalFirstGraph({ storage, store, key: graphStorageKey(session) });

        if (cancelled) {
          void pglite.close();
          return;
        }
        setRuntime({ store, pglite });
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause : new Error(String(cause)));
        }
      }
    })();

    return () => {
      cancelled = true;
      void opened?.close();
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
