# Independent assessment critic

Date: 2026-09-06. Reviewer: artifact-critic task, reused from the earlier prototype inventory after a fresh spawn hit the harness thread limit. It received the assessment path and review mandate, without this assessment's generation history. Prior prototype context remained in that task; this is not a fresh-context model call. The separate REST judge supplies that isolation.

Result: 0 CRITICAL, 0 WARNING, 1 SUGGESTION. Source checks were selective; the critic did not reproduce historical diagnostics or every companion assertion.

Checked classes: caller-selected signing identity and permissive memory authority; unused adapter and missing materialization; synthetic offsets; discarded lifecycle handle; stale runtime scope; Kratos exchange limitation; missing FRF shape route; Forge/ASO context mismatch; native transport parity; citation/evidence-state conflation; source versus runtime evidence; first-row delivery versus release certification.

## C1 — Reference-table identity mismatch

The ASO evidence_states table uses primary key `key`, but the existing table configuration supplies no idColumn in `web/src/shared/sync/electric-shapes.ts:135`. PEM `packages/entity-graph-core/src/adapters/electricsql.ts:67` defaults to `id`; line 68 converts the missing property with String(...), yielding the nonempty string `undefined`. If the existing adapter is connected, the three reference records can collide in one graph identity.

Disposition: accepted as a concrete normalization requirement for planning. The root independently read the PEM conversion and confirmed the default and coercion. This is source evidence, not an executed replication test. Verify all three met/gap/void reference entities and their distinct IDs at the committed projection boundary; the first-row proof alone can miss this defect. No application fix was made.

Read this supplement with assessment.md and carry C1 into the planning handoff.
