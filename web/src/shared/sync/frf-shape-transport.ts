/**
 * `ReplicaTransport` over the FRF authorized shape facade (ADR-009).
 *
 * ## Why this is not an ElectricSQL client
 *
 * The request contract is inverted relative to talking to Electric directly.
 * The client does **not** name the table, the columns, or the predicate:
 *
 *   > Gate and the facade derive allowed rows, columns and practice scope
 *   > server-side from verified identity. A client predicate or tenant-scoped
 *   > adapter is useful validation but cannot enforce access against a modified
 *   > client.
 *
 * So a request carries a **shape id** and an opaque cursor, and nothing else.
 * FRF's catalog sets `allowed_params: []` for every ASO shape, which means any
 * extra query parameter is rejected with 400 — including the `table`,
 * `columns` and `where` that `@electric-sql/client`'s `ShapeStream` always
 * sends. That is why this is a hand-written fetch loop rather than that client:
 * the library cannot express a request this narrow.
 *
 * ## What the facade preserves
 *
 * Electric's HTTP protocol, verbatim — status, `electric-handle`,
 * `electric-offset`, `electric-up-to-date`, `electric-must-refetch`, and the
 * message body. So this parses Electric's format while never speaking to
 * Electric.
 *
 * ## Credentials
 *
 * The browser sends its Kratos session cookie; Gate exchanges it for a
 * short-lived audience-bound JWT server-side. This client therefore uses
 * `credentials: "include"` and **never handles a bearer token** — the
 * downstream token is not the browser's to hold.
 */

import type { ReplicaCheckpoint } from "@prometheus-ags/entity-graph-core";

import type { ChunkRow, TableTarget } from "./chunk-writer";
import type { ReplicaRevision, ReplicaTransport } from "./replica-runtime";

/** One Electric protocol message. */
interface ShapeMessage {
  headers?: { operation?: string; control?: string };
  key?: string;
  value?: Record<string, unknown>;
}

export interface FrfShapeTransportOptions {
  /** Gate's base URL. Never Electric's — direct access is not a client path. */
  gateUrl: string;
  /** Catalog shape id → local table target. The order rows are applied in. */
  shapes: ReadonlyArray<{ shape: string; target: TableTarget }>;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
}

/** Raised when the facade refuses the request outright. */
export class ShapeAuthorizationError extends Error {
  constructor(readonly status: 401 | 403) {
    super(
      status === 401
        ? "shape grant expired — the session must be re-established"
        : "shape access forbidden — the grant no longer covers this shape",
    );
    this.name = "ShapeAuthorizationError";
  }
}

/**
 * Build a transport that walks every configured shape once per `fetch` call.
 *
 * One revision carries every shape's rows, so the runtime publishes them in a
 * single graph update — a subscriber never sees a citation whose document has
 * not arrived.
 */
export function createFrfShapeTransport(opts: FrfShapeTransportOptions): ReplicaTransport {
  const doFetch = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const base = opts.gateUrl.replace(/\/+$/, "");

  // Per-shape cursors. The runtime's single checkpoint tracks overall progress;
  // each shape still has its own place in its own stream.
  const cursors = new Map<string, { handle?: string; offset?: string }>();
  let caughtUp = false;

  async function fetchShape(shape: string): Promise<{
    rows: ChunkRow[];
    handle?: string;
    offset?: string;
    upToDate: boolean;
    mustRefetch: boolean;
  }> {
    const cursor = cursors.get(shape) ?? {};
    const params = new URLSearchParams({ shape });
    // Only protocol echoes accompany the shape id. Anything else is narrowing
    // input the catalog does not allow, and returns 400.
    if (cursor.handle) params.set("handle", cursor.handle);
    if (cursor.offset) params.set("offset", cursor.offset);

    const response = await doFetch(`${base}/v1/shape?${params.toString()}`, {
      method: "GET",
      // The Kratos cookie. Gate mints the downstream JWT; the browser never
      // sees or stores it.
      credentials: "include",
      headers: { accept: "application/json" },
    });

    if (response.status === 401) throw new ShapeAuthorizationError(401);
    if (response.status === 403) throw new ShapeAuthorizationError(403);

    // 409 is Electric's must-refetch, preserved by the facade: the history this
    // cursor points into is gone.
    const mustRefetch =
      response.status === 409 || response.headers.get("electric-must-refetch") === "true";

    if (!response.ok && !mustRefetch) {
      throw new Error(`shape ${shape} failed: ${response.status} ${response.statusText}`);
    }

    const handle = response.headers.get("electric-handle") ?? undefined;
    const offset = response.headers.get("electric-offset") ?? undefined;
    const upToDate = response.headers.get("electric-up-to-date") !== null;

    if (mustRefetch) {
      // Drop the cursor; the caller restarts this shape from cold.
      cursors.delete(shape);
      return { rows: [], handle, offset, upToDate: false, mustRefetch: true };
    }

    const body: unknown = await response.json().catch(() => []);
    const messages: ShapeMessage[] = Array.isArray(body) ? (body as ShapeMessage[]) : [];

    const rows: ChunkRow[] = [];
    for (const message of messages) {
      // Control messages (up-to-date, must-refetch) carry no row.
      if (message.headers?.control !== undefined) continue;
      if (!message.value) continue;
      // Deletes are not applied here: the replica is rebuilt on must-refetch
      // rather than reconciled, and a delete arriving mid-stream would need a
      // removal path the writer deliberately does not have.
      if (message.headers?.operation === "delete") continue;
      rows.push(message.value);
    }

    cursors.set(shape, { handle, offset });
    return { rows, handle, offset, upToDate, mustRefetch: false };
  }

  return {
    async fetch(from: ReplicaCheckpoint | null): Promise<ReplicaRevision | null> {
      // A cold start (or a post-rebuild restart) resets every shape's cursor.
      if (from === null && caughtUp) {
        cursors.clear();
        caughtUp = false;
      }
      if (caughtUp) return null;

      const tables: Array<{ target: TableTarget; rows: readonly ChunkRow[] }> = [];
      let handle = from?.handle ?? "";
      let offset = from?.offset ?? "-1";
      let allUpToDate = true;

      for (const { shape, target } of opts.shapes) {
        const result = await fetchShape(shape);

        if (result.mustRefetch) {
          // Surface it immediately. The runtime rebuilds and restarts cold, so
          // there is no point fetching the remaining shapes into a replica
          // that is about to be cleared.
          cursors.clear();
          caughtUp = false;
          return { tables: [], checkpoint: { handle: result.handle ?? handle, offset }, mustRefetch: true };
        }

        if (result.rows.length > 0) tables.push({ target, rows: result.rows });
        if (result.handle) handle = result.handle;
        if (result.offset) offset = result.offset;
        if (!result.upToDate) allUpToDate = false;
      }

      // Every shape reported up-to-date and nothing new arrived: caught up.
      if (allUpToDate && tables.length === 0) {
        caughtUp = true;
        return null;
      }

      return { tables, checkpoint: { handle, offset } };
    },
  };
}
