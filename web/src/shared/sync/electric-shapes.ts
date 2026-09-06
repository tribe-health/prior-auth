/**
 * Electric shape definitions for the local store.
 *
 * Reads flow: Postgres → Electric shapes → PGlite → entity graph.
 * Writes do NOT flow here. They go through the Axum API, because that is where
 * clinical authority is checked (ADR-002, ADR-007). A write path through the
 * shape stream would bypass the second of ADR-002's three layers.
 *
 * ── Why the tenant-scoped adapter ───────────────────────────────────────────
 *
 * `createTenantScopedElectricAdapter` refuses to attach a shape whose
 * `tenantColumn` is `undefined`, and refuses a `companyId` that is not a UUID.
 * It **fails closed**: a table added without a tenant decision throws at
 * construction rather than syncing every practice's rows.
 *
 * That property is the whole reason to prefer it over `createElectricAdapter`.
 * PGlite has no row-level security, so a shape without a predicate is the
 * entire table, for everyone.
 *
 * Here the tenant is the **practice** — this is a practice-boundary deployment
 * (`docs/aso-mvp-spec.html`), and `practice_id` is the scoping column.
 */
import type { PGlite } from "@electric-sql/pglite";
import { ShapeStream } from "@electric-sql/client";
import { createTenantScopedElectricAdapter } from "@prometheus-ags/entity-graph-react";

import { PGLITE_TABLES, type PGliteTable } from "./pglite-schema";

/**
 * How each synced table reaches its practice.
 *
 * `null` means "this row IS the tenant root, filter by id". The adapter accepts
 * explicit `null` and **rejects `undefined`**, so every entry here is a
 * deliberate answer to "how does a row in this table belong to a practice?"
 */
export const TENANT_COLUMNS: Record<PGliteTable, string | null> = {
  cases: "practice_id",

  // These carry `practice_id` as a REAL COLUMN, denormalized from their
  // parent and kept correct by forced triggers —
  // docker/bootstrap/15-denormalize-practice-id.sql. A caller cannot set it
  // and cannot lie about it: the trigger overwrites the value from the parent
  // on INSERT and on any write that touches practice_id or the parent key.
  case_evidence: "practice_id",
  evidence_citations: "practice_id",
  documents: "practice_id",

  // Reference data: the closed three-member set from ADR-003 — `key`, `label`,
  // `meaning`. No patient data, not practice-scoped. Explicit `null` rather
  // than omitted, so the adapter's fail-closed check still sees a decision.
  evidence_states: null,
};

/**
 * The relation Electric serves for each table.
 *
 * **Base tables, not views.** Measured against a live stack 2026-09-05:
 *
 *     GET /v1/shape?table=aso.sync_cases  -> 400 "does not exist"
 *     GET /v1/shape?table=aso.cases       -> 200 snapshot-end    [control]
 *
 * Electric replicates from the Postgres logical replication stream. A view
 * emits no WAL of its own, so it can never join a publication; materialized
 * views fail identically, and Postgres says so outright — "cannot add
 * relation ... not supported for materialized views". This is structural, not
 * a configuration gap, and it is why `20-electric-sync-views.sql` could not
 * work as the sync path.
 */
const SYNC_RELATIONS: Record<PGliteTable, string> = {
  cases: "aso.cases",
  case_evidence: "aso.case_evidence",
  evidence_states: "aso.evidence_states",
  evidence_citations: "aso.evidence_citations",
  documents: "aso.documents",
};

/**
 * The columns Electric is asked for, per table — the PHI boundary.
 *
 * With views gone, the column projection moves to the shape request itself.
 * Verified against a canary row 2026-09-05: an UNPROJECTED shape shipped
 * `author_name`, `patient_id` and `storage_uri` on the wire, while the
 * PROJECTED shape returned the same row carrying only the listed columns.
 *
 * This list must stay in step with `pglite-schema.ts` — the local store has no
 * column to put an unlisted value in, but relying on that would make the
 * boundary an accident of the schema rather than a decision. Every column
 * absent here is absent for a reason recorded in `OMITTED_COLUMNS`.
 */
const SYNC_COLUMNS: Record<PGliteTable, readonly string[]> = {
  cases: ["id", "practice_id", "status", "created_at", "updated_at"],
  case_evidence: [
    "id", "practice_id", "case_id", "policy_criterion_id",
    "state", "assessed_at", "created_at", "updated_at",
  ],
  evidence_citations: [
    "id", "practice_id", "case_evidence_id", "document_id",
    "page_number", "relevance", "created_at",
  ],
  documents: [
    "id", "practice_id", "document_type_id", "case_id",
    "name", "effective_date", "page_count", "content_sha256",
  ],
  evidence_states: ["key", "label", "meaning"],
};

