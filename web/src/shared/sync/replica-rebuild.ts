/**
 * Rebuilding a replica generation.
 *
 * ── When this runs ──────────────────────────────────────────────────────────
 *
 * Two triggers, both meaning "what you have on disk cannot be trusted":
 *
 * 1. **Electric's must-refetch.** The server says the shape's history is gone —
 *    the handle expired, or the shape was recomputed. Offsets held locally refer
 *    to a stream that no longer exists.
 * 2. **A rejected resume.** PEM's `evaluateResume` refused the stored
 *    checkpoint: no checkpoint at all, a stale generation, or a changed handle.
 *
 * ── Remove, do not merge ────────────────────────────────────────────────────
 *
 * ADR-009 is explicit that a rebuild removes stale rows rather than merging a
 * new snapshot into old data. Merging looks appealing — it avoids a visible
 * empty state — but it leaves rows that are no longer present upstream sitting
 * in local storage with nothing to ever delete them. A row that was deleted
 * server-side simply never arrives in the new snapshot, so a merge preserves it
 * forever.
 *
 * This carries G3's rebuild half. c003 delivered the commit half (rows and
 * checkpoint landing together) and deliberately left this here, because it needs
 * a chunk consumer and none existed until now.
 *
 * ADR-009 G3/G4 (flint-realtime-fabric).
 */
import { truncateTarget, type TableTarget, type WriterClient } from "./chunk-writer";
import { bumpGeneration, type LedgerClient } from "./migration-ledger";

/** Why a rebuild was started. Recorded so diagnostics can tell them apart. */
export type RebuildTrigger =
  /** Electric returned must-refetch (HTTP 409 / electric-must-refetch). */
  | "must-refetch"
  /** The stored checkpoint did not describe the stored rows. */
  | "resume-rejected";

export interface RebuildResult {
  trigger: RebuildTrigger;
  /** The generation the replica is on *after* the rebuild. */
  generation: number;
  /** Tables whose rows were removed. */
  cleared: string[];
}

/**
 * Discard a generation and start the next.
 *
 * Order matters and is not arbitrary:
 *
 * 1. **Bump the generation first.** If the process dies mid-rebuild, a bumped
 *    generation with stale rows still present is *safe* — every checkpoint from
 *    the old generation is now recognisably stale, so the next start rebuilds
 *    again. Clearing first and dying before the bump would leave an empty
 *    replica that still claims the old generation, and a resume would accept it.
 * 2. **Then clear.** Each target is emptied, not reconciled.
 *
 * The caller re-fetches from a cold cursor afterwards; this function does not
 * fetch, so it can be tested without a transport.
 */
export async function rebuildGeneration(
  client: WriterClient & LedgerClient,
  targets: readonly TableTarget[],
  trigger: RebuildTrigger,
): Promise<RebuildResult> {
  // Fail-safe ordering — see above.
  const generation = await bumpGeneration(client);

  const cleared: string[] = [];
  for (const target of targets) {
    await truncateTarget(client, target);
    cleared.push(target.table);
  }

  return { trigger, generation, cleared };
}

/**
 * Should this response trigger a rebuild?
 *
 * Pure, so the decision is testable without a server. `mustRefetch` is the
 * facade's signal (FRF maps Electric's 409 to `electric-must-refetch`);
 * `resumeRejected` is `evaluateResume` having refused the stored checkpoint.
 */
export function rebuildTrigger(input: {
  mustRefetch?: boolean;
  resumeRejected?: boolean;
}): RebuildTrigger | null {
  // must-refetch wins when both are true: it is the stronger statement, since
  // the server is asserting the history is gone rather than the client merely
  // being unable to place itself in it.
  if (input.mustRefetch) return "must-refetch";
  if (input.resumeRejected) return "resume-rejected";
  return null;
}
