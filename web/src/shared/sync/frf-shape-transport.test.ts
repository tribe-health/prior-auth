/**
 * The request contract is the thing worth testing.
 *
 * FRF's catalog sets `allowed_params: []` for every ASO shape, so any parameter
 * beyond the shape id and the protocol cursor is a 400. These assert what the
 * client sends — and just as importantly, what it does not.
 */
import { describe, expect, it, vi } from "vitest";

import {
  ShapeAuthorizationError,
  createFrfShapeTransport,
} from "./frf-shape-transport";
import type { TableTarget } from "./chunk-writer";

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
    headers: { "content-type": "application/json", ...headers },
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
    await t.fetch({ handle: "h1", offset: "5", generation: 1 });

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
    await t.fetch(null);
    await t.fetch({ handle: "h9", offset: "42", generation: 1 });

    const second = new URL((fetchImpl.mock.calls[1] as unknown as [string])[0]);
    expect(second.searchParams.get("handle")).toBe("h9");
    expect(second.searchParams.get("offset")).toBe("42");
  });

  it("returns rows from insert messages", async () => {
    const fetchImpl = vi.fn(async () =>
      shapeResponse(
        [
          { headers: { operation: "insert" }, value: { id: "c1", status: "open" } },
          { headers: { operation: "update" }, value: { id: "c2", status: "closed" } },
        ],
        upToDate,
      ),
    );
    const revision = await transport(fetchImpl as unknown as typeof fetch).fetch(null);
    expect(revision?.tables[0]?.rows).toHaveLength(2);
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
    const fetchImpl = vi.fn(async () => new Response("", { status: 401 }));
    await expect(transport(fetchImpl as unknown as typeof fetch).fetch(null)).rejects.toBeInstanceOf(
      ShapeAuthorizationError,
    );
  });

  it("raises on 403 — a revoked grant is not a transient failure", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 403 }));
    await expect(transport(fetchImpl as unknown as typeof fetch).fetch(null)).rejects.toBeInstanceOf(
      ShapeAuthorizationError,
    );
  });

  it("reports caught-up once every shape is up to date with no rows", async () => {
    const fetchImpl = vi.fn(async () => shapeResponse([], upToDate));
    const t = transport(fetchImpl as unknown as typeof fetch);
    expect(await t.fetch(null)).toBeNull();
  });

  it("stops fetching further shapes once one signals must-refetch", async () => {
    // No point filling a replica that is about to be cleared.
    const fetchImpl = vi.fn(async (url: string) =>
      url.includes("shape=cases")
        ? shapeResponse([], { "electric-handle": "h2" }, 409)
        : shapeResponse([], upToDate),
    );
    const t = createFrfShapeTransport({
      gateUrl: "https://gate.example",
      shapes: [
        { shape: "cases", target: cases },
        { shape: "documents", target: { table: "documents", columns: ["id"] } },
      ],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const revision = await t.fetch(null);
    expect(revision?.mustRefetch).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