/** Entity type name in the graph, per table. */
const ENTITY_TYPES: Record<PGliteTable, string> = {
  cases: "Case",
  case_evidence: "CaseEvidence",
  evidence_states: "EvidenceState",
  evidence_citations: "EvidenceCitation",
  documents: "Document",
};

export interface EvidenceSyncOptions {
  pglite: PGlite;
  /** The practice this session belongs to. Must be a UUID or the adapter throws. */
  practiceId: string;
  /** Electric service URL, e.g. `http://localhost:3000` in the compose stack. */
  electricUrl: string;
  onSynced?: () => void;
}

/**
 * Build the read-path sync adapter for the evidence timeline.
 *
 * Throws if any table lacks a tenant decision, or the practice id is not a
 * UUID. **That throw is the feature**, not an inconvenience to work around.
 */
export function createEvidenceSyncAdapter(opts: EvidenceSyncOptions) {
  return createTenantScopedElectricAdapter({
    pglite: opts.pglite,
    tenantClaim: { companyId: opts.practiceId },
    tables: PGLITE_TABLES.map((table) => ({
      type: ENTITY_TYPES[table],
      table,
      tenantColumn: TENANT_COLUMNS[table],
      // The adapter builds `where` from tenantColumn + companyId and requires
      // it be used verbatim. Widening it here would defeat the safety gate.
      shapeStreamFactory: ({ where }) =>
        adaptShapeStream(
          new ShapeStream({
            url: `${opts.electricUrl}/v1/shape`,
            // The base table with an explicit column projection — Electric
            // cannot serve a view. See SYNC_RELATIONS and SYNC_COLUMNS above.
            params: {
              table: SYNC_RELATIONS[table],
              // The client takes an array; it serializes to `columns=a,b,c`.
              columns: [...SYNC_COLUMNS[table]],
              where,
            },
          }),
        ),
    })),
    onSynced: opts.onSynced,
  });
}

/**
 * Bridge between `@electric-sql/client@1.5.x` and the entity graph's expected
 * `ShapeStream` shape.
 *
 * **These two versions genuinely disagree**, and the disagreement is recorded
 * here rather than erased with a cast at the call site.
 *
 * `entity-graph-core@4.0.0` declares a structural minimum:
 *
 *     interface ShapeMessage { headers: {...}; offset: string; value: T; key: string }
 *
 * `@electric-sql/client@1.5.27` has no per-message `offset` — `ChangeMessage`
 * is `{ key, value, old_value?, headers }`, and `offset` became a *stream
 * option* (`Offset = "-1" | "now" | \`${number}_${number}\``) used to resume a
 * stream, not a field on each change.
 *
 * The entity graph never reads `offset`; it needs `key`, `value` and
 * `headers.operation` to upsert. So the bridge supplies a stable synthetic
 * offset and forwards everything else untouched.
 *
 * If PEM's type is relaxed to make `offset` optional, delete this function and
 * pass the ShapeStream directly. Until then, this is the seam that keeps the
 * incompatibility visible and in one place.
 */
type GraphShapeStream = Parameters<
  typeof createTenantScopedElectricAdapter
>[0]["tables"][number] extends { shapeStreamFactory: (p: never) => infer R }
  ? R
  : never;

function adaptShapeStream(
  stream: ShapeStream<Record<string, unknown>>,
): GraphShapeStream {
  const adapted = {
    ...stream,
    subscribe(
      onMsg: (
        msgs: {
          headers: { operation: "insert" | "update" | "delete" };
          offset: string;
          value: Record<string, unknown>;
          key: string;
        }[],
      ) => void,
      onErr?: (e: Error) => void,
    ) {
      return stream.subscribe((messages) => {
        const changes = messages.flatMap((m, i) =>
          "key" in m && "value" in m
            ? [
                {
                  key: m.key,
                  value: m.value,
                  headers: {
                    operation: m.headers.operation as "insert" | "update" | "delete",
                  },
                  // Synthetic. The graph never reads it; the type requires it.
                  offset: `${Date.now()}_${i}`,
                },
              ]
            : [],
        );
        if (changes.length > 0) onMsg(changes);
      }, onErr);
    },
  };

  // The one cast in this file, and the reason it exists is the doc comment
  // above: two published packages disagree on a field neither side uses.
  return adapted as unknown as GraphShapeStream;
}
