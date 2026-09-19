/**
 * Where the local replica is allowed to live.
 *
 * ADR-009's platform-storage row is the constraint:
 *
 *   > Persistent IndexedDB only where device policy permits; unmanaged/shared
 *   > use is memory-only. No silent runtime fallback changes storage or
 *   > inference lanes.
 *
 * Two consequences shape this module.
 *
 * **Persistence is opt-in, never inferred.** A replica on disk is protected
 * health information at rest on a machine this application does not control. A
 * shared clinic workstation is the normal case, not the edge case, so the
 * default has to be the safe one. Anything other than an explicit, recognised
 * opt-in resolves to memory.
 *
 * **There is no silent fallback.** An unrecognised value is not quietly treated
 * as "probably memory" — it is reported as a misconfiguration alongside the
 * memory decision, so a deployment that meant to persist and typed the value
 * wrongly finds out rather than silently running ephemeral.
 */

/** The resolved decision, and what produced it. */
export interface StoragePolicy {
  mode: "persistent" | "memory";
  /** Why this mode was chosen — surfaced in diagnostics, never inferred from. */
  reason:
    | "explicit-persistent"
    | "explicit-memory"
    | "unset-defaults-to-memory"
    | "unrecognised-defaults-to-memory";
  /** True when the configured value was not understood. */
  misconfigured: boolean;
}

const PERSISTENT = "persistent";
const MEMORY = "memory";

/**
 * Resolve the storage policy from a configured value.
 *
 * Takes the raw value rather than reading `import.meta.env` directly so the
 * decision is testable without a bundler, and so the single place that reads
 * configuration is visible at the call site.
 */
export function resolveStoragePolicy(configured: string | undefined | null): StoragePolicy {
  if (configured === undefined || configured === null || configured.trim() === "") {
    return { mode: MEMORY, reason: "unset-defaults-to-memory", misconfigured: false };
  }

  const normalised = configured.trim().toLowerCase();
  if (normalised === PERSISTENT) {
    return { mode: PERSISTENT, reason: "explicit-persistent", misconfigured: false };
  }
  if (normalised === MEMORY) {
    return { mode: MEMORY, reason: "explicit-memory", misconfigured: false };
  }

  // Deliberately not a throw: refusing to start is a worse failure than running
  // safely and reporting it. But it is flagged, because a deployment that
  // intended persistence and mistyped the value must not silently run
  // ephemeral and appear to work.
  return { mode: MEMORY, reason: "unrecognised-defaults-to-memory", misconfigured: true };
}

/**
 * Refuse the only configuration that could durably materialize the current
 * clinical projection. The experimental materializer is qualified for the
 * in-memory browser runtime only; persistent clinical data remains blocked
 * until the G-DATA decision approves its durable projection.
 */
export function assertMaterializerStoragePolicy(
  policy: StoragePolicy,
  materializerEnabled: boolean,
): void {
  if (materializerEnabled && policy.mode === PERSISTENT) {
    throw new Error(
      "The experimental clinical materializer is approved only for memory-only qualification.",
    );
  }
}

/**
 * The PGlite data directory for a policy.
 *
 * `undefined` means in-memory — PGlite's own default when constructed with no
 * argument. A persistent replica is namespaced by the storage key, so two
 * principals or practices on one browser never share a database file.
 */
export function pgliteDataDir(policy: StoragePolicy, storageKey: string): string | undefined {
  return policy.mode === PERSISTENT ? `idb://${storageKey}` : undefined;
}
