// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { writeChunk, type TableTarget, type WriterClient } from "./chunk-writer";
import { createFrfShapeTransport } from "./frf-shape-transport";

const cases: TableTarget = {
  table: "cases",
  columns: ["id", "status"],
};

const protocolHeaders = {
  "content-type": "application/json",
  "electric-handle": "cases-handle",
  "electric-offset": "17",
  "electric-up-to-date": "",
};

function interruptedResponse(): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('[{"headers":{"operation":"insert"},"value":{"id":"case-1"'));
      controller.error(new Error("synthetic response interruption"));
    },
  });
  return new Response(body, { status: 200, headers: protocolHeaders });
}

function completeResponse(row: Record<string, unknown>): Response {
  return new Response(JSON.stringify([
    { headers: { operation: "insert" }, value: row },
  ]), { status: 200, headers: protocolHeaders });
}

function transport(fetchImpl: typeof fetch) {
  return createFrfShapeTransport({
    gateUrl: "https://gate.example",
    shapes: [{ shape: "cases", target: cases }],
    fetchImpl,
  });
}

describe("protected browser replica boundaries", () => {
  it("does not advance a cursor or expose rows from an interrupted response body", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(interruptedResponse())
      .mockResolvedValueOnce(completeResponse({ id: "case-1", status: "intake" }));
    const replica = transport(fetchImpl as unknown as typeof fetch);

    await expect(replica.fetch(null)).rejects.toThrow("synthetic response interruption");
    const recovered = await replica.fetch(null);

    const recoveryUrl = new URL((fetchImpl.mock.calls[1] as unknown as [string])[0]);
    expect([...recoveryUrl.searchParams.entries()]).toEqual([["shape", "cases"]]);
    expect(recovered?.checkpoint).toEqual({
      cases: { handle: "cases-handle", offset: "17" },
    });
    expect(recovered?.tables[0]?.rows).toEqual([{ id: "case-1", status: "intake" }]);
  });

  it("drops forbidden and local-only fields before the shape row reaches SQL", async () => {
    const fetchImpl = vi.fn(async () => completeResponse({
      id: "case-1",
      status: "intake",
      member_id: "forbidden-canary",
      procedure_code: "forbidden-canary",
      plan_key: "forbidden-canary",
      local_embedding: "local-only-canary",
    }));
    const revision = await transport(fetchImpl as unknown as typeof fetch).fetch(null);
    const statements: Array<{ sql: string; params: unknown[] }> = [];
    const client: WriterClient = {
      async exec() {
        return undefined;
      },
      async query(sql, params = []) {
        statements.push({ sql, params });
        return { rows: [] };
      },
    };

    await writeChunk(client, cases, revision?.tables[0]?.rows ?? []);

    expect(statements).toHaveLength(1);
    expect(statements[0]?.sql).not.toContain("member_id");
    expect(statements[0]?.sql).not.toContain("procedure_code");
    expect(statements[0]?.sql).not.toContain("plan_key");
    expect(statements[0]?.sql).not.toContain("local_embedding");
    expect(statements[0]?.params).toEqual(["case-1", "intake"]);
  });
});
