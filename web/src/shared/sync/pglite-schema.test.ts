/**
 * The PHI exclusion test.
 *
 * ADR-007 states plainly that the PGlite schema has **no runtime enforcement** —
 * it is a build-time decision plus this test. If someone adds a table or a
 * column without reading that ADR, this is what catches it.
 *
 * PGlite lacking pgvector means an embedding table could not sync even by
 * accident. That is a coincidence, not a control, and it is why these
 * assertions are about the whole schema rather than only vectors.
 */
import { describe, expect, it } from "vitest";

import {
  OMITTED_COLUMNS,
  PGLITE_SCHEMA_SQL,
  PGLITE_TABLES,
} from "./pglite-schema";

/** Table names the DDL actually creates. */
function tablesInSchema(sql: string): string[] {
  return [...sql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map((m) => m[1]).sort();
}

describe("PGlite schema is a deliberate subset", () => {
  it("creates exactly the five declared tables — a sixth fails here", () => {
    expect(tablesInSchema(PGLITE_SCHEMA_SQL)).toEqual([...PGLITE_TABLES].sort());
  });

  it("carries no table whose name suggests PHI or embeddings", () => {
    const forbidden = /patient|embedding|vector|chunk|corpus|annotation|letter|note/i;
    const offenders = tablesInSchema(PGLITE_SCHEMA_SQL).filter((t) => forbidden.test(t));
    expect(offenders).toEqual([]);
  });

  it("omits every column recorded in OMITTED_COLUMNS", () => {
    for (const [table, omissions] of Object.entries(OMITTED_COLUMNS)) {
      const ddl = PGLITE_SCHEMA_SQL.match(
        new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\(([^;]*)\\)`, "s"),
      )?.[1];
      expect(ddl, `no DDL found for ${table}`).toBeDefined();

      for (const { column, reason } of omissions) {
        // Word-boundary match: `data` must not match `effective_date`.
        const present = new RegExp(`^\\s*${column}\\s+\\w`, "mi").test(ddl!);
        expect(present, `${table}.${column} is present but omitted for: ${reason}`).toBe(false);
      }
    }
  });

  it("every omission carries a stated reason", () => {
    for (const omissions of Object.values(OMITTED_COLUMNS)) {
      for (const { column, reason } of omissions) {
        expect(reason.length, `${column} has no reason`).toBeGreaterThan(20);
      }
    }
  });

  it("never stores verbatim chart text — the two columns that would", () => {
    // evidence_citations.quote and case_evidence.rationale are the plainest
    // PHI in the evidence path. Asserted by name so a rename does not silently
    // reintroduce them under a different label.
    expect(PGLITE_SCHEMA_SQL).not.toMatch(/^\s*quote\s/mi);
    expect(PGLITE_SCHEMA_SQL).not.toMatch(/^\s*rationale\s/mi);
  });

  it("keeps the three evidence states as a foreign key, not a free string", () => {
    // ADR-003: `void` is not a weak `gap`. A text column with no reference
    // would let a fourth state appear locally.
    expect(PGLITE_SCHEMA_SQL).toMatch(/state\s+TEXT NOT NULL REFERENCES evidence_states\(key\)/);
  });
});
