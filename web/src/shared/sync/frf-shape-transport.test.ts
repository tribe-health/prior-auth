/**
 * The request contract is the thing worth testing.
 *
 * FRF's catalog sets `allowed_params: []` for every ASO shape, so any parameter
 * beyond the shape id and the protocol cursor is a 400. These assert what the
 * client sends — and just as importantly, what it does not.
 */
import { describe, expect, it, vi } from "vitest";

import { createFrfShapeTransport } from "./frf-shape-transport";
import { CHUNK_ROW_OPERATION, type TableTarget } from "./chunk-writer";

const cases: TableTarget = {
  table: "cases",
  columns: ["id", "practice_id", "status"],
};

/** Build a Response with Electric's protocol headers. */
function shapeResponse(
  messages: unknown[],
  headers: Record<string, string> = {},
  status = 200,
): Response {
  return new Response(JSON.stringify(messages), {
    status,
    headers: { "content-type": "application/json", ...upToDate, ...headers },
  });
}

const upToDate = { "electric-up-to-date": "", "electric-handle": "h1", "electric-offset": "5" };

function transport(fetchImpl: typeof fetch) {
  return createFrfShapeTransport({
    gateUrl: "https://gate.example",
    shapes: [{ shape: "cases", target: cases }],
    fetchImpl,
  });
}

