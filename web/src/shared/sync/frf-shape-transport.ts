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

import { CHUNK_ROW_OPERATION, type ChunkRow, type TableTarget } from "./chunk-writer";
import {
  ReplicaAuthorityFailure,
  type ReplicaCheckpointSet,
  type ReplicaRevision,
  type ReplicaTransport,
  type ShapeCheckpoint,
} from "./replica-runtime";

/** One Electric protocol message. */
interface ShapeMessage {
  headers?: { operation?: string; control?: string };
  key?: string;
  value?: Record<string, unknown>;
}

function withOperation(
  value: Record<string, unknown>,
  operation: "insert" | "update",
): ChunkRow {
  const row: ChunkRow = { ...value };
  Object.defineProperty(row, CHUNK_ROW_OPERATION, { value: operation });
  return row;
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
export class ShapeAuthorizationError extends ReplicaAuthorityFailure {
  constructor(
    readonly status: 204 | 401 | 403,
    readonly shape?: string,
  ) {
    super(
      `${shape ? `shape ${shape}: ` : ""}${status === 204
        ? "Replica authority could not be revalidated before the response deadline."
        : status === 401
        ? "shape grant expired — the session must be re-established"
        : "shape access forbidden — the grant no longer covers this shape"}`,
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

  // Per-shape cursors. No aggregate offset can describe independent streams.
  const cursors = new Map<string, { handle?: string; offset?: string }>();
  const coldBuffers = new Map<string, Map<string, ChunkRow>>();
  const coldCompleted = new Map<string, ChunkRow[]>();
  let initialized = false;
  // A bounded runtime pass ends after one complete up-to-date revision. The
  // next owner-lifetime pass must issue a fresh authorized continuation
  // request, so completion is consumed once rather than becoming terminal.
  let passComplete = false;

  function resetPass(): void {
    cursors.clear();
    coldBuffers.clear();
    coldCompleted.clear();
    initialized = false;
    passComplete = false;
  }

  async function fetchShape(shape: string, target: TableTarget, signal?: AbortSignal): Promise<{
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
      signal,
    });

    if (response.status === 204) throw new ShapeAuthorizationError(204, shape);
    if (response.status === 401 || response.status === 403) {
      throw new ShapeAuthorizationError(response.status, shape);
    }

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

    const body: unknown = await response.json();
    if (!Array.isArray(body)) throw new Error(`shape ${shape} returned a non-array payload`);
    const messages = body as ShapeMessage[];

    let rows: ChunkRow[] = [];
    let sawDelete = false;
    const deletedKeys = new Set<string>();
    const coldBuffer = coldBuffers.get(shape);
    for (const message of messages) {
      // Control messages (up-to-date, must-refetch) carry no row.
      if (message.headers?.control !== undefined) continue;
      if (message.headers?.operation === "delete") {
        sawDelete = true;
        const valueId = message.value?.[target.idColumn ?? "id"];
        let deletedId: string | undefined;
        if (typeof valueId === "string") {
          deletedId = valueId;
        } else if (message.key) {
          const qualified = message.key.match(/\/"([^"]+)"$/);
          deletedId = qualified?.[1] ?? message.key;
        }
        if (deletedId !== undefined) {
          deletedKeys.add(deletedId);
          coldBuffer?.delete(deletedId);
        }
        continue;
      }
      if (!message.value) continue;
      if (coldBuffer) {
        const id = String(message.value[target.idColumn ?? "id"]);
        const existing = coldBuffer.get(id);
        if (message.headers?.operation === "update" && !existing) {
          throw new Error(`shape ${shape} updated missing cold row ${id}`);
        }
        coldBuffer.set(id, withOperation({ ...existing, ...message.value }, "insert"));
      } else {
        rows.push(withOperation(
          message.value,
          message.headers?.operation === "update" ? "update" : "insert",
        ));
      }
    }

    const next = {
      handle: handle ?? cursor.handle,
      offset: offset ?? cursor.offset,
    };
    if (!next.handle || !next.offset) {
      throw new Error(`shape ${shape} returned no resumable handle and offset`);
    }
    cursors.set(shape, next);

    if (coldBuffer) {
      if (upToDate) {
        coldCompleted.set(shape, [...coldBuffer.values()]);
        coldBuffers.delete(shape);
      }
      return { rows: [], handle: next.handle, offset: next.offset, upToDate, mustRefetch: false };
    }

    if (sawDelete && cursor.handle && !coldBuffer) {
      cursors.delete(shape);
      return { rows: [], handle, offset, upToDate: false, mustRefetch: true };
    }
    if (deletedKeys.size > 0) {
      rows = rows.filter((row) => !deletedKeys.has(String(row[target.idColumn ?? "id"])))
    }
    return { rows, handle: next.handle, offset: next.offset, upToDate, mustRefetch: false };
  }

  return {
    async fetch(from: ReplicaCheckpointSet | null, signal?: AbortSignal): Promise<ReplicaRevision | null> {
      if (!initialized) {
        cursors.clear();
        coldBuffers.clear();
        coldCompleted.clear();
        for (const { shape } of opts.shapes) {
          const cursor = from?.shapes[shape];
          if (cursor) cursors.set(shape, cursor);
          else coldBuffers.set(shape, new Map());
        }
        initialized = true;
        passComplete = false;
      }
      if (passComplete) {
        passComplete = false;
        return null;
      }

      for (;;) {
        const tables: Array<{ shape: string; target: TableTarget; rows: readonly ChunkRow[] }> = [];
        const checkpoint: Record<string, ShapeCheckpoint> = {};
        let allUpToDate = true;

        // Electric requests can long-poll. Starting every independent shape
        // together keeps one quiet shape from delaying changes on all later
        // shapes in the same committed pass.
        const passAbort = new AbortController();
        const abortFromCaller = () => passAbort.abort(signal?.reason);
        if (signal?.aborted) abortFromCaller();
        else signal?.addEventListener("abort", abortFromCaller, { once: true });
        const requests = opts.shapes.map(async ({ shape, target }) => ({
          shape,
          target,
          result: coldCompleted.has(shape)
            ? null
            : await fetchShape(shape, target, passAbort.signal),
        }));
        let results: Awaited<(typeof requests)[number]>[];
        try {
          results = await Promise.all(requests);
        } catch (cause) {
          passAbort.abort(cause);
          await Promise.allSettled(requests);
          resetPass();
          throw cause;
        } finally {
          signal?.removeEventListener("abort", abortFromCaller);
        }

        if (results.some(({ result }) => result?.mustRefetch)) {
          // Surface it immediately. The runtime rebuilds and restarts cold, so
          // there is no point applying any rows fetched into a replica that is
          // about to be cleared.
          resetPass();
          return { tables: [], checkpoint: {}, mustRefetch: true };
        }

        for (const { shape, target, result } of results) {
          if (result === null) {
            const cursor = cursors.get(shape)!;
            checkpoint[shape] = { handle: cursor.handle!, offset: cursor.offset! };
            continue;
          }
          if (result.rows.length > 0) tables.push({ shape, target, rows: result.rows });
          checkpoint[shape] = { handle: result.handle!, offset: result.offset! };
          if (!result.upToDate) allUpToDate = false;
        }

        if (coldBuffers.size > 0) continue;
        if (coldCompleted.size > 0) {
          tables.splice(0, tables.length, ...opts.shapes.map(({ shape, target }) => ({
            shape,
            target,
            rows: coldCompleted.get(shape) ?? [],
          })));
          for (const { shape } of opts.shapes) {
            const cursor = cursors.get(shape)!;
            checkpoint[shape] = { handle: cursor.handle!, offset: cursor.offset! };
          }
          coldCompleted.clear();
          allUpToDate = true;
        }
        if (allUpToDate) passComplete = true;

        return { tables, checkpoint };
      }
    },
  };
}
