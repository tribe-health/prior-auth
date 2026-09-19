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
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  OMITTED_COLUMNS,
  PGLITE_ANNOTATION_TYPES_SQL,
  PGLITE_CASE_SUMMARY_SQL,
  PGLITE_CURRENT_SCHEMA_SQL,
  PGLITE_DOCUMENT_STATUS_SQL,
  PGLITE_SCHEMA_SQL,
  PGLITE_SOURCE_HASH_SQL,
  PGLITE_TABLES,
} from "./pglite-schema";
import { CHECKPOINT_SCHEMA_SQL } from "./replica-wiring";

const CURRENT_SCHEMA_SQL = PGLITE_CURRENT_SCHEMA_SQL;
let database: PGlite;

beforeAll(async () => {
  database = new PGlite();
  await database.waitReady;
  await database.exec(CURRENT_SCHEMA_SQL);
});

afterAll(async () => {
  await database.close();
});

/** Tables present after the complete immutable migration sequence. */
async function currentTables(): Promise<string[]> {
  const result = await database.query<{ table_name: string }>(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name`,
  );
  return result.rows.map(({ table_name }) => table_name);
}

describe("PGlite schema is a deliberate subset", () => {
  it("creates exactly the seven declared tables", async () => {
    expect(await currentTables()).toEqual([...PGLITE_TABLES].sort());
    expect(CURRENT_SCHEMA_SQL).not.toMatch(/\bUNLOGGED\b/);
  });

  it("carries no undeclared patient, source-text, or embedding table", async () => {
    const forbidden = /patient|embedding|vector|chunk|corpus|letter|note/i;
    const offenders = (await currentTables()).filter((t) => forbidden.test(t));
    expect(offenders).toEqual([]);
  });

  it("omits every column recorded in OMITTED_COLUMNS", async () => {
    for (const [table, omissions] of Object.entries(OMITTED_COLUMNS)) {
      const result = await database.query<{ column_name: string }>(
        `SELECT column_name
           FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1`,
        [table],
      );
      const columns = new Set(result.rows.map(({ column_name }) => column_name));
      expect(columns.size, `no columns found for ${table}`).toBeGreaterThan(0);

      for (const { column, reason } of omissions) {
        expect(
          columns.has(column),
          `${table}.${column} is present but omitted for: ${reason}`,
        ).toBe(false);
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
    expect(CURRENT_SCHEMA_SQL).not.toMatch(/^\s*quote\s/mi);
    expect(CURRENT_SCHEMA_SQL).not.toMatch(/^\s*rationale\s/mi);
  });

  it("keeps the three evidence states as a foreign key, not a free string", () => {
    // ADR-003: `void` is not a weak `gap`. A text column with no reference
    // would let a fourth state appear locally.
    expect(CURRENT_SCHEMA_SQL).toMatch(/state\s+TEXT NOT NULL REFERENCES evidence_states\(key\)/);
  });
});

describe("PGlite schema upgrades", () => {
  it("cuts a populated revision-5 replica over before adding required case columns", async () => {
    const upgrade = new PGlite();
    await upgrade.waitReady;
    try {
      await upgrade.exec([
        PGLITE_SCHEMA_SQL,
        CHECKPOINT_SCHEMA_SQL,
        PGLITE_ANNOTATION_TYPES_SQL,
        PGLITE_SOURCE_HASH_SQL,
      ].join("\n"));
      await upgrade.exec(`
        INSERT INTO evidence_states (key, label, meaning)
        VALUES ('met', 'Met', 'Synthetic satisfied criterion');
        INSERT INTO cases (
          id, practice_id, status, gate_affirmed_at, created_at, updated_at
        ) VALUES (
          '00000000-0000-0000-0000-000000000001',
          '00000000-0000-0000-0000-000000000002',
          'intake', NULL, now(), now()
        );
        INSERT INTO case_evidence (
          id, practice_id, case_id, policy_criterion_id, state, assessed_at,
          created_at, updated_at
        ) VALUES (
          '00000000-0000-0000-0000-000000000003',
          '00000000-0000-0000-0000-000000000002',
          '00000000-0000-0000-0000-000000000001',
          '00000000-0000-0000-0000-000000000004',
          'met', now(), now(), now()
        );
        INSERT INTO evidence_citations (
          id, practice_id, case_evidence_id, document_id, page_number,
          relevance, created_at
        ) VALUES (
          '00000000-0000-0000-0000-000000000005',
          '00000000-0000-0000-0000-000000000002',
          '00000000-0000-0000-0000-000000000003',
          '00000000-0000-0000-0000-000000000006',
          1, 'Synthetic citation', now()
        );
        INSERT INTO documents (
          id, practice_id, document_type_id, case_id, name, effective_date,
          page_count, content_sha256
        ) VALUES (
          '00000000-0000-0000-0000-000000000006',
          '00000000-0000-0000-0000-000000000002',
          '00000000-0000-0000-0000-000000000007',
          '00000000-0000-0000-0000-000000000001',
          'Synthetic source', '2026-09-18', 1, '\\xabab'
        );
        INSERT INTO _replica_checkpoints (key, value, checkpoint)
        VALUES ('synthetic-scope', 'transaction', '{"generation":4,"shapes":{"cases":{"handle":"old","offset":"1"}}}');
      `);

      await upgrade.exec(PGLITE_CASE_SUMMARY_SQL);
      await upgrade.exec(PGLITE_DOCUMENT_STATUS_SQL);

      const counts = await upgrade.query<{ table_name: string; row_count: number }>(`
        SELECT table_name, row_count::int
          FROM (
            VALUES
              ('cases', (SELECT count(*) FROM cases)),
              ('case_evidence', (SELECT count(*) FROM case_evidence)),
              ('evidence_citations', (SELECT count(*) FROM evidence_citations)),
              ('document_statuses', (SELECT count(*) FROM document_statuses)),
              ('_replica_checkpoints', (SELECT count(*) FROM _replica_checkpoints))
          ) AS counts(table_name, row_count)
         ORDER BY table_name
      `);
      expect(counts.rows).toEqual([
        { table_name: "_replica_checkpoints", row_count: 0 },
        { table_name: "case_evidence", row_count: 0 },
        { table_name: "cases", row_count: 0 },
        { table_name: "document_statuses", row_count: 0 },
        { table_name: "evidence_citations", row_count: 0 },
      ]);

      await expect(upgrade.exec(`
        INSERT INTO cases (
          id, practice_id, case_number, patient_id, surgeon_id, coordinator_id,
          payer_id, status, date_of_service, gate_affirmed_at, updated_at, revision
        ) VALUES (
          '00000000-0000-0000-0000-000000000011',
          '00000000-0000-0000-0000-000000000012',
          'SYNTHETIC-CASE-UPGRADED',
          '00000000-0000-0000-0000-000000000013',
          '00000000-0000-0000-0000-000000000014',
          NULL,
          '00000000-0000-0000-0000-000000000015',
          'intake', NULL, NULL, now(), 1
        );
      `)).resolves.toBeDefined();
    } finally {
      await upgrade.close();
    }
  });
});
