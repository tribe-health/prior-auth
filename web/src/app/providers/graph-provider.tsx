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
        startLocalFirstGraph({ storage, store, key: `aso:${session.practiceId}` });

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
