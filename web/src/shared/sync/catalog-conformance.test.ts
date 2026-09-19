/**
 * The FRF shape catalog and this replica's schema must agree, column for
 * column.
 *
 * They are two independently maintained descriptions of the same PHI boundary,
 * in different repositories, in different languages. The integration note names
 * the consequence directly: *"Catalog drift remains a real operational risk, so
 * final certification must compare the FRF catalog with `pglite-schema.ts` and
 * the local materializer."*
 *
 * Drift is silent in the dangerous direction. A column the catalog grants but
 * the local schema lacks is dropped by `writeChunk`'s projection — the data
 * simply never appears, and no error is raised. That is exactly how
 * `cases.gate_affirmed_at` went missing until this test was written.
 *
 * This reads the deployed catalog rather than a copy, so a change on either
 * side breaks the build instead of being discovered in production.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SYNC_COLUMNS } from "./electric-shapes";
import { PGLITE_CURRENT_SCHEMA_SQL, PGLITE_TABLES } from "./pglite-schema";

interface CatalogShape {
  table: string;
  columns: string[];
  allowed_params?: string[];
}

// Vitest runs with the `web` package as cwd, so the deployed catalog sits one
// level up. Read the real file, not a copy — a copy would drift too.
const catalogPath = resolve(process.cwd(), "../docker/frf/shape-catalog.json");

function loadCatalog(): Record<string, CatalogShape> {
  const raw: unknown = JSON.parse(readFileSync(catalogPath, "utf8"));
  const shapes = (raw as { shapes?: unknown }).shapes ?? raw;
  if (Array.isArray(shapes)) {
    return Object.fromEntries(
      (shapes as Array<CatalogShape & { id: string }>).map((s) => [s.id, s]),
    );
  }
  return shapes as Record<string, CatalogShape>;
}

let database: PGlite;

beforeAll(async () => {
  database = new PGlite();
  await database.waitReady;
  await database.exec(PGLITE_CURRENT_SCHEMA_SQL);
});

afterAll(async () => {
  await database.close();
});

/** Columns present after every current migration, in ordinal order. */
async function schemaColumns(table: string): Promise<string[]> {
  const result = await database.query<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position`,
    [table],
  );
  return result.rows.map(({ column_name }) => column_name);
}

describe("FRF catalog conformance", () => {
  const catalog = loadCatalog();

  it("declares a shape for every table this replica syncs", () => {
    // A table with no shape can never be filled; a shape with no table would
    // deliver rows nothing can hold.
    const catalogTables = Object.values(catalog).map((s) => s.table.replace(/^aso\./, ""));
    expect([...catalogTables].sort()).toEqual([...PGLITE_TABLES].sort());
  });

  it("grants exactly the columns the migrated local schema can hold", async () => {
    // The drift that matters. A granted column with nowhere to land is dropped
    // silently by the writer's projection — no error, just missing data.
    for (const [id, shape] of Object.entries(catalog)) {
      const table = shape.table.replace(/^aso\./, "");
      const local = await schemaColumns(table);
      expect(
        [...shape.columns].sort(),
        `catalog shape "${id}" and local table "${table}" disagree`,
      ).toEqual([...local].sort());
    }
  });

  it("keeps the requested column set in step with the catalog", () => {
    // SYNC_COLUMNS is what the client would ask for. It must not exceed the
    // grant, and must not fall short of what the schema stores.
    for (const shape of Object.values(catalog)) {
      const table = shape.table.replace(/^aso\./, "") as keyof typeof SYNC_COLUMNS;
      const requested = SYNC_COLUMNS[table];
      if (!requested) continue;
      expect([...requested].sort(), `SYNC_COLUMNS.${table} drifted from the catalog`).toEqual(
        [...shape.columns].sort(),
      );
    }
  });

  it("allows no narrowing parameters — the client may not choose its own rows", () => {
    // ADR-009: rows, columns and scope are derived server-side from verified
    // identity. An allowed param would be a client-supplied predicate, which is
    // the thing the facade exists to prevent.
    for (const [id, shape] of Object.entries(catalog)) {
      expect(shape.allowed_params ?? [], `shape "${id}" must allow no narrowing params`).toEqual(
        [],
      );
    }
  });

  it("names base tables, never views", () => {
    // Measured against a live stack: a view returns 400 "does not exist",
    // because it emits no WAL of its own and can never join a publication.
    for (const [id, shape] of Object.entries(catalog)) {
      expect(shape.table, `shape "${id}" must name a base table`).not.toMatch(/sync_|_view$/);
    }
  });
});
