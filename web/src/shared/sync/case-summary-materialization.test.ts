import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

import { writeChunk } from "./chunk-writer";
import { SYNC_COLUMNS } from "./electric-shapes";
import { PGLITE_CURRENT_SCHEMA_SQL } from "./pglite-schema";
import {
  REPLICA_LIST_BINDINGS,
  REPLICA_TABLE_BINDINGS,
  REPLICA_TARGETS,
} from "./replica-wiring";

const CASE_ID = "00000000-0000-0000-0000-000000000001";

describe("case summary materialization", () => {
  it("projects an over-wide transport row onto the approved PEM case summary", async () => {
    const database = new PGlite();
    try {
      await database.waitReady;
      await database.exec(PGLITE_CURRENT_SCHEMA_SQL);

      const target = REPLICA_TARGETS.find(({ table }) => table === "cases");
      expect(target).toEqual({
        table: "cases",
        columns: SYNC_COLUMNS.cases,
        idColumn: "id",
      });

      await writeChunk(database, target!, [
        {
          id: CASE_ID,
          practice_id: "00000000-0000-0000-0000-000000000002",
          case_number: "SYNTHETIC-CASE-001",
          patient_id: "00000000-0000-0000-0000-000000000003",
          patient_name: "Synthetic Patient Example",
          surgeon_id: "00000000-0000-0000-0000-000000000004",
          surgeon_name: "Dr. Demo Surgeon",
          coordinator_id: null,
          payer_id: "00000000-0000-0000-0000-000000000005",
          payer_name: "Synthetic Health Plan",
          status: "intake",
          date_of_service: "2026-09-17",
          gate_affirmed_at: null,
          updated_at: "2026-09-17T12:00:00Z",
          revision: 1,
          member_id: "must-not-materialize",
          procedure_code: "must-not-materialize",
          plan_key: "must-not-materialize",
          data: { protected: "must-not-materialize" },
          gate_affirmed_by: "00000000-0000-0000-0000-000000000006",
          created_at: "2026-09-17T11:00:00Z",
        },
      ]);

      const result = await database.query<Record<string, unknown>>(
        "SELECT * FROM cases WHERE id = $1",
        [CASE_ID],
      );
      expect(result.rows).toHaveLength(1);
      expect(Object.keys(result.rows[0]!).sort()).toEqual([...SYNC_COLUMNS.cases].sort());
      expect(result.rows[0]).toMatchObject({
        id: CASE_ID,
        case_number: "SYNTHETIC-CASE-001",
        patient_name: "Synthetic Patient Example",
        payer_name: "Synthetic Health Plan",
        surgeon_name: "Dr. Demo Surgeon",
        status: "intake",
        revision: 1,
      });

      expect(
        REPLICA_TABLE_BINDINGS.find(({ table }) => table === "cases"),
      ).toEqual({ table: "cases", type: "Case", primaryKey: "id" });
      expect(REPLICA_LIST_BINDINGS.find(({ table }) => table === "cases")).toEqual({
        key: "replica:cases",
        table: "cases",
      });
    } finally {
      await database.close();
    }
  });
});