describe("createFrfShapeTransport", () => {
  it("sends only the shape id on a cold start", async () => {
    // No table, no columns, no where. The catalog rejects all three.
    const fetchImpl = vi.fn(async () => shapeResponse([], upToDate));
    await transport(fetchImpl as unknown as typeof fetch).fetch(null);

    const url = new URL((fetchImpl.mock.calls[0] as unknown as [string])[0]);
    expect(url.pathname).toBe("/v1/shape");
    expect([...url.searchParams.keys()]).toEqual(["shape"]);
    expect(url.searchParams.get("shape")).toBe("cases");
  });

  it("never sends table, columns or where", async () => {
    // The three parameters a direct-Electric client always sends, and the three
    // the facade exists to stop the client from choosing.
    const fetchImpl = vi.fn(async () =>
      shapeResponse([{ headers: { operation: "insert" }, value: { id: "c1" } }], upToDate),
    );
    const t = transport(fetchImpl as unknown as typeof fetch);
    await t.fetch(null);
    await t.fetch({ generation: 1, shapes: { cases: { handle: "h1", offset: "5" } } });

    for (const call of fetchImpl.mock.calls) {
      const url = new URL((call as unknown as [string])[0]);
      for (const forbidden of ["table", "columns", "where"]) {
        expect(url.searchParams.has(forbidden), `${forbidden} must not be sent`).toBe(false);
      }
    }
  });

  it("carries the Kratos cookie and never a bearer token", async () => {
    // Gate exchanges the cookie for a short-lived JWT server-side. A browser
    // holding that token would defeat the point of keeping it server-side.
    const fetchImpl = vi.fn(async () => shapeResponse([], upToDate));
    await transport(fetchImpl as unknown as typeof fetch).fetch(null);

    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.credentials).toBe("include");
    const headers = (init.headers ?? {}) as Record<string, string>;
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain("authorization");
  });

  it("echoes handle and offset once it has them", async () => {
    const fetchImpl = vi.fn(async () =>
      shapeResponse([{ headers: { operation: "insert" }, value: { id: "c1" } }], {
        "electric-handle": "h9",
        "electric-offset": "42",
      }),
    );
    const t = transport(fetchImpl as unknown as typeof fetch);
    await t.fetch({ generation: 1, shapes: { cases: { handle: "h9", offset: "42" } } });

    const request = new URL((fetchImpl.mock.calls[0] as unknown as [string])[0]);
    expect(request.searchParams.get("handle")).toBe("h9");
    expect(request.searchParams.get("offset")).toBe("42");
  });

  it("resumes each shape from its own opaque checkpoint", async () => {
    const fetchImpl = vi.fn(async () => shapeResponse([], upToDate));
    const t = createFrfShapeTransport({
      gateUrl: "https://gate.example",
      shapes: [
        { shape: "cases", target: cases },
        { shape: "document_statuses", target: { table: "document_statuses", columns: ["id"] } },
      ],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await t.fetch({
      generation: 1,
      shapes: {
        cases: { handle: "cases-h", offset: "11" },
        document_statuses: { handle: "document_statuses-h", offset: "29" },
      },
    });

    const [caseUrl, documentUrl] = fetchImpl.mock.calls.map((call) =>
      new URL((call as unknown as [string])[0]));
    expect(caseUrl.searchParams.get("handle")).toBe("cases-h");
    expect(caseUrl.searchParams.get("offset")).toBe("11");
    expect(documentUrl.searchParams.get("handle")).toBe("document_statuses-h");
    expect(documentUrl.searchParams.get("offset")).toBe("29");
  });

  it("starts independent shape polls concurrently", async () => {
    const releases = new Map<string, () => void>();
    const fetchImpl = vi.fn((input: string | URL | Request) => {
      const shape = new URL(String(input)).searchParams.get("shape")!;
      return new Promise<Response>((resolve) => {
        releases.set(shape, () => resolve(shapeResponse([], upToDate)));
      });
    });
    const t = createFrfShapeTransport({
      gateUrl: "https://gate.example",
      shapes: [
        { shape: "cases", target: cases },
        { shape: "document_statuses", target: { table: "document_statuses", columns: ["id"] } },
      ],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const pending = t.fetch({
      generation: 1,
      shapes: {
        cases: { handle: "cases-h", offset: "11" },
        document_statuses: { handle: "document_statuses-h", offset: "29" },
      },
    });
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));
    releases.get("cases")!();
    releases.get("document_statuses")!();
    await pending;
  });

  it("aborts sibling polls and restarts cold after one shape fails", async () => {
    let firstPass = true;
    let siblingAborted = false;
    const urls: URL[] = [];
    const fetchImpl = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      urls.push(url);
      if (!firstPass) return Promise.resolve(shapeResponse([], upToDate));
      if (url.searchParams.get("shape") === "cases") {
        return Promise.reject(new Error("interrupted cases body"));
      }
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          siblingAborted = true;
          reject(init.signal?.reason);
        }, { once: true });
      });
    });
    const t = createFrfShapeTransport({
      gateUrl: "https://gate.example",
      shapes: [
        { shape: "cases", target: cases },
        { shape: "document_statuses", target: { table: "document_statuses", columns: ["id"] } },
      ],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(t.fetch(null)).rejects.toThrow("interrupted cases body");
    expect(siblingAborted).toBe(true);
    firstPass = false;
    await expect(t.fetch(null)).resolves.toBeTruthy();

    expect(urls).toHaveLength(4);
    for (const url of urls.slice(2)) {
      expect(url.searchParams.has("handle")).toBe(false);
      expect(url.searchParams.has("offset")).toBe(false);
    }
  });

  it("returns rows from insert messages", async () => {
    const fetchImpl = vi.fn(async () =>
      shapeResponse(
        [
          { headers: { operation: "insert" }, value: { id: "c1", status: "open" } },
          { headers: { operation: "insert" }, value: { id: "c2", status: "open" } },
          { headers: { operation: "update" }, value: { id: "c2", status: "closed" } },
        ],
        upToDate,
      ),
    );
    const revision = await transport(fetchImpl as unknown as typeof fetch).fetch(null);
    expect(revision?.tables[0]?.rows).toHaveLength(2);
  });

  it("forces a rebuild when a delete arrives", async () => {
    const fetchImpl = vi.fn(async () =>
      shapeResponse([{ headers: { operation: "delete" }, key: "c1" }], upToDate),
    );

    const revision = await transport(fetchImpl as unknown as typeof fetch).fetch({
      generation: 1,
      shapes: { cases: { handle: "h1", offset: "4" } },
    });
    expect(revision).toMatchObject({ mustRefetch: true, tables: [] });
  });

  it("accepts a cold snapshot that includes historical delete frames", async () => {
    const fetchImpl = vi.fn(async () =>
      shapeResponse([
        { headers: { operation: "insert" }, value: { id: "c1", status: "closed" } },
        { headers: { operation: "insert" }, value: { id: "c2", status: "open" } },
        {
          headers: { operation: "delete" },
          key: "\"fixture\".\"cases\"/\"c1\"",
          value: { id: "c1", status: "closed" },
        },
      ], upToDate),
    );

    const revision = await transport(fetchImpl as unknown as typeof fetch).fetch(null);
    expect(revision?.mustRefetch).toBeUndefined();
    expect(revision?.tables[0]?.rows).toEqual([{ id: "c2", status: "open" }]);
  });

  it("preserves delete, reinsert, update, and delete order in one cold response", async () => {
    const fetchImpl = vi.fn(async () =>
      shapeResponse([
        { headers: { operation: "insert" }, value: { id: "c1", status: "old", practice_id: "p1" } },
        { headers: { operation: "delete" }, value: { id: "c1" } },
        { headers: { operation: "insert" }, value: { id: "c1", status: "new" } },
        { headers: { operation: "insert" }, value: { id: "c2", status: "open" } },
        { headers: { operation: "update" }, value: { id: "c2", status: "closed" } },
        { headers: { operation: "delete" }, value: { id: "c2" } },
      ], upToDate),
    );

    const revision = await transport(fetchImpl as unknown as typeof fetch).fetch(null);
    expect(revision?.tables[0]?.rows).toEqual([{ id: "c1", status: "new" }]);
    expect(revision?.tables[0]?.rows[0]?.[CHUNK_ROW_OPERATION]).toBe("insert");
  });

  it("rejects an update after delete until an insert recreates the cold row", async () => {
    const fetchImpl = vi.fn(async () =>
      shapeResponse([
        { headers: { operation: "insert" }, value: { id: "c1", status: "open" } },
        { headers: { operation: "delete" }, value: { id: "c1" } },
        { headers: { operation: "update" }, value: { id: "c1", status: "closed" } },
      ], upToDate),
    );

    await expect(
      transport(fetchImpl as unknown as typeof fetch).fetch(null),
    ).rejects.toThrow("shape cases updated missing cold row c1");
  });

  it("folds a paginated cold snapshot before publishing it", async () => {
    const first = shapeResponse([
      { headers: { operation: "insert" }, value: { id: "c1", status: "open" } },
      { headers: { operation: "insert" }, value: { id: "c2", status: "open" } },
    ], { "electric-handle": "h1", "electric-offset": "4" });
    first.headers.delete("electric-up-to-date");
    const second = shapeResponse([
      { headers: { operation: "update" }, value: { id: "c2", status: "closed" } },
      { headers: { operation: "delete" }, value: { id: "c1" } },
    ], { "electric-handle": "h1", "electric-offset": "6" });
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);

    const revision = await transport(fetchImpl as unknown as typeof fetch).fetch(null);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(revision?.tables[0]?.rows).toEqual([{ id: "c2", status: "closed" }]);
  });

  it("rejects malformed successful responses", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("not-json", {
        status: 200,
        headers: { "content-type": "application/json", ...upToDate },
      }),
    );

    await expect(
      transport(fetchImpl as unknown as typeof fetch).fetch(null),
    ).rejects.toBeInstanceOf(SyntaxError);
  });

  it("rejects successful non-array protocol payloads", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ unexpected: true }), {
        status: 200,
        headers: { "content-type": "application/json", ...upToDate },
      }),
    );

    await expect(
      transport(fetchImpl as unknown as typeof fetch).fetch(null),
    ).rejects.toThrow("non-array payload");
  });

  it("skips control messages, which carry no row", async () => {
    const fetchImpl = vi.fn(async () =>
      shapeResponse(
        [
          { headers: { control: "up-to-date" } },
          { headers: { operation: "insert" }, value: { id: "c1" } },
        ],
        upToDate,
      ),
    );
    const revision = await transport(fetchImpl as unknown as typeof fetch).fetch(null);
    expect(revision?.tables[0]?.rows).toEqual([{ id: "c1" }]);
  });

  it("flags must-refetch on a 409 and yields no rows", async () => {
    // The server is asserting this cursor's history is gone. Applying rows
    // anyway would layer them onto a replica they no longer describe.
    const fetchImpl = vi.fn(async () =>
      shapeResponse([], { "electric-handle": "h2" }, 409),
    );
    const revision = await transport(fetchImpl as unknown as typeof fetch).fetch(null);
    expect(revision?.mustRefetch).toBe(true);
    expect(revision?.tables).toEqual([]);
  });

  it("flags must-refetch on the header even with a 200", async () => {
    const fetchImpl = vi.fn(async () =>
      shapeResponse([], { "electric-must-refetch": "true", "electric-handle": "h2" }),
    );
    const revision = await transport(fetchImpl as unknown as typeof fetch).fetch(null);
    expect(revision?.mustRefetch).toBe(true);
  });

  it("raises on 401 rather than retrying a dead grant", async () => {
    const response = new Response("private upstream denial detail", { status: 401 });
    const fetchImpl = vi.fn(async () => response);
    await expect(transport(fetchImpl as unknown as typeof fetch).fetch(null)).rejects.toMatchObject({
      name: "ShapeAuthorizationError",
      message: "shape cases: shape grant expired — the session must be re-established",
    });
    expect(response.bodyUsed).toBe(false);
  });

  it("raises on 204 because a non-live facade request timed out revalidating authority", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    await expect(transport(fetchImpl as unknown as typeof fetch).fetch(null)).rejects.toMatchObject({
      status: 204,
    });
  });

  it("raises on 403 — a revoked grant is not a transient failure", async () => {
    const response = new Response("private upstream denial detail", { status: 403 });
    const fetchImpl = vi.fn(async () => response);
    await expect(transport(fetchImpl as unknown as typeof fetch).fetch(null)).rejects.toMatchObject({
      name: "ShapeAuthorizationError",
      message: "shape cases: shape access forbidden — the grant no longer covers this shape",
    });
    expect(response.bodyUsed).toBe(false);
  });

  it("reports caught-up once every shape is up to date with no rows", async () => {
    const fetchImpl = vi.fn(async () => shapeResponse([], upToDate));
    const t = transport(fetchImpl as unknown as typeof fetch);
    await expect(t.fetch(null)).resolves.toMatchObject({
      checkpoint: { cases: { handle: "h1", offset: "5" } },
    });
    expect(await t.fetch(null)).toBeNull();
  });

  it("starts a fresh authorized continuation pass after catch-up", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(shapeResponse([], {
        "electric-handle": "h1",
        "electric-offset": "5",
      }))
      .mockResolvedValueOnce(shapeResponse([
        { headers: { operation: "update" }, value: { id: "c1", status: "closed" } },
      ], {
        "electric-handle": "h1",
        "electric-offset": "6",
      }));
    const t = transport(fetchImpl as unknown as typeof fetch);

    await expect(t.fetch(null)).resolves.toBeTruthy();
    await expect(t.fetch(null)).resolves.toBeNull();
    const next = await t.fetch({
      generation: 1,
      shapes: { cases: { handle: "h1", offset: "5" } },
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(next?.tables[0]?.rows).toEqual([{ id: "c1", status: "closed" }]);
    expect(next?.tables[0]?.rows[0]?.[CHUNK_ROW_OPERATION]).toBe("update");
    const continuationUrl = new URL((fetchImpl.mock.calls[1] as unknown as [string])[0]);
    expect(continuationUrl.searchParams.get("offset")).toBe("5");
  });

  it("discards the concurrent pass once one shape signals must-refetch", async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.includes("shape=cases")
        ? shapeResponse([], { "electric-handle": "h2" }, 409)
        : shapeResponse([], upToDate),
    );
    const t = createFrfShapeTransport({
      gateUrl: "https://gate.example",
      shapes: [
        { shape: "cases", target: cases },
        { shape: "document_statuses", target: { table: "document_statuses", columns: ["id"] } },
      ],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const revision = await t.fetch(null);
    expect(revision).toMatchObject({ mustRefetch: true, tables: [] });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
